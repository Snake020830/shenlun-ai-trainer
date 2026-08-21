import type { ReviewPoint } from "../types";

export type ElementType =
  | "problem"
  | "cause"
  | "measure"
  | "outcome"
  | "impact"
  | "significance"
  | "viewpoint"
  | "mechanism"
  | "other";

export interface MaterialCandidate {
  id: string;
  materialId: string;
  elementType: ElementType;
  claim: string;
  evidence: string;
  subject?: string;
  actionOrState?: string;
  object?: string;
  mechanismOrQualifier?: string;
  independentDimension: boolean;
}

export interface RubricPointArtifact {
  id: string;
  title: string;
  elementType: ElementType;
  candidateIds: string[];
  evidence: string[];
  objectGroup?: string;
  mechanism?: string;
}

export interface AnswerMappingArtifact {
  rubricPointId: string;
  status: ReviewPoint["status"];
  answerExcerpt?: string;
  errorCodes: string[];
  diagnosis: string;
  suggestion?: string;
}

export interface WordBudgetArtifact {
  charCount: number;
  wordLimit: number;
  overLimit: boolean;
  redundantExcerpts: string[];
  lowValueExcerpts: string[];
  compressionAdvice: string[];
}

export interface ReferenceCrossCheckArtifact {
  source?: string;
  blindRubricMissingDimensions: string[];
  referenceOnlyDimensions: string[];
  mergeDifferences: string[];
  notes: string[];
}

export interface MaterialExtractionOutput {
  materialCandidates: MaterialCandidate[];
}

export interface RubricConstructionOutput {
  rubric: RubricPointArtifact[];
}

export interface AnswerMappingOutput {
  mappings: AnswerMappingArtifact[];
}

export interface WordBudgetOutput {
  wordBudget: WordBudgetArtifact;
}

export interface ReferenceCrossCheckOutput {
  referenceCrossCheck: ReferenceCrossCheckArtifact;
}

export interface GradingWorkflowArtifacts {
  schemaVersion: "0.1.0";
  materialCandidates: MaterialCandidate[];
  rubric: RubricPointArtifact[];
  mappings: AnswerMappingArtifact[];
  wordBudget: WordBudgetArtifact;
  referenceCrossCheck?: ReferenceCrossCheckArtifact;
}

export function createEmptyWorkflowArtifacts(wordLimit: number, charCount = 0): GradingWorkflowArtifacts {
  return {
    schemaVersion: "0.1.0",
    materialCandidates: [],
    rubric: [],
    mappings: [],
    wordBudget: {
      charCount,
      wordLimit,
      overLimit: charCount > wordLimit,
      redundantExcerpts: [],
      lowValueExcerpts: [],
      compressionAdvice: []
    }
  };
}
