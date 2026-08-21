import type { Question, ReviewPoint, StructuredReview } from "../types";
import type { GradingWorkflowArtifacts } from "./artifacts";

export const GRADING_RULESET_VERSION = "shenlun-grading@0.1.0";

export interface ReferenceAnswer {
  content: string;
  source?: string;
}

export interface GradingRequest {
  question: Question;
  answer: string;
  referenceAnswer?: ReferenceAnswer;
}

export type GradingProviderKind = "mock" | "remote" | "local";

export interface GradingProviderOutput {
  review: StructuredReview;
  artifacts?: GradingWorkflowArtifacts;
}

export interface GradingProvider {
  id: string;
  kind: GradingProviderKind;
  rulesetVersion: string;
  grade(request: GradingRequest): Promise<GradingProviderOutput>;
}

const REVIEW_STATUSES = new Set<ReviewPoint["status"]>(["hit", "partial", "missed"]);

function assertString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string") throw new Error(`Invalid grading result: ${field} must be a string.`);
}

export function validateReview(review: StructuredReview, expectedMaxScore: number): StructuredReview {
  if (!Number.isFinite(review.score) || !Number.isFinite(review.maxScore)) {
    throw new Error("Invalid grading result: score fields must be finite numbers.");
  }
  if (review.maxScore !== expectedMaxScore) {
    throw new Error(`Invalid grading result: maxScore ${review.maxScore} does not match question score ${expectedMaxScore}.`);
  }
  if (review.score < 0 || review.score > review.maxScore) {
    throw new Error("Invalid grading result: score is outside the allowed range.");
  }

  assertString(review.coverage, "coverage");
  assertString(review.classification, "classification");
  assertString(review.expression, "expression");
  assertString(review.redundancy, "redundancy");
  assertString(review.summary, "summary");

  if (!Array.isArray(review.points)) {
    throw new Error("Invalid grading result: points must be an array.");
  }
  for (const [index, point] of review.points.entries()) {
    assertString(point.title, `points[${index}].title`);
    assertString(point.evidence, `points[${index}].evidence`);
    if (!REVIEW_STATUSES.has(point.status)) {
      throw new Error(`Invalid grading result: points[${index}].status is unsupported.`);
    }
    if (point.suggestion !== undefined) assertString(point.suggestion, `points[${index}].suggestion`);
    if (point.errorCodes !== undefined && !point.errorCodes.every(code => typeof code === "string")) {
      throw new Error(`Invalid grading result: points[${index}].errorCodes must contain strings only.`);
    }
  }

  return review;
}

export function createGradingService(provider: GradingProvider) {
  async function gradeDetailed(request: GradingRequest): Promise<GradingProviderOutput> {
    if (!request.answer.trim()) throw new Error("Cannot grade an empty answer.");
    const output = await provider.grade(request);
    const validated = validateReview(output.review, request.question.score);
    return {
      ...output,
      review: {
        ...validated,
        engine: validated.engine ?? `${provider.id}:${provider.rulesetVersion}`,
        providerId: validated.providerId ?? provider.id,
        rulesetVersion: validated.rulesetVersion ?? provider.rulesetVersion,
        generatedAt: validated.generatedAt ?? new Date().toISOString()
      }
    };
  }

  return {
    provider,
    gradeDetailed,
    async grade(request: GradingRequest): Promise<StructuredReview> {
      return (await gradeDetailed(request)).review;
    }
  };
}
