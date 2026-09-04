import type { EssayDrillDraft, EssayDrillMode } from "../../essayDrillStore";

export type EssayDrillStepStatus = "strong" | "developing" | "missing";
export type EssayDrillOverallLevel = "ready" | "revise" | "incomplete";

export interface EssayDrillStepReview {
  id: EssayDrillMode;
  label: string;
  status: EssayDrillStepStatus;
  finding: string;
  answerEvidence: string;
  courseRuleIds: string[];
  action: string;
  rewriteExample: string;
}

export interface EssayDrillCoherenceReview {
  finding: string;
  breakpoints: string[];
  action: string;
}

export interface EssayDrillProfessionalReview {
  schemaVersion: "1.0.0";
  providerKind: "remote" | "local";
  overallLevel: EssayDrillOverallLevel;
  summary: string;
  coherence: EssayDrillCoherenceReview;
  stepReviews: EssayDrillStepReview[];
  priorityActions: string[];
  assemblyPlan: string[];
  warnings: string[];
}

export interface EssayDrillGradingRequest {
  draft: EssayDrillDraft;
  question: import("../../types").Question;
}

export function essayDrillAnswerPayload(draft: EssayDrillDraft) {
  return {
    title: draft.theme.quickTitle.trim(),
    thesis: draft.theme.quickText.trim(),
    subpoints: draft.outline.quickText.trim(),
    bodyParagraph: draft.paragraph.quickText.trim(),
    materialTransformation: draft.evidence.quickText.trim(),
    closing: draft.closing.quickText.trim()
  };
}
