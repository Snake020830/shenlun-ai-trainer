import type { GradingRequest } from "./contracts";
import { resolveGradingService } from "./serviceResolver";

export async function gradeAnswer(request: GradingRequest) {
  const service = await resolveGradingService();
  return service.grade(request);
}

export async function gradeAnswerDetailed(request: GradingRequest) {
  const service = await resolveGradingService();
  return service.gradeDetailed(request);
}

// Backward-compatible facade for the current Practice page. Both methods resolve
// the active provider on every submission, so settings changes take effect without restart.
export const gradingService = {
  grade: gradeAnswer,
  gradeDetailed: gradeAnswerDetailed
};

export * from "./contracts";
