import type { EssayDimensionId, EssayTaskFrame } from "../../types";

export interface EssayTaskAnalysisOutput extends EssayTaskFrame {
  taskEvidence: string;
}

export interface EssayDimensionAssessment {
  id: EssayDimensionId;
  score: number;
  finding: string;
  answerEvidence: string;
  action: string;
  evidenceRuleIds: string[];
}

export interface EssayEvaluationOutput {
  summary: string;
  dimensions: EssayDimensionAssessment[];
  structureTrace: {
    title: string;
    centralThesis: string;
    subpoints: string[];
    paragraphCount: number;
    introductionAssessment: string;
    conclusionAssessment: string;
  };
  revisedOutline: {
    title: string;
    thesis: string;
    subpoints: string[];
    paragraphPlan: string[];
  };
}

export interface EssayGradingArtifacts {
  schemaVersion: "1.0.0";
  taskAnalysis: EssayTaskAnalysisOutput;
  evaluation: EssayEvaluationOutput;
  answerCharCount: number;
  wordLimit: number;
}
