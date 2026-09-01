import { isTauri } from "@tauri-apps/api/core";
import type { StructuredReview } from "../../types";
import type { GradingRequest } from "../contracts";
import { loadGradingStyleProfile } from "../gradingStyleSettings";
import { hasValidProviderSmoke } from "../providerGate";
import { loadRemoteProviderConfig } from "../providerSettings";
import { tauriSecureRemoteExecutor } from "../remote/tauriExecutor";
import { createRemoteModelTransport } from "../remote/transport";
import { ESSAY_DIAGNOSTIC_DISCLAIMER, ESSAY_RULESET_VERSION } from "./evidence";
import { mockEssayGradingProvider } from "./mockProvider";
import { createEssayGradingService, createRemoteEssayGradingProvider } from "./provider";

export const ESSAY_GRADER_SKILL_VERSION = "essay-grader-skill@1.0.0";

async function resolveEssayGradingService() {
  const [config, gradingStyle] = await Promise.all([loadRemoteProviderConfig(), loadGradingStyleProfile()]);
  if (!config.enabled) return createEssayGradingService(mockEssayGradingProvider);
  if (!isTauri()) throw new Error("Remote AI essay grading is enabled but requires the Tauri desktop runtime.");
  if (!(await hasValidProviderSmoke(config))) {
    throw new Error("Remote AI essay grading is not available until the current provider configuration passes a full smoke test.");
  }
  const transport = createRemoteModelTransport(config, tauriSecureRemoteExecutor);
  return createEssayGradingService(createRemoteEssayGradingProvider(transport, gradingStyle.prompt));
}

export async function gradeEssayAnswerDetailed(request: GradingRequest) {
  if (request.question.type !== "文章写作") throw new Error("Essay Grader only accepts 文章写作 questions.");
  const service = await resolveEssayGradingService();
  const result = await service.gradeDetailed(request);
  const warnings = [ESSAY_DIAGNOSTIC_DISCLAIMER];
  if (service.provider.kind === "mock") {
    warnings.push("当前使用本地模拟器，只验证作文独立评分合同与训练流程；请启用远程模型生成全文语义诊断。");
  } else if (result.review.calibrationStatus !== "validated") {
    warnings.push("当前总分是课程量表下的 AI 诊断分，尚未经过作文 Human Gold 样本校准。优先看五维诊断和修改动作。");
  }
  if (result.artifacts.answerCharCount > result.artifacts.wordLimit) {
    warnings.push(`当前文章 ${result.artifacts.answerCharCount} 字，超过 ${result.artifacts.wordLimit} 字上限。`);
  }
  return {
    ...result,
    review: {
      ...result.review,
      skillVersion: ESSAY_GRADER_SKILL_VERSION,
      rulesetVersion: ESSAY_RULESET_VERSION,
      scoreInterpretation: service.provider.kind === "mock" ? "mock-diagnostic" as const : "ai-diagnostic-uncalibrated" as const,
      skillWarnings: warnings
    }
  };
}

export async function gradeEssayAnswer(request: GradingRequest): Promise<StructuredReview> {
  return (await gradeEssayAnswerDetailed(request)).review;
}
