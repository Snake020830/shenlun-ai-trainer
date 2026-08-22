import type {
  AlignedBenchmarkPrediction,
  GradingBenchmarkCase,
  MappingConfusionCounts,
  MappingQualityMetrics,
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

function assertUniqueAlignedMappings(prediction: AlignedBenchmarkPrediction): void {
  const seen = new Set<string>();
  for (const mapping of prediction.mappings) {
    if (seen.has(mapping.goldRubricPointId)) {
      throw new Error(`Duplicate aligned prediction for ${mapping.goldRubricPointId}.`);
    }
    seen.add(mapping.goldRubricPointId);
  }
}

export function calculateMappingQuality(
  testCase: GradingBenchmarkCase,
  prediction: AlignedBenchmarkPrediction
): MappingQualityMetrics {
  assertAdjudicated(testCase);
  if (prediction.caseId !== testCase.id) throw new Error("Prediction caseId does not match benchmark case.");
  assertUniqueAlignedMappings(prediction);

  const goldById = new Map(testCase.gold.mappings.map(item => [item.rubricPointId, item]));
  const confusion = emptyConfusion();
  let correct = 0;

  for (const mapping of prediction.mappings) {
    const gold = goldById.get(mapping.goldRubricPointId);
    if (!gold) throw new Error(`Aligned prediction references unknown gold rubric ${mapping.goldRubricPointId}.`);
    confusion[gold.status][mapping.predictedStatus] += 1;
    if (gold.status === mapping.predictedStatus) correct += 1;
  }

  return {
    alignedPointCount: prediction.mappings.length,
    exactStatusAccuracy: safeRatio(correct, prediction.mappings.length),
    confusion
  };
}

export function calculateTaxonomyQuality(
  testCase: GradingBenchmarkCase,
  prediction: AlignedBenchmarkPrediction
): TaxonomyQualityMetrics {
  assertAdjudicated(testCase);
  if (prediction.caseId !== testCase.id) throw new Error("Prediction caseId does not match benchmark case.");
  assertUniqueAlignedMappings(prediction);

  const goldById = new Map(testCase.gold.mappings.map(item => [item.rubricPointId, item]));
  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  let labelDecisionCount = 0;

  for (const mapping of prediction.mappings) {
    const gold = goldById.get(mapping.goldRubricPointId);
    if (!gold) throw new Error(`Aligned prediction references unknown gold rubric ${mapping.goldRubricPointId}.`);
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

export function hasCompleteAlignment(testCase: GradingBenchmarkCase, prediction: AlignedBenchmarkPrediction): boolean {
  const goldIds = new Set(testCase.gold.rubric.map(item => item.id));
  const alignedIds = new Set(prediction.mappings.map(item => item.goldRubricPointId));
  if (prediction.mappings.length !== alignedIds.size) return false;
  if (goldIds.size !== alignedIds.size) return false;
  for (const id of goldIds) if (!alignedIds.has(id)) return false;
  return true;
}
