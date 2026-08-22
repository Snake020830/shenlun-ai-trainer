import type {
  BenchmarkAlignment,
  BenchmarkModelRun,
  GradingBenchmarkCase,
  MappingConfusionCounts,
  MappingQualityMetrics,
  RubricQualityMetrics,
  ScoreCalibrationMetrics,
  TaxonomyQualityMetrics
} from "./types";
import type { ReviewPoint } from "../../types";

function emptyConfusion(): MappingConfusionCounts {
  return {
    hit: { hit: 0, partial: 0, missed: 0 },
    partial: { hit: 0, partial: 0, missed: 0 },
    missed: { hit: 0, partial: 0, missed: 0 }
  };
}

function safeRatio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function harmonicMean(precision: number | null, recall: number | null): number | null {
  if (precision === null || recall === null) return null;
  if (precision + recall === 0) return 0;
  return 2 * precision * recall / (precision + recall);
}

function assertAdjudicated(testCase: GradingBenchmarkCase): void {
  if (testCase.annotationStatus !== "adjudicated") {
    throw new Error(`Benchmark case ${testCase.id} is not adjudicated and cannot be used for evaluation metrics.`);
  }
}

function assertUniqueStrings(values: string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`Duplicate ${label}: ${value}.`);
    seen.add(value);
  }
}

function sameStringSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every(value => rightSet.has(value));
}

function validateModelRun(testCase: GradingBenchmarkCase, run: BenchmarkModelRun): void {
  assertAdjudicated(testCase);
  if (run.caseId !== testCase.id) throw new Error("Model run caseId does not match benchmark case.");
  if (!run.runId.trim()) throw new Error("Model run runId is required.");
  if (run.maxScore !== testCase.question.maxScore) {
    throw new Error(`Model run maxScore ${run.maxScore} does not match benchmark maxScore ${testCase.question.maxScore}.`);
  }
  if (!Number.isFinite(run.predictedScore) || run.predictedScore < 0 || run.predictedScore > run.maxScore) {
    throw new Error(`Predicted score for ${testCase.id} is outside 0..maxScore.`);
  }

  const rubricIds = run.rubric.map(item => item.id);
  assertUniqueStrings(rubricIds, "model-run rubric id");
  const rubricIdSet = new Set(rubricIds);
  const mappingIds = run.mappings.map(item => item.predictedRubricPointId);
  assertUniqueStrings(mappingIds, "model-run mapping rubric id");
  const mappingIdSet = new Set(mappingIds);

  for (const rubricId of rubricIds) {
    if (!mappingIdSet.has(rubricId)) throw new Error(`Model run is missing answer mapping for ${rubricId}.`);
  }
  for (const mappingId of mappingIds) {
    if (!rubricIdSet.has(mappingId)) throw new Error(`Model run mapping references unknown rubric ${mappingId}.`);
  }
}

function validateRubricAlignment(
  testCase: GradingBenchmarkCase,
  run: BenchmarkModelRun,
  alignment: BenchmarkAlignment
): {
  coveredGold: Set<string>;
  supportedPredicted: Set<string>;
  predictedByGold: Map<string, string[]>;
} {
  validateModelRun(testCase, run);
  if (alignment.caseId !== testCase.id) throw new Error("Alignment caseId does not match benchmark case.");
  if (alignment.runId !== run.runId) throw new Error("Alignment runId does not match model run.");

  const goldIds = new Set(testCase.gold.rubric.map(item => item.id));
  const predictedIds = new Set(run.rubric.map(item => item.id));
  const coveredGold = new Set<string>();
  const supportedPredicted = new Set<string>();
  const predictedByGold = new Map<string, string[]>();

  for (const [index, group] of alignment.rubricAlignments.entries()) {
    if (!group.goldRubricPointIds.length || !group.predictedRubricPointIds.length) {
      throw new Error(`Rubric alignment group ${index} must include both gold and predicted ids.`);
    }
    assertUniqueStrings(group.goldRubricPointIds, `gold rubric id inside alignment group ${index}`);
    assertUniqueStrings(group.predictedRubricPointIds, `predicted rubric id inside alignment group ${index}`);

    if (group.relation === "match" && (group.goldRubricPointIds.length !== 1 || group.predictedRubricPointIds.length !== 1)) {
      throw new Error(`Rubric alignment group ${index} relation=match must be 1:1.`);
    }
    if (group.relation === "acceptable-merge" && (group.goldRubricPointIds.length < 2 || group.predictedRubricPointIds.length !== 1)) {
      throw new Error(`Rubric alignment group ${index} acceptable-merge must be many gold to one predicted.`);
    }
    if (group.relation === "acceptable-split" && (group.goldRubricPointIds.length !== 1 || group.predictedRubricPointIds.length < 2)) {
      throw new Error(`Rubric alignment group ${index} acceptable-split must be one gold to many predicted.`);
    }

    for (const goldId of group.goldRubricPointIds) {
      if (!goldIds.has(goldId)) throw new Error(`Rubric alignment references unknown gold rubric ${goldId}.`);
      if (coveredGold.has(goldId)) throw new Error(`Gold rubric ${goldId} appears in multiple alignment groups.`);
      coveredGold.add(goldId);
      predictedByGold.set(goldId, [...group.predictedRubricPointIds]);
    }
    for (const predictedId of group.predictedRubricPointIds) {
      if (!predictedIds.has(predictedId)) throw new Error(`Rubric alignment references unknown model-run rubric ${predictedId}.`);
      if (supportedPredicted.has(predictedId)) throw new Error(`Predicted rubric ${predictedId} appears in multiple alignment groups.`);
      supportedPredicted.add(predictedId);
    }
  }

  return { coveredGold, supportedPredicted, predictedByGold };
}

function validateMappingLinks(
  testCase: GradingBenchmarkCase,
  run: BenchmarkModelRun,
  alignment: BenchmarkAlignment,
  predictedByGold: Map<string, string[]>
): void {
  assertUniqueStrings(alignment.mappingLinks.map(item => item.goldRubricPointId), "answer mapping link");
  const goldIds = new Set(testCase.gold.rubric.map(item => item.id));
  const runRubricIds = new Set(run.rubric.map(item => item.id));

  for (const link of alignment.mappingLinks) {
    if (!goldIds.has(link.goldRubricPointId)) {
      throw new Error(`Answer mapping link references unknown gold rubric ${link.goldRubricPointId}.`);
    }
    const expectedPredicted = predictedByGold.get(link.goldRubricPointId);
    if (!expectedPredicted) {
      throw new Error(`Answer mapping link references gold rubric ${link.goldRubricPointId} that is not covered by rubric alignment.`);
    }
    assertUniqueStrings(link.predictedRubricPointIds, `predicted mapping id for ${link.goldRubricPointId}`);
    for (const predictedId of link.predictedRubricPointIds) {
      if (!runRubricIds.has(predictedId)) throw new Error(`Answer mapping link references unknown model-run rubric ${predictedId}.`);
    }
    if (!sameStringSet(link.predictedRubricPointIds, expectedPredicted)) {
      throw new Error(`Answer mapping link for ${link.goldRubricPointId} does not match its rubric alignment group.`);
    }
  }
}

function aggregatePredictedJudgment(
  run: BenchmarkModelRun,
  predictedRubricPointIds: string[]
): { status: ReviewPoint["status"]; errorCodes: string[] } {
  if (!predictedRubricPointIds.length) throw new Error("Cannot aggregate an empty predicted rubric set.");
  const mappingById = new Map(run.mappings.map(item => [item.predictedRubricPointId, item]));
  const mappings = predictedRubricPointIds.map(id => {
    const mapping = mappingById.get(id);
    if (!mapping) throw new Error(`Model run is missing answer mapping for ${id}.`);
    return mapping;
  });

  const statuses = mappings.map(item => item.status);
  const status: ReviewPoint["status"] = statuses.every(item => item === "hit")
    ? "hit"
    : statuses.every(item => item === "missed")
      ? "missed"
      : "partial";
  const errorCodes = [...new Set(mappings.flatMap(item => item.errorCodes))];
  return { status, errorCodes };
}

export function calculateRubricQuality(
  testCase: GradingBenchmarkCase,
  run: BenchmarkModelRun,
  alignment: BenchmarkAlignment
): RubricQualityMetrics {
  const { coveredGold, supportedPredicted } = validateRubricAlignment(testCase, run, alignment);
  const goldIds = testCase.gold.rubric.map(item => item.id);
  const predictedIds = run.rubric.map(item => item.id);
  const recall = safeRatio(coveredGold.size, goldIds.length);
  const precision = safeRatio(supportedPredicted.size, predictedIds.length);

  return {
    goldPointCount: goldIds.length,
    predictedPointCount: predictedIds.length,
    coveredGoldPointCount: coveredGold.size,
    supportedPredictedPointCount: supportedPredicted.size,
    recall,
    precision,
    f1: harmonicMean(precision, recall),
    unmatchedGoldRubricPointIds: goldIds.filter(id => !coveredGold.has(id)),
    unmatchedPredictedRubricPointIds: predictedIds.filter(id => !supportedPredicted.has(id))
  };
}

export function calculateMappingQuality(
  testCase: GradingBenchmarkCase,
  run: BenchmarkModelRun,
  alignment: BenchmarkAlignment
): MappingQualityMetrics {
  const { predictedByGold } = validateRubricAlignment(testCase, run, alignment);
  validateMappingLinks(testCase, run, alignment, predictedByGold);

  const goldById = new Map(testCase.gold.mappings.map(item => [item.rubricPointId, item]));
  const confusion = emptyConfusion();
  let correct = 0;

  for (const link of alignment.mappingLinks) {
    const gold = goldById.get(link.goldRubricPointId);
    if (!gold) throw new Error(`Gold answer mapping is missing rubric ${link.goldRubricPointId}.`);
    const predicted = aggregatePredictedJudgment(run, link.predictedRubricPointIds);
    confusion[gold.status][predicted.status] += 1;
    if (gold.status === predicted.status) correct += 1;
  }

  return {
    alignedPointCount: alignment.mappingLinks.length,
    goldPointCount: testCase.gold.rubric.length,
    mappingCoverage: safeRatio(alignment.mappingLinks.length, testCase.gold.rubric.length),
    exactStatusAccuracy: safeRatio(correct, alignment.mappingLinks.length),
    confusion
  };
}

export function calculateTaxonomyQuality(
  testCase: GradingBenchmarkCase,
  run: BenchmarkModelRun,
  alignment: BenchmarkAlignment
): TaxonomyQualityMetrics {
  const { predictedByGold } = validateRubricAlignment(testCase, run, alignment);
  validateMappingLinks(testCase, run, alignment, predictedByGold);

  const goldById = new Map(testCase.gold.mappings.map(item => [item.rubricPointId, item]));
  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  let labelDecisionCount = 0;

  for (const link of alignment.mappingLinks) {
    const gold = goldById.get(link.goldRubricPointId);
    if (!gold) throw new Error(`Gold answer mapping is missing rubric ${link.goldRubricPointId}.`);
    const expected = new Set(gold.expectedErrorCodes);
    const predicted = new Set(aggregatePredictedJudgment(run, link.predictedRubricPointIds).errorCodes);
    const universe = new Set([...expected, ...predicted]);
    labelDecisionCount += universe.size;

    for (const code of predicted) {
      if (expected.has(code)) truePositive += 1;
      else falsePositive += 1;
    }
    for (const code of expected) {
      if (!predicted.has(code)) falseNegative += 1;
    }
  }

  const microPrecision = safeRatio(truePositive, truePositive + falsePositive);
  const microRecall = safeRatio(truePositive, truePositive + falseNegative);
  return {
    labelDecisionCount,
    truePositive,
    falsePositive,
    falseNegative,
    microPrecision,
    microRecall,
    microF1: harmonicMean(microPrecision, microRecall)
  };
}

export function calculateScoreCalibration(
  cases: GradingBenchmarkCase[],
  runs: BenchmarkModelRun[]
): ScoreCalibrationMetrics {
  const runsByCase = new Map<string, BenchmarkModelRun>();
  for (const run of runs) {
    if (runsByCase.has(run.caseId)) throw new Error(`Duplicate score model run for benchmark case ${run.caseId}.`);
    runsByCase.set(run.caseId, run);
  }

  const absoluteErrors: number[] = [];
  const squaredErrors: number[] = [];
  const signedErrors: number[] = [];
  const normalizedAbsoluteErrors: number[] = [];
  let observationCount = 0;

  for (const testCase of cases) {
    const run = runsByCase.get(testCase.id);
    if (!run || !testCase.gold.humanScores.length) continue;
    validateModelRun(testCase, run);
    if (testCase.split !== "calibration" && testCase.split !== "holdout") {
      throw new Error(`Benchmark case ${testCase.id} is not in calibration/holdout split and cannot be used for score calibration.`);
    }

    observationCount += testCase.gold.humanScores.length;
    const humanTarget = testCase.gold.humanScores.reduce((sum, item) => sum + item.score, 0) / testCase.gold.humanScores.length;
    const error = run.predictedScore - humanTarget;
    absoluteErrors.push(Math.abs(error));
    squaredErrors.push(error * error);
    signedErrors.push(error);
    normalizedAbsoluteErrors.push(Math.abs(error) / testCase.question.maxScore);
  }

  const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const mse = mean(squaredErrors);
  return {
    caseCount: absoluteErrors.length,
    observationCount,
    meanAbsoluteError: mean(absoluteErrors),
    rootMeanSquaredError: mse === null ? null : Math.sqrt(mse),
    meanSignedError: mean(signedErrors),
    normalizedMeanAbsoluteError: mean(normalizedAbsoluteErrors)
  };
}

export function hasCompleteRubricAlignment(
  testCase: GradingBenchmarkCase,
  run: BenchmarkModelRun,
  alignment: BenchmarkAlignment
): boolean {
  try {
    const metrics = calculateRubricQuality(testCase, run, alignment);
    return metrics.unmatchedGoldRubricPointIds.length === 0 && metrics.unmatchedPredictedRubricPointIds.length === 0;
  } catch {
    return false;
  }
}

export function hasCompleteAlignment(
  testCase: GradingBenchmarkCase,
  run: BenchmarkModelRun,
  alignment: BenchmarkAlignment
): boolean {
  if (!hasCompleteRubricAlignment(testCase, run, alignment)) return false;
  try {
    return calculateMappingQuality(testCase, run, alignment).mappingCoverage === 1;
  } catch {
    return false;
  }
}
