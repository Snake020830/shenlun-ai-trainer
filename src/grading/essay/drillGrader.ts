import { isTauri } from "@tauri-apps/api/core";
import { evaluateEssayDrill, evaluateEssayDrillOverall } from "../../essayDrill";
import type { EssayDrillMode } from "../../essayDrillStore";
import { loadGradingStyleProfile } from "../gradingStyleSettings";
import { hasValidProviderSmoke } from "../providerGate";
import { loadRemoteProviderConfig } from "../providerSettings";
import type { RemoteJsonRequest, RemoteModelTransport } from "../remote/config";
import { tauriSecureRemoteExecutor } from "../remote/tauriExecutor";
import { createRemoteModelTransport } from "../remote/transport";
import type { EssayDrillGradingRequest, EssayDrillProfessionalReview, EssayDrillStepReview } from "./drillArtifacts";
import { essayDrillAnswerPayload } from "./drillArtifacts";
import { ESSAY_DIAGNOSTIC_DISCLAIMER } from "./evidence";
import { buildEssayDrillReviewRequest } from "./drillPrompts";
import { validateEssayDrillReview } from "./drillValidation";

const STEP_META: Record<EssayDrillMode, { label: string; rules: string[] }> = {
  theme: { label: "审题立意", rules: ["YD-THEME-01", "YD-THESIS-02"] },
  outline: { label: "分论点", rules: ["YD-SUBPOINT-03", "YD-STRUCTURE-04"] },
  paragraph: { label: "主体论证", rules: ["YD-ARGUMENT-06", "YD-EVIDENCE-07"] },
  evidence: { label: "素材转化", rules: ["YD-EVIDENCE-07"] },
  closing: { label: "结尾收束", rules: ["YD-CLOSING-08", "YD-EXPRESSION-09"] }
};

function errorText(error: unknown): string {
  return error instanceof Error && error.message.trim() ? error.message.trim() : String(error);
}

async function runRemoteReview(transport: RemoteModelTransport, request: RemoteJsonRequest) {
  let firstError: unknown;
  try {
    const response = await transport.completeJson<unknown>(request);
    return validateEssayDrillReview(response.data);
  } catch (error) {
    firstError = error;
  }
  try {
    const response = await transport.completeJson<unknown>({
      ...request,
      temperature: 0,
      promptOnlyJson: true,
      disableThinking: true,
      maxOutputTokens: Math.max(request.maxOutputTokens ?? 0, 10_000),
      instructions: `${request.instructions}\n上一次输出未通过结构校验。请重做并只返回 JSON。校验错误：${errorText(firstError)}`
    });
    return validateEssayDrillReview(response.data);
  } catch (error) {
    throw new Error(`五步短练整体批改失败：${errorText(error)}`);
  }
}

function compact(value: string): string {
  return value.replace(/\s+/g, "").trim();
}

function excerpt(value: string): string {
  const text = value.trim();
  return text ? text.slice(0, 180) : "本步未作答";
}

function sharedRatio(left: string, right: string): number {
  const ignored = new Set("的了是在与和及以把让要为而也并从中对上下一二三四五，。；：、！？“”‘’（）()1234567890".split(""));
  const leftChars = new Set([...compact(left)].filter(char => !ignored.has(char)));
  const rightChars = new Set([...compact(right)].filter(char => !ignored.has(char)));
  if (!leftChars.size || !rightChars.size) return 0;
  return [...leftChars].filter(char => rightChars.has(char)).length / Math.min(leftChars.size, rightChars.size);
}

function localRewrite(mode: EssayDrillMode, request: EssayDrillGradingRequest): string {
  const answer = essayDrillAnswerPayload(request.draft);
  const firstSubpoint = answer.subpoints.split(/[\n；;。]+/).map(item => item.trim()).find(Boolean) || "分论点";
  if (mode === "theme") return `标题建议保留题干核心词，并采用“行动/对策 + 目标/影响”；总论点可改为：以……破解……，以……推动……，让……转化为……。`;
  if (mode === "outline") return "将2—3条分论点统一为平行句式，并为每条分别标注题干、题干所在材料或全篇材料中的依据。";
  if (mode === "paragraph") return `${firstSubpoint}。先解释该观点为何成立，再写材料中的主体、做法和结果，最后补一句“这一案例说明……”，回扣本段观点。`;
  if (mode === "evidence") return "按“谁面对什么问题—采取什么做法—产生什么结果—因此证明哪个分论点”压缩材料，删除与当前观点无关的细节。";
  return "结尾先换一种说法回扣标题和总论点，再压缩照应分论点，最后用一条与正文一致的行动或愿景收束。";
}

function localReview(request: EssayDrillGradingRequest): EssayDrillProfessionalReview {
  const draft = request.draft;
  const answer = essayDrillAnswerPayload(draft);
  const values: Record<EssayDrillMode, string> = {
    theme: [answer.title, answer.thesis].filter(Boolean).join("；"),
    outline: answer.subpoints,
    paragraph: answer.bodyParagraph,
    evidence: answer.materialTransformation,
    closing: answer.closing
  };
  const modes: EssayDrillMode[] = ["theme", "outline", "paragraph", "evidence", "closing"];
  const stepReviews: EssayDrillStepReview[] = modes.map(mode => {
    const feedback = evaluateEssayDrill(mode, draft);
    const missing = !compact(values[mode]);
    return {
      id: mode,
      label: STEP_META[mode].label,
      status: missing ? "missing" : feedback.passed ? "strong" : "developing",
      finding: missing ? "本步没有可供批改的答案。" : feedback.review,
      answerEvidence: excerpt(values[mode]),
      courseRuleIds: STEP_META[mode].rules,
      action: feedback.nextStep,
      rewriteExample: localRewrite(mode, request)
    };
  });
  const links = [
    ["标题—总论点", answer.title, answer.thesis],
    ["总论点—分论点", answer.thesis, answer.subpoints],
    ["分论点—主体段", answer.subpoints, answer.bodyParagraph],
    ["主体段—素材", answer.bodyParagraph, answer.materialTransformation],
    ["总论点—结尾", answer.thesis, answer.closing]
  ] as const;
  const breakpoints = links.filter(([, left, right]) => sharedRatio(left, right) < 0.15).map(([label]) => `${label}之间的核心词呼应偏弱或存在空缺。`);
  const basic = evaluateEssayDrillOverall(draft);
  return {
    schemaVersion: "1.0.0",
    providerKind: "local",
    overallLevel: stepReviews.some(step => step.status === "missing") ? "incomplete" : basic.passed && !breakpoints.length ? "ready" : "revise",
    summary: `${basic.summary} 本地诊断已检查五步的结构完整性与关键词呼应，但不能替代模型对题干、材料和论证关系的语义判断。`,
    coherence: {
      finding: breakpoints.length ? "五步主线存在断点，标题、观点、论据或结尾尚未完全围绕同一中心推进。" : "五步之间已有基本关键词呼应，可继续检查材料证据是否真正支撑对应观点。",
      breakpoints,
      action: breakpoints[0] ?? "逐条给分论点标注材料依据，再检查主体段和结尾是否复用同一组核心概念。"
    },
    stepReviews,
    priorityActions: basic.priorities.slice(0, 5),
    assemblyPlan: [
      `标题：${answer.title || "补写回应题干核心词的自拟标题"}`,
      `开头：围绕“${answer.thesis || "总论点"}”完成背景、影响、过渡和立论。`,
      "主体一：选择第一条分论点，加入材料事实、分析和回扣。",
      "主体二：选择第二条分论点，使用不同材料或不同论证要素。",
      "主体三：如有第三条分论点，确保与前两条同层且不重复。",
      `结尾：以“${answer.closing || "回扣总论点并展望"}”为基础压缩收束。`
    ],
    warnings: ["当前使用本地课程结构诊断，不能完成材料事实核对、分论点来源追踪和论据证明力的语义判断。启用并通过远程模型自检后，五步整体批改会返回完整的课程证据诊断。"]
  };
}

export async function gradeEssayDrill(request: EssayDrillGradingRequest): Promise<EssayDrillProfessionalReview> {
  if (request.question.type !== "文章写作") throw new Error("五步短练批改只支持文章写作题。");
  const [config, gradingStyle] = await Promise.all([loadRemoteProviderConfig(), loadGradingStyleProfile()]);
  if (!config.enabled) return localReview(request);
  if (!isTauri()) throw new Error("远程五步短练批改需要在桌面版中运行。");
  if (!(await hasValidProviderSmoke(config))) throw new Error("当前远程模型尚未通过完整批改链自检，请先到设置中完成自检。");
  const transport = createRemoteModelTransport(config, tauriSecureRemoteExecutor);
  const result = await runRemoteReview(transport, buildEssayDrillReviewRequest(request.question, request.draft, gradingStyle.prompt));
  return {
    schemaVersion: "1.0.0",
    providerKind: "remote",
    ...result,
    warnings: [ESSAY_DIAGNOSTIC_DISCLAIMER, "五步短练批改评价的是写作骨架，不折算为整篇作文考试分数。"]
  };
}
