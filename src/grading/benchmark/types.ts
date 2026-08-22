import type { ElementType } from "../artifacts";
import type { ReviewPoint } from "../../types";

export interface BenchmarkMaterialPoint {
  id: string;
  materialId: string;
  canonicalLabel: string;
  elementType: ElementType;
  evidence: string;
  independentDimension: boolean;
  notes?: string;
}

export interface BenchmarkRubricPoint {
  id: string;
  canonicalLabel: string;
  elementType: ElementType;
  materialPointIds: string[];
  evidence: string[];
  acceptableMergeGroup?: string;
  notes?: string;
}

export interface BenchmarkAnswerMapping {
  rubricPointId: string;
  status: ReviewPoint["status"];
  expectedErrorCodes: string[];
  answerExcerpt?: string;
  notes?: string;
}

export interface HumanScoreObservation {
  assessorId: string;
  score: number;
  notes?: string;
}

export interface BenchmarkQuestionSnapshot {
  id: string;
  title: string;
  type: string;
  maxScore: number;
  wordLimit: number;
  prompt: string;
  materials: Array<{ id: string; label: string; content: string }>;
  referenceAnswer?: { content: string; source?: string };
}

export type BenchmarkAnnotationStatus = "draft" | "adjudicated";

export interface GradingBenchmarkCase {
  schemaVersion: "0.1.0";
  id: string;
  tags: string[];
  annotationStatus?: BenchmarkAnnotationStatus;
  question: BenchmarkQuestionSnapshot;
  answer: string;
  gold: {
    materialPoints: BenchmarkMaterialPoint[];
    rubric: BenchmarkRubricPoint[];
    mappings: BenchmarkAnswerMapping[];
    humanScores: HumanScoreObservation[];
  };
  split?: "debug" | "calibration" | "holdout";
  provenance?: {
    source?: string;
    annotatedAt?: string;
    adjudicationNotes?: string;
  };
}

export interface BenchmarkValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface BenchmarkModelRunRubricPoint {
  id: string;
  title: string;
  elementType: ElementType;
  evidence: string[];
}

export interface BenchmarkModelRunMapping {
  predictedRubricPointId: string;
  status: ReviewPoint["status"];
  errorCodes: string[];
  diagnosis: string;
  suggestion?: string;
}

export interface BenchmarkModelRun {
  schemaVersion: "0.1.0";
  caseId: string;
  runId: string;
  predictedScore: number;
  maxScore: number;
  rubric: BenchmarkModelRunRubricPoint[];
  mappings: BenchmarkModelRunMapping[];
  providerId?: string;
  model?: string;
  protocol?: string;
  reasoningEffort?: string;
  rulesetVersion?: string;
  workflowVersion: string;
  promptsetVersion: string;
  scoringPolicy?: string;
  generatedAt?: string;
  referenceCrossCheckUsed: boolean;
}

export type RubricAlignmentRelation = "match" | "acceptable-merge" | "acceptable-split";

export interface RubricAlignmentGroup {
  goldRubricPointIds: string[];
  predictedRubricPointIds: string[];
  relation: RubricAlignmentRelation;
  alignmentConfidence?: "high" | "medium" | "low";
  alignmentNotes?: string;
}

export interface AlignedPredictionMapping {
  goldRubricPointId: string;
  predictedStatus: ReviewPoint["status"];
  predictedErrorCodes: string[];
  predictedRubricPointId?: string;
  alignmentConfidence?: "high" | "medium" | "low";
  alignmentNotes?: string;
}

export interface AlignedBenchmarkPrediction {
  caseId: string;
  predictedScore: number;
  predictedRubricPointIds: string[];
  rubricAlignments: RubricAlignmentGroup[];
  mappings: AlignedPredictionMapping[];
  providerId?: string;
  model?: string;
  rulesetVersion?: string;
  scoringPolicy?: string;
}

export interface RubricQualityMetrics {
  goldPointCount: number;
  predictedPointCount: number;
  coveredGoldPointCount: number;
  supportedPredictedPointCount: number;
  recall: number | null;
  precision: number | null;
  f1: number | null;
  unmatchedGoldRubricPointIds: string[];
  unmatchedPredictedRubricPointIds: string[];
}

export interface MappingConfusionCounts {
  hit: { hit: number; partial: number; missed: number };
  partial: { hit: number; partial: number; missed: number };
  missed: { hit: number; partial: number; missed: number };
}

export interface MappingQualityMetrics {
  alignedPointCount: number;
  goldPointCount: number;
  mappingCoverage: number | null;
  exactStatusAccuracy: number | null;
  confusion: MappingConfusionCounts;
}

export interface TaxonomyQualityMetrics {
  labelDecisionCount: number;
  truePositive: number;
  falsePositive: number;
  falseNegative: number;
  microPrecision: number | null;
  microRecall: number | null;
  microF1: number | null;
}

export interface ScoreCalibrationMetrics {
  caseCount: number;
  observationCount: number;
  meanAbsoluteError: number | null;
  rootMeanSquaredError: number | null;
  meanSignedError: number | null;
  normalizedMeanAbsoluteError: number | null;
}
