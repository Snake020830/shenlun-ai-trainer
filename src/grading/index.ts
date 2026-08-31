import type { GradingRequest } from "./contracts";
import { resolveGradingService } from "./serviceResolver";
import { runShenlunGraderSkill } from "./shenlunGraderSkill";

export async function gradeAnswer(request: GradingRequest) {
  const result = await runShenlunGraderSkill(request);
  return {
    ...result.review,
    skillVersion: result.meta.skillVersion,
    scoreInterpretation: result.meta.scoreInterpretation,
    skillWarnings: result.meta.warnings
  };
}

// Detailed raw workflow access is kept for benchmark/calibration code that needs
// immutable artifacts. Daily practice goes through ShenlunGraderSkill via gradeAnswer.
export async function gradeAnswerDetailed(request: GradingRequest) {
  const service = await resolveGradingService();
  return service.gradeDetailed(request);
}

// Backward-compatible facade for PracticeWorkspace. Provider settings are still
// resolved on every submission; grade() now adds the product-level Skill gates.
export const gradingService = {
  grade: gradeAnswer,
  gradeDetailed: gradeAnswerDetailed
};

export * from "./contracts";
export * from "./shenlunGraderSkill";
