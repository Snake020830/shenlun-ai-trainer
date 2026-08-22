import type { GradingRequest } from "./contracts";
import { resolveGradingService } from "./serviceResolver";

export async function gradeAnswer(request: GradingRequest) {
  const service = await resolveGradingService();
  return service.grade(request);
}

// Backward-compatible facade for the current Practice page. Its grade() method resolves
// the active provider on every submission, so settings changes take effect without restart.
export const gradingService = {
  grade: gradeAnswer
};

export * from "./contracts";