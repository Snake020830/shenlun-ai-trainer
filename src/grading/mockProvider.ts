import { buildMockReview } from "../mockData";
import { GRADING_RULESET_VERSION } from "./contracts";
import type { GradingProvider } from "./contracts";

export const mockGradingProvider: GradingProvider = {
  id: "mock-v0.1",
  kind: "mock",
  rulesetVersion: GRADING_RULESET_VERSION,
  async grade({ question, answer }) {
    const review = buildMockReview(question, answer);
    return {
      ...review,
      engine: `mock-v0.1:${GRADING_RULESET_VERSION}`
    };
  }
};
