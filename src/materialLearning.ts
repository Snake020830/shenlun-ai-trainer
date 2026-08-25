import { isTauri } from "@tauri-apps/api/core";
import type { Question } from "./types";
import { loadRemoteProviderConfig } from "./grading/providerSettings";
import type { RemoteJsonRequest, RemoteModelTransport } from "./grading/remote/config";
import { tauriSecureRemoteExecutor } from "./grading/remote/tauriExecutor";
import { createRemoteModelTransport } from "./grading/remote/transport";

export const MATERIAL_LEARNING_VERSION = "shenlun-material-learning@0.2.0";

export interface LearningThemeSummary {
  topic: string;
  coreQuestion: string;
  transferableInsight: string;
}

export interface LearningExpression {
  phrase: string;
  usage: string;
  sourceEvidence: string;
}

export interface LearningReasoningChain {
  chain: string;
  takeaway: string;
  transferableTo: string[];
  sourceEvidence: string;
}

export interface EssayMaterialUnit {
  title: string;
  fact: string;
  mechanism: string;
  usableClaim: string;
  transferableTo: string[];
  sourceEvidence: string;
}

export interface MaterialDeepReadOutput {
  referenceAnswer: string;
  answerBlueprint: string[];
  themeSummary: LearningThemeSummary;
  expressions: LearningExpression[];
  reasoningChains: LearningReasoningChain[];
  essayUnits: EssayMaterialUnit[];
}

const deepReadSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["referenceAnswer", "answerBlueprint", "themeSummary", "expressions", "reasoningChains", "essayUnits"],
  properties: {
    referenceAnswer: { type: "string" },
    answerBlueprint: { type: "array", items: { type: "string" } },
    themeSummary: {
      type: "object",
      additionalProperties: false,
      required: ["topic", "coreQuestion", "transferableInsight"],
      properties: {
        topic: { type: "string" },
        coreQuestion: { type: "string" },
        transferableInsight: { type: "string" }
      }
    },
    expressions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["phrase", "usage", "sourceEvidence"],
        properties: {
          phrase: { type: "string" },
          usage: { type: "string" },
          sourceEvidence: { type: "string" }
        }
      }
    },
    reasoningChains: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["chain", "takeaway", "transferableTo", "sourceEvidence"],
        properties: {
          chain: { type: "string" },
          takeaway: { type: "string" },
          transferableTo: { type: "array", items: { type: "string" } },
          sourceEvidence: { type: "string" }
        }
      }
    },
    essayUnits: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "fact", "mechanism", "usableClaim", "transferableTo", "sourceEvidence"],
        properties: {
          title: { type: "string" },
          fact: { type: "string" },
          mechanism: { type: "string" },
          usableClaim: { type: "string" },
          transferableTo: { type: "array", items: { type: "string" } },
          sourceEvidence: { type: "string" }
        }
      }
    }
  }
};

function questionPayload(question: Question) {
  return {
    id: question.id,
    title: question.title,
    type: question.type,
    score: question.score,
    wordLimit: question.wordLimit,
    prompt: question.prompt,
    materials: question.materials.map(item => ({ id: item.id, label: item.label, content: item.content }))
  };
}

export function buildMaterialDeepReadRequest(question: Question): RemoteJsonRequest {
  const answerInstruction = question.type === "文章写作"
    ? [
        "referenceAnswer 不套万能模板，也不要输出一篇空泛万能作文。请给出：中心立意 + 3个左右分论点 + 一段最有学习价值的示范论证，整体控制在900字以内。",
        "示范论证必须使用本题材料的事实或机制，但要完成抽象提升，体现可以迁移的大作文表达。"
      ].join("\n")
    : [
        `referenceAnswer 直接给出一版可以用于考场训练的参考作答，严格回应题干，原则上不超过 ${question.wordLimit} 字。`,
        "答案先保证得分维度完整，再做同类合并；保留主体、对象、中观词和关键机制，不堆材料例证。"
      ].join("\n");

  return {
    schemaName: "shenlun_material_deep_read_v02",
    jsonSchema: deepReadSchema,
    temperature: 0,
    maxOutputTokens: 8_000,
    instructions: [
      `你正在执行申论学习助手的“AI精读”任务，版本 ${MATERIAL_LEARNING_VERSION}。`,
      "这不是评分任务，也不要评价用户答案。只基于题干和给定材料完成参考作答与学习提炼。",
      "不得补写材料外事实；所有 sourceEvidence 必须能回指材料原意，不得伪造政策、人物、数字或案例。",
      "核心方法是：先整合材料逻辑，再做提炼。不要把每句话都拆成一个素材点，也不要把同一信息分别塞进多个栏目。",
      answerInstruction,
      "answerBlueprint 只保留2—4条最有用的答题结构提示：题干问什么、按什么维度组织、哪些中观词或机制不能丢。不要写长篇解释。",
      "themeSummary 必须先把整道题压缩成一个母题。topic 是简短主题；coreQuestion 是材料真正处理的核心矛盾/问题；transferableInsight 是可以迁移到其他申论主题中的上位判断，禁止空泛口号。",
      "expressions 只提炼3—6个真正值得复用的规范表达或中观词。phrase 要短；usage 要说明这个词在什么语境下比普通口语更准确。不要重复 themeSummary 或 reasoningChains。",
      "reasoningChains 只提炼1—3条最关键的因果链、作用路径或约束机制。chain 用“条件/动作 → 中间机制 → 结果”写清楚；takeaway 说明这条链对分析题或作文论证有什么价值。",
      "essayUnits 不是另做一套案例库，而是把材料中最值得带走的内容整合成0—2个大作文调用单元。每个单元必须完整包含：fact（事实压缩）→ mechanism（为什么会产生作用/问题）→ usableClaim（可直接上升为分论点或论证判断）。",
      "essayUnits 与 reasoningChains 不得机械重复：reasoningChains 讲通用机制，essayUnits 负责把事实、机制和观点绑成可调用的作文素材。",
      "宁缺毋滥。没有完整案例就返回空 essayUnits；不要为了凑数量生成同义表达、空话或材料外常识。"
    ].join("\n"),
    input: JSON.stringify({ question: questionPayload(question) })
  };
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map(item => item.trim()) : [];
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function validateDeepRead(value: unknown): MaterialDeepReadOutput {
  if (!value || typeof value !== "object") throw new Error("AI精读返回内容不是对象。");
  const data = value as Record<string, unknown>;
  const referenceAnswer = asText(data.referenceAnswer);
  if (!referenceAnswer) throw new Error("AI精读缺少参考作答。");

  const themeRaw = data.themeSummary && typeof data.themeSummary === "object"
    ? data.themeSummary as Record<string, unknown>
    : null;
  const themeSummary = {
    topic: asText(themeRaw?.topic),
    coreQuestion: asText(themeRaw?.coreQuestion),
    transferableInsight: asText(themeRaw?.transferableInsight)
  };
  if (!themeSummary.topic || !themeSummary.coreQuestion || !themeSummary.transferableInsight) {
    throw new Error("AI精读缺少整合后的主题判断。");
  }

  const expressions = Array.isArray(data.expressions) ? data.expressions.map(item => item as Record<string, unknown>).map(item => ({
    phrase: asText(item.phrase),
    usage: asText(item.usage),
    sourceEvidence: asText(item.sourceEvidence)
  })).filter(item => item.phrase && item.usage && item.sourceEvidence) : [];

  const reasoningChains = Array.isArray(data.reasoningChains) ? data.reasoningChains.map(item => item as Record<string, unknown>).map(item => ({
    chain: asText(item.chain),
    takeaway: asText(item.takeaway),
    transferableTo: asStringArray(item.transferableTo),
    sourceEvidence: asText(item.sourceEvidence)
  })).filter(item => item.chain && item.takeaway && item.sourceEvidence) : [];

  const essayUnits = Array.isArray(data.essayUnits) ? data.essayUnits.map(item => item as Record<string, unknown>).map(item => ({
    title: asText(item.title),
    fact: asText(item.fact),
    mechanism: asText(item.mechanism),
    usableClaim: asText(item.usableClaim),
    transferableTo: asStringArray(item.transferableTo),
    sourceEvidence: asText(item.sourceEvidence)
  })).filter(item => item.title && item.fact && item.mechanism && item.usableClaim && item.sourceEvidence) : [];

  return {
    referenceAnswer,
    answerBlueprint: asStringArray(data.answerBlueprint).slice(0, 4),
    themeSummary,
    expressions: expressions.slice(0, 6),
    reasoningChains: reasoningChains.slice(0, 3),
    essayUnits: essayUnits.slice(0, 2)
  };
}

async function resolveLearningTransport(): Promise<RemoteModelTransport> {
  if (!isTauri()) throw new Error("AI精读需要 Tauri 桌面版运行。浏览器预览不能读取系统凭据库中的 API Key。");
  const stored = await loadRemoteProviderConfig();
  if (!stored.baseUrl.trim() || !stored.model.trim()) {
    throw new Error("尚未配置 AI 模型。请先到“设置”填写 Base URL、模型并保存 API Key。AI批改可以关闭，不影响 AI精读。" );
  }
  const config = { ...stored, enabled: true };
  return createRemoteModelTransport(config, tauriSecureRemoteExecutor);
}

export async function deepReadQuestion(question: Question): Promise<MaterialDeepReadOutput> {
  const transport = await resolveLearningTransport();
  const request = buildMaterialDeepReadRequest(question);
  let firstError: unknown;
  try {
    const response = await transport.completeJson<unknown>(request);
    return validateDeepRead(response.data);
  } catch (error) {
    firstError = error;
  }

  try {
    const response = await transport.completeJson<unknown>({
      ...request,
      promptOnlyJson: true,
      disableThinking: true,
      instructions: `${request.instructions}\n\n上一次输出未能被应用读取。本次请直接生成最终合法 JSON，不要解释错误，也不要展开思考过程。`
    });
    return validateDeepRead(response.data);
  } catch (retryError) {
    const message = retryError instanceof Error ? retryError.message : typeof retryError === "string" ? retryError : "未知错误";
    const first = firstError instanceof Error ? firstError.message : typeof firstError === "string" ? firstError : "";
    throw new Error(`AI精读失败：${message}${first && first !== message ? `（首次错误：${first}）` : ""}`);
  }
}
