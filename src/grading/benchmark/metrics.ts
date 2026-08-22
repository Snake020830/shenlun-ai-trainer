import type {
  AlignedBenchmarkPrediction,
  GradingBenchmarkCase,
  MappingConfusionCounts,
  MappingQualityMetrics,
  RubricQualityMetrics,
  ScoreCalibrationMetrics,
  TaxonomyQualityMetrics
} from "./types";

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

function assertUniqueAlignedMappings(prediction: AlignedBenchmarkPrediction): void {
  assertUniqueStrings(prediction.mappings.map(item => item.goldRubricPointId), "aligned prediction");
}

function validateRubricAlignment(
  testCase: GradingBenchmarkCase,
  prediction: AlignedBenchmarkPrediction
): { coveredGold: Set<string>; supportedPredicted: Set<string> } {
  assertAdjudicated(testCase);
  if (prediction.caseId !== testCase.id) throw new Error("Prediction caseId does not match benchmark case.");
  assertUniqueStrings(prediction.predictedRubricPointIds, "predicted rubric point id");

  const goldIds = new Set(testCase.gold.rubric.map(item => item.id));
  const predictedIds = new Set(prediction.predictedRubricPointIds);
  const coveredGold = new Set<string>();
  const supportedPredicted = new Set<string>();

  for (const [index, group] of prediction.rubricAlignments.entries()) {
    if (!group.goldRubricPointIds.length || !group.predictedRubricPointIds.length) {
      throw new Error(`Rubric alignment group ${index} must include both gold and predicted ids.`);
    }
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
    }
    for (const predictedId of group.predictedRubricPointIds) {
      if (!predictedIds.has(predictedId)) throw new Error(`Rubric alignment references undeclared predicted rubric ${predictedId}.`);
      if (supportedPredicted.has(predictedId)) throw new Error(`Predicted rubric ${predictedId} appears in multiple alignment groups.`);
      supportedPredicted.add(predictedId);
    }
  }

  return { coveredGold, supportedPredicted };
}

export function calculateRubricQuality(
  testCase: GradingBenchmarkCase,
  prediction: AlignedBenchmarkPrediction
): RubricQualityMetrics {
  const { coveredGold, supportedPredicted } = validateRubricAlignment(testCase, prediction);
  const goldIds = testCase.gold.rubric.map(item => item.id);
  const predictedIds = prediction.predictedRubricPointIds;
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
  prediction: AlignedBenchmarkPrediction
): MappingQualityMetrics {
  const { coveredGold } = validateRubricAlignment(testCase, prediction);
  assertUniqueAlignedMappings(prediction);

  const goldById = new Map(testCase.gold.mappings.map(item => [item.rubricPointId, item]));
  const predictedIds = new Set(prediction.predictedRubricPointIds);
  const confusion = emptyConfusion();
  let correct = 0;

  for (const mapping of prediction.mappings) {
    const gold = goldById.get(mapping.goldRubricPointId);
    if (!gold) throw new Error(`Aligned prediction references unknown gold rubric ${mapping.goldRubricPointId}.`);
    if (!coveredGold.has(mapping.goldRubricPointId)) {
      throw new Error(`Answer mapping references gold rubric ${mapping.goldRubricPointId} that is not covered by rubric alignment.`);
    }
    if (mapping.predictedRubricPointId && !predictedIds.has(mapping.predictedRubricPointId)) {
      throw new Error(`Answer mapping references undeclared predicted rubric ${mapping.predictedRubricPointId}.`);
    }
    confusion[gold.status][mapping.predictedStatus] += 1;
    if (gold.status === mapping.predictedStatus) correct += 1;
  }

  return {
    alignedPointCount: prediction.mappings.length,
    goldPointCount: testCase.gold.rubric.length,
    mappingCoverage: safeRatio(prediction.mappings.length, testCase.gold.rubric.length),
    exactStatusAccuracy: safeRatio(correct, prediction.mappings.length),
    confusion
  };
}

export function calculateTaxonomyQuality(
  testCase: GradingBenchmarkCase,
  prediction: AlignedBenchmarkPrediction
): TaxonomyQualityMetrics {
  const { coveredGold } = validateRubricAlignment(testCase, prediction);
  assertUniqueAlignedMappings(prediction);

  const goldById = new Map(testCase.gold.mappings.map(item => [item.rubricPointId, item]));
  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  let labelDecisionCount = 0;

  for (const mapping of prediction.mappings) {
    const gold = goldById.get(mapping.goldRubricPointId);
    if (!gold) throw new Error(`Aligned prediction references unknown gold rubric ${mapping.goldRubricPointId}.`);
    if (!coveredGold.has(mapping.goldRubricPointId)) {
      throw new Error(`Taxonomy mapping references gold rubric ${mapping.goldRubricPointId} that is not covered by rubric alignment.`);
    }
    const expected = new Set(gold.expectedErrorCodes);
    const predicted = new Set(mapping.predictedErrorCodes);
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
  predictions: AlignedBenchmarkPrediction[]
): ScoreCalibrationMetrics {
  const predictionsByCase = new Map<string, AlignedBenchmarkPrediction>();
  for (const prediction of predictions) {
    if (predictionsByCase.has(prediction.caseId)) {
      throw new Error(`Duplicate score prediction for benchmark case ${prediction.caseId}.`);
    }
    predictionsByCase.set(prediction.caseId, prediction);
  }

  const absoluteErrors: number[] = [];
  const squaredErrors: number[] = [];
  const signedErrors: number[] = [];
  const normalizedAbsoluteErrors: number[] = [];
  let observationCount = 0;

  for (const testCase of cases) {
    const prediction = predictionsByCase.get(testCase.id);
    if (!prediction || !testCase.gold.humanScores.length) continue;
    assertAdjudicated(testCase);
    if (testCase.split !== "calibration" && testCase.split !== "holdout") {
      throw new Error(`Benchmark case ${testCase.id} is not in calibration/holdout split and cannot be used for score calibration.`);
    }
    if (!Number.isFinite(prediction.predictedScore) || prediction.predictedScore < 0 || prediction.predictedScore > testCase.question.maxScore) {
      throw new Error(`Predicted score for ${testCase.id} is outside 0..maxScore.`);
    }

    observationCount += testCase.gold.humanScores.length;
    const humanTarget = testCase.gold.humanScores.reduce((sum, item) => sum + item.score, 0) / testCase.gold.humanScores.length;
    const error = prediction.predictedScore - humanTarget;
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

export function hasCompleteRubricAlignment(testCase: GradingBenchmarkCase, prediction: AlignedBenchmarkPrediction): boolean {
  try {
    const metrics = calculateRubricQuality(testCase, prediction);
    return metrics.unmatchedGoldRubricPointIds.length === 0 && metrics.unmatchedPredictedRubricPointIds.length === 0;
  } catch {
    return false;
  }
}

export function hasCompleteAlignment(testCase: GradingBenchmarkCase, prediction: AlignedBenchmarkPrediction): boolean {
  if (!hasCompleteRubricAlignment(testCase, prediction)) return false;
  const goldIds = new Set(testCase.gold.rubric.map(item => item.id));
  const mappedIds = new Set(prediction.mappings.map(item => item.goldRubricPointId));
  if (prediction.mappings.length !== mappedIds.size || goldIds.size !== mappedIds.size) return false;
  for (const id of goldIds) if (!mappedIds.has(id)) return false;
  return true;
}
