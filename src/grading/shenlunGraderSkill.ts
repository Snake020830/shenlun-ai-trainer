import type { StructuredReview } from "../types";
import type { GradingWorkflowArtifacts } from "./artifacts";
import {
  createGradingService,
  GRADING_RULESET_VERSION,
  type GradingProvider,
  type GradingRequest
} from "./contracts";
import { resolveGradingService } from "./serviceResolver";

export const SHENLUN_GRADER_SKILL_VERSION = "shenlun-grader-skill@0.1.0";

export interface ShenlunGraderPreflight {
  questionId: string;
  materialCount: number;
  materialCharCount: number;
  answerCharCount: number;
  wordLimit: number;
  overLimit: boolean;
  hasReferenceAnswer: boolean;
}

export interface ShenlunGraderResult {
  review: StructuredReview;
  artifacts?: GradingWorkflowArtifacts;
  meta: {
    skillVersion: typeof SHENLUN_GRADER_SKILL_VERSION;
    rulesetVersion: string;
    providerId: string;
    providerKind: "mock" | "remote" | "local";
    scoreInterpretation: "mock-diagnostic" | "ai-diagnostic-uncalibrated" | "validated";
    preflight: ShenlunGraderPreflight;
    warnings: string[];
  };
}

function nonWhitespaceLength(value: string): number {
  return value.replace(/\s/g, "").length;
}

export function preflightShenlunGrading(request: GradingRequest): ShenlunGraderPreflight {
  const { question, answer, referenceAnswer } = request;
  if (!question.id.trim()) throw new Error("Shenlun Grader: question id is required.");
  if (!question.prompt.trim()) throw new Error("Shenlun Grader: question prompt is required.");
  if (!Number.isFinite(question.score) || question.score <= 0) throw new Error("Shenlun Grader: question score must be positive.");
  if (!Number.isInteger(question.wordLimit) || question.wordLimit <= 0) throw new Error("Shenlun Grader: word limit must be a positive integer.");
  if (!Array.isArray(question.materials) || question.materials.length === 0) throw new Error("Shenlun Grader: at least one material block is required.");

  const materialCharCount = question.materials.reduce((sum, material, index) => {
    if (!material.id.trim()) throw new Error(`Shenlun Grader: material ${index + 1} id is required.`);
    if (!material.content.trim()) throw new Error(`Shenlun Grader: material ${index + 1} is empty.`);
    return sum + nonWhitespaceLength(material.content);
  }, 0);
  const answerCharCount = nonWhitespaceLength(answer);
  if (answerCharCount === 0) throw new Error("Shenlun Grader: answer is empty.");

  return {
    questionId: question.id,
    materialCount: question.materials.length,
    materialCharCount,
    answerCharCount,
    wordLimit: question.wordLimit,
    overLimit: answerCharCount > question.wordLimit,
    hasReferenceAnswer: Boolean(referenceAnswer?.content.trim())
  };
}

function validateSkillArtifacts(
  artifacts: GradingWorkflowArtifacts | undefined,
  providerKind: "mock" | "remote" | "local",
  preflight: ShenlunGraderPreflight
): string[] {
  const warnings: string[] = [];
  if (providerKind === "mock") {
    if (!artifacts) warnings.push("当前使用 mock 批改，只用于界面和流程验证，不代表真实 AI 诊断质量。");
    return warnings;
  }
  if (!artifacts) throw new Error("Shenlun Grader: non-mock provider returned no workflow artifacts.");
  if (!artifacts.materialCandidates.length) throw new Error("Shenlun Grader: Stage 1 returned no material candidates.");
  if (!artifacts.rubric.length) throw new Error("Shenlun Grader: Stage 2 returned an empty rubric.");
  if (artifacts.mappings.length !== artifacts.rubric.length) {
    throw new Error("Shenlun Grader: Stage 3 mapping count does not match rubric count.");
  }
  if (artifacts.wordBudget.charCount !== preflight.answerCharCount) {
    throw new Error("Shenlun Grader: Stage 4 character count does not match submitted answer.");
  }
  if (artifacts.wordBudget.wordLimit !== preflight.wordLimit) {
    throw new Error("Shenlun Grader: Stage 4 word limit does not match question metadata.");
  }
  return warnings;
}

function scoreInterpretation(review: StructuredReview, providerKind: "mock" | "remote" | "local"): ShenlunGraderResult["meta"]["scoreInterpretation"] {
  if (review.calibrationStatus === "validated") return "validated";
  if (providerKind === "mock") return "mock-diagnostic";
  return "ai-diagnostic-uncalibrated";
}

async function executeShenlunGraderSkill(
  request: GradingRequest,
  service: ReturnType<typeof createGradingService>
): Promise<ShenlunGraderResult> {
  const preflight = preflightShenlunGrading(request);
  const output = await service.gradeDetailed(request);
  const warnings = validateSkillArtifacts(output.artifacts, service.provider.kind, preflight);

  if (preflight.overLimit) warnings.push(`当前答案 ${preflight.answerCharCount} 字，超过 ${preflight.wordLimit} 字上限。`);
  if (service.provider.kind !== "mock" && output.review.calibrationStatus !== "validated") {
    warnings.push("当前总分属于 AI 诊断评分，尚未经过独立 Human Gold 校准，不应解释为官方阅卷等值分。")
  }

  return {
    review: output.review,
    artifacts: output.artifacts,
    meta: {
      skillVersion: SHENLUN_GRADER_SKILL_VERSION,
      rulesetVersion: output.review.rulesetVersion ?? service.provider.rulesetVersion ?? GRADING_RULESET_VERSION,
      providerId: output.review.providerId ?? service.provider.id,
      providerKind: service.provider.kind,
      scoreInterpretation: scoreInterpretation(output.review, service.provider.kind),
      preflight,
      warnings
    }
  };
}

export async function runShenlunGraderSkillWithProvider(
  request: GradingRequest,
  provider: GradingProvider
): Promise<ShenlunGraderResult> {
  return executeShenlunGraderSkill(request, createGradingService(provider));
}

export async function runShenlunGraderSkill(request: GradingRequest): Promise<ShenlunGraderResult> {
  return executeShenlunGraderSkill(request, await resolveGradingService());
}

export const shenlunGraderSkill = {
  id: "shenlun-grader",
  version: SHENLUN_GRADER_SKILL_VERSION,
  run: runShenlunGraderSkill,
  runWithProvider: runShenlunGraderSkillWithProvider,
  preflight: preflightShenlunGrading
};
