import type { Question } from "../types";
import { validatePublicProviderConfig, type RemoteProviderPublicConfig } from "./remote/config";
import { createRemoteWorkflowProvider } from "./remote/remoteWorkflowProvider";
import { tauriSecureRemoteExecutor } from "./remote/tauriExecutor";
import { createRemoteModelTransport } from "./remote/transport";
import { runShenlunGraderSkillWithProvider, type ShenlunGraderResult } from "./shenlunGraderSkill";

export const PROVIDER_SMOKE_TEST_VERSION = "shenlun-provider-smoke@0.2.0";

const SMOKE_QUESTION: Question = {
  id: "debug-provider-smoke-002",
  title: "AI 批改链真实负载自检",
  year: 2026,
  region: "系统自检",
  type: "概括归纳",
  difficulty: "进阶",
  score: 20,
  wordLimit: 300,
  prompt: "根据给定资料，概括R县提升涉企服务质效的主要做法。",
  materials: [
    {
      id: "m1",
      label: "材料1",
      content: [
        "过去，R县企业办理项目手续时，需要在多个部门之间反复跑动，不同窗口使用的材料清单和数据口径也不完全一致。为解决这些问题，县政务服务中心把发改、住建、自然资源等部门的高频涉企事项集中到企业服务专区，统一事项清单、申请表单和材料名称，并建立一次告知制度。对能够下沉办理的事项，县里按照统一标准授权乡镇便民服务中心受理，减少企业往返县城的次数。",
        "针对重点项目，R县建立项目服务专员制度。专员从项目签约开始持续跟踪需求，对企业反映的问题先分类登记，再根据职责推送到相关部门。涉及多个部门的复杂事项，由县级协调机制召集联合会商，明确牵头部门、办理节点和反馈时限。县里还建设了事项进度台账，对超期事项自动提醒，并要求责任部门说明原因。",
        "为减少重复填报，R县推动部门之间共享企业基础信息，对已经能够通过系统核验的证照和材料，不再要求企业重复提交。窗口工作人员定期接受业务培训和情景演练，重点解决政策口径不一致、一次告知不到位等问题。政务服务中心每季度回访一批办事企业，根据企业评价梳理高频堵点，并把整改情况纳入窗口和部门服务质效评价。",
        "此外，R县设置企业诉求热线和线上专区，统一归集咨询、投诉和建议。对普遍性问题，相关部门不仅处理单个诉求，还同步检查办事指南和流程设置是否需要调整；对政策变化较大的事项，则及时更新线上线下办事指引，避免企业依据旧口径准备材料。"
      ].join("\n\n")
    }
  ],
  tags: ["system-smoke-test", "realistic-load"],
  source: "builtin"
};

const SMOKE_ANSWER = "集中高频涉企事项，统一清单、表单和材料口径并实行一次告知；推动符合条件事项下沉乡镇办理；建立项目服务专员和跨部门会商机制，分类流转诉求、明确牵头部门和办理时限；建设进度台账并对超期事项提醒督办；共享企业基础信息，减少重复提交；加强窗口业务培训和情景演练；定期回访企业、梳理堵点并纳入服务评价；统一热线和线上专区，根据共性诉求及时优化指南与流程。";

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

export async function runProviderSmokeTest(config: RemoteProviderPublicConfig, customSkillInstructions = ""): Promise<ProviderSmokeTestReport> {
  const testConfig: RemoteProviderPublicConfig = { ...config, enabled: true };
  validatePublicProviderConfig(testConfig);
  const transport = createRemoteModelTransport(testConfig, tauriSecureRemoteExecutor);
  const provider = createRemoteWorkflowProvider(transport, undefined, customSkillInstructions);
  const result = await runShenlunGraderSkillWithProvider({
    question: SMOKE_QUESTION,
    answer: SMOKE_ANSWER
  }, provider);
  return validateProviderSmokeResult(result, testConfig);
}
