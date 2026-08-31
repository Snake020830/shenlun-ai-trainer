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
import {
  calculateMappingQuality,
  calculateRubricQuality,
  calculateScoreCalibration,
  calculateTaxonomyQuality
} from "./metrics";
import { validateBenchmarkAlignment } from "./validateAlignment";

export interface BenchmarkExperimentSignature {
  providerId: string | null;
  model: string | null;
  protocol: string | null;
  reasoningEffort: string | null;
  rulesetVersion: string | null;
  workflowVersion: string;
  promptsetVersion: string;
  scoringPolicy: string | null;
  referenceCrossCheckUsed: boolean;
}

export interface ValidationCaseResult {
  caseId: string;
  runId: string;
  rubric: RubricQualityMetrics;
  mapping: MappingQualityMetrics;
  taxonomy: TaxonomyQualityMetrics;
}

export interface BenchmarkValidationReport {
  schemaVersion: "0.1.0";
  split: "debug" | "calibration" | "holdout";
  experiment: BenchmarkExperimentSignature;
  caseCount: number;
  caseResults: ValidationCaseResult[];
  aggregate: {
    rubric: Pick<RubricQualityMetrics, "goldPointCount" | "predictedPointCount" | "coveredGoldPointCount" | "supportedPredictedPointCount" | "recall" | "precision" | "f1">;
    mapping: MappingQualityMetrics;
    taxonomy: TaxonomyQualityMetrics;
    score: ScoreCalibrationMetrics;
  };
  generatedAt: string;
  validationStatus: "evidence-only";
}

function safeRatio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function harmonicMean(precision: number | null, recall: number | null): number | null {
  if (precision === null || recall === null) return null;
  if (precision + recall === 0) return 0;
  return 2 * precision * recall / (precision + recall);
}

function signature(run: BenchmarkModelRun): BenchmarkExperimentSignature {
  return {
    providerId: run.providerId ?? null,
    model: run.model ?? null,
    protocol: run.protocol ?? null,
    reasoningEffort: run.reasoningEffort ?? null,
    rulesetVersion: run.rulesetVersion ?? null,
    workflowVersion: run.workflowVersion,
    promptsetVersion: run.promptsetVersion,
    scoringPolicy: run.scoringPolicy ?? null,
    referenceCrossCheckUsed: run.referenceCrossCheckUsed
  };
}

function sameSignature(left: BenchmarkExperimentSignature, right: BenchmarkExperimentSignature): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function emptyConfusion(): MappingConfusionCounts {
  return {
    hit: { hit: 0, partial: 0, missed: 0 },
    partial: { hit: 0, partial: 0, missed: 0 },
    missed: { hit: 0, partial: 0, missed: 0 }
  };
}

function addConfusion(target: MappingConfusionCounts, source: MappingConfusionCounts): void {
  for (const gold of ["hit", "partial", "missed"] as const) {
    for (const predicted of ["hit", "partial", "missed"] as const) {
      target[gold][predicted] += source[gold][predicted];
    }
  }
}

function requireUniqueBy<T>(items: T[], keyOf: (item: T) => string, label: string): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) {
    const key = keyOf(item);
    if (map.has(key)) throw new Error(`Duplicate ${label}: ${key}.`);
    map.set(key, item);
  }
  return map;
}

function assertAdjudicatedAlignment(alignment: BenchmarkAlignment): void {
  if (alignment.alignmentStatus !== "adjudicated") {
    throw new Error(`Validation report alignment for case ${alignment.caseId} is not adjudicated.`);
  }
  if (!alignment.provenance?.alignedBy?.trim()) {
    throw new Error(`Validation report alignment for case ${alignment.caseId} is missing provenance.alignedBy.`);
  }
  if (!alignment.provenance?.alignedAt?.trim()) {
    throw new Error(`Validation report alignment for case ${alignment.caseId} is missing provenance.alignedAt.`);
  }
}

export function buildValidationReport(
  cases: GradingBenchmarkCase[],
  runs: BenchmarkModelRun[],
  alignments: BenchmarkAlignment[],
  generatedAt = new Date().toISOString()
): BenchmarkValidationReport {
  if (!cases.length) throw new Error("Validation report requires at least one benchmark case.");

  const split = cases[0].split;
  if (!split) throw new Error("Validation report cases must have an explicit split.");
  for (const testCase of cases) {
    if (testCase.split !== split) throw new Error("Validation report cannot mix benchmark splits.");
    if (testCase.annotationStatus !== "adjudicated") {
      throw new Error(`Validation report case ${testCase.id} is not adjudicated.`);
    }
  }
  for (const alignment of alignments) assertAdjudicatedAlignment(alignment);

  const caseById = requireUniqueBy(cases, item => item.id, "benchmark case id");
  const runByCase = requireUniqueBy(runs, item => item.caseId, "model run case id");
  const alignmentByCase = requireUniqueBy(alignments, item => item.caseId, "alignment case id");
  if (caseById.size !== runByCase.size || caseById.size !== alignmentByCase.size) {
    throw new Error("Validation report requires exactly one model run and one alignment for every benchmark case.");
  }
  for (const caseId of caseById.keys()) {
    if (!runByCase.has(caseId) || !alignmentByCase.has(caseId)) {
      throw new Error(`Validation report is missing run/alignment for case ${caseId}.`);
    }
  }
  for (const caseId of runByCase.keys()) {
    if (!caseById.has(caseId)) throw new Error(`Validation report has a model run for unknown case ${caseId}.`);
  }
  for (const caseId of alignmentByCase.keys()) {
    if (!caseById.has(caseId)) throw new Error(`Validation report has an alignment for unknown case ${caseId}.`);
  }

  const firstRun = runs[0];
  const experiment = signature(firstRun);
  for (const run of runs.slice(1)) {
    if (!sameSignature(experiment, signature(run))) {
      throw new Error("Validation report cannot mix model runs with different experiment signatures.");
    }
  }

  const caseResults: ValidationCaseResult[] = [];
  let goldPointCount = 0;
  let predictedPointCount = 0;
  let coveredGoldPointCount = 0;
  let supportedPredictedPointCount = 0;
  let alignedPointCount = 0;
  let mappingCorrect = 0;
  const confusion = emptyConfusion();
  let taxonomyTruePositive = 0;
  let taxonomyFalsePositive = 0;
  let taxonomyFalseNegative = 0;
  let taxonomyLabelDecisionCount = 0;

  for (const testCase of cases) {
    const run = runByCase.get(testCase.id)!;
    const alignment = alignmentByCase.get(testCase.id)!;
    if (alignment.runId !== run.runId) {
      throw new Error(`Validation report alignment runId does not match model run for case ${testCase.id}.`);
    }
    const alignmentValidation = validateBenchmarkAlignment(testCase, run, alignment);
    if (!alignmentValidation.valid) {
      throw new Error(`Validation report alignment for case ${testCase.id} is invalid: ${alignmentValidation.errors.join("; ")}`);
    }

    const rubric = calculateRubricQuality(testCase, run, alignment);
    const mapping = calculateMappingQuality(testCase, run, alignment);
    const taxonomy = calculateTaxonomyQuality(testCase, run, alignment);
    caseResults.push({ caseId: testCase.id, runId: run.runId, rubric, mapping, taxonomy });

    goldPointCount += rubric.goldPointCount;
    predictedPointCount += rubric.predictedPointCount;
    coveredGoldPointCount += rubric.coveredGoldPointCount;
    supportedPredictedPointCount += rubric.supportedPredictedPointCount;
    alignedPointCount += mapping.alignedPointCount;
    mappingCorrect += mapping.confusion.hit.hit + mapping.confusion.partial.partial + mapping.confusion.missed.missed;
    addConfusion(confusion, mapping.confusion);
    taxonomyTruePositive += taxonomy.truePositive;
    taxonomyFalsePositive += taxonomy.falsePositive;
    taxonomyFalseNegative += taxonomy.falseNegative;
    taxonomyLabelDecisionCount += taxonomy.labelDecisionCount;
  }

  const rubricRecall = safeRatio(coveredGoldPointCount, goldPointCount);
  const rubricPrecision = safeRatio(supportedPredictedPointCount, predictedPointCount);
  const taxonomyPrecision = safeRatio(taxonomyTruePositive, taxonomyTruePositive + taxonomyFalsePositive);
  const taxonomyRecall = safeRatio(taxonomyTruePositive, taxonomyTruePositive + taxonomyFalseNegative);

  return {
    schemaVersion: "0.1.0",
    split,
    experiment,
    caseCount: cases.length,
    caseResults,
    aggregate: {
      rubric: {
        goldPointCount,
        predictedPointCount,
        coveredGoldPointCount,
        supportedPredictedPointCount,
        recall: rubricRecall,
        precision: rubricPrecision,
        f1: harmonicMean(rubricPrecision, rubricRecall)
      },
      mapping: {
        alignedPointCount,
        goldPointCount,
        mappingCoverage: safeRatio(alignedPointCount, goldPointCount),
        exactStatusAccuracy: safeRatio(mappingCorrect, alignedPointCount),
        confusion
      },
      taxonomy: {
        labelDecisionCount: taxonomyLabelDecisionCount,
        truePositive: taxonomyTruePositive,
        falsePositive: taxonomyFalsePositive,
        falseNegative: taxonomyFalseNegative,
        microPrecision: taxonomyPrecision,
        microRecall: taxonomyRecall,
        microF1: harmonicMean(taxonomyPrecision, taxonomyRecall)
      },
      score: calculateScoreCalibration(cases, runs)
    },
    generatedAt,
    validationStatus: "evidence-only"
  };
}
