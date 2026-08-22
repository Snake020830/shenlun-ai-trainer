import { createGradingService } from "./contracts";
import type { GradingRequest } from "./contracts";
import { mockGradingProvider } from "./mockProvider";
import { resolveGradingService } from "./serviceResolver";

// Stable mock service remains available for deterministic product-shell tests and legacy UI flows.
export const gradingService = createGradingService(mockGradingProvider);

export async function gradeAnswer(request: GradingRequest) {
  const service = await resolveGradingService();
  return service.grade(request);
}

export * from "./contracts";