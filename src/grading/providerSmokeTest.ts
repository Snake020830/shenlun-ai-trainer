import type { Question } from "../types";
import type { RemoteProviderPublicConfig } from "./remote/config";
import { createRemoteWorkflowProvider } from "./remote/remoteWorkflowProvider";
import { tauriSecureRemoteExecutor } from "./remote/tauriExecutor";
import { createRemoteModelTransport } from "./remote/transport";
import { runShenlunGraderSkillWithProvider, type ShenlunGraderResult } from "./shenlunGraderSkill";

export const PROVIDER_SMOKE_TEST_VERSION = "shenlun-provider-smoke@0.1.0";

const SMOKE_QUESTION: Question = {
  id: "debug-provider-smoke-001",
  title: "AI 批改链自检",
  year: 2026,
  region: "系统自检",
  type: "概括归纳",
  difficulty: "基础",
  score: 10,
  wordLimit: 100,
  prompt: "根据给定资料，概括S市优化政务服务的主要做法。",
  materials: [
    {
      id: "m1",
      label: "材料1",
      content: "S市将分散在多个部门的办事窗口整合到综合服务专区，并把一批高频审批事项下沉到基层办理。同时建立项目服务专员机制，由专员跟踪企业需求、协调部门解决问题。"
    }
  ],
  tags: ["system-smoke-test"],
  source: "builtin"
};

const SMOKE_ANSWER = "整合分散办事窗口，推动高频审批事项下沉基层，建立项目服务专员机制跟踪协调企业需求。";

export interface ProviderSmokeTestReport {
  version: typeof PROVIDER_SMOKE_TEST_VERSION;
  providerId: string;
  model: string;
  protocol: string;
  reasoningEffort: string;
  skillVersion: string;
  rulesetVersion: string;
  materialCandidateCount: number;
  rubricCount: number;
  mappingCount: number;
  answerCharCount: number;
  scoreInterpretation: ShenlunGraderResult["meta"]["scoreInterpretation"];
  passedAt: string;
}

export function validateProviderSmokeResult(
  result: ShenlunGraderResult,
  config: RemoteProviderPublicConfig
): ProviderSmokeTestReport {
  if (result.meta.providerKind !== "remote") {
    throw new Error("完整批改链自检没有使用远程 AI provider。")
  }
  if (!result.artifacts) throw new Error("完整批改链自检缺少 workflow artifacts。")
  if (!result.artifacts.materialCandidates.length) throw new Error("完整批改链自检失败：材料盲抽为空。")
  if (!result.artifacts.rubric.length) throw new Error("完整批改链自检失败：rubric 为空。")
  if (result.artifacts.mappings.length !== result.artifacts.rubric.length) {
    throw new Error("完整批改链自检失败：答案映射数量与 rubric 不一致。")
  }

  return {
    version: PROVIDER_SMOKE_TEST_VERSION,
    providerId: result.meta.providerId,
    model: config.model,
    protocol: config.protocol,
    reasoningEffort: config.reasoningEffort,
    skillVersion: result.meta.skillVersion,
    rulesetVersion: result.meta.rulesetVersion,
    materialCandidateCount: result.artifacts.materialCandidates.length,
    rubricCount: result.artifacts.rubric.length,
    mappingCount: result.artifacts.mappings.length,
    answerCharCount: result.meta.preflight.answerCharCount,
    scoreInterpretation: result.meta.scoreInterpretation,
    passedAt: new Date().toISOString()
  };
}

export async function runProviderSmokeTest(config: RemoteProviderPublicConfig): Promise<ProviderSmokeTestReport> {
  const testConfig: RemoteProviderPublicConfig = { ...config, enabled: true };
  const transport = createRemoteModelTransport(testConfig, tauriSecureRemoteExecutor);
  const provider = createRemoteWorkflowProvider(transport);
  const result = await runShenlunGraderSkillWithProvider({
    question: SMOKE_QUESTION,
    answer: SMOKE_ANSWER
  }, provider);
  return validateProviderSmokeResult(result, testConfig);
}
