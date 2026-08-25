import { isTauri } from "@tauri-apps/api/core";
import type { Question } from "./types";
import { loadRemoteProviderConfig } from "./grading/providerSettings";
import type { RemoteJsonRequest, RemoteModelTransport } from "./grading/remote/config";
import { tauriSecureRemoteExecutor } from "./grading/remote/tauriExecutor";
import { createRemoteModelTransport } from "./grading/remote/transport";

export const MATERIAL_LEARNING_VERSION = "shenlun-material-learning@0.1.0";

export interface LearningExpression {
  phrase: string;
  meaning: string;
  useCases: string[];
  sourceEvidence: string;
}

export interface LearningMechanism {
  title: string;
  chain: string;
  transferableTo: string[];
  sourceEvidence: string;
}

export interface LearningCase {
  title: string;
  summary: string;
  transferableTo: string[];
  sourceEvidence: string;
}

export interface EssayAngle {
  claim: string;
  reasoning: string;
  paragraphUse: string;
  transferableTo: string[];
}

export interface MaterialDeepReadOutput {
  referenceAnswer: string;
  answerNotes: string[];
  expressions: LearningExpression[];
  mechanisms: LearningMechanism[];
  cases: LearningCase[];
  essayAngles: EssayAngle[];
}

const deepReadSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["referenceAnswer", "answerNotes", "expressions", "mechanisms", "cases", "essayAngles"],
  properties: {
    referenceAnswer: { type: "string" },
    answerNotes: { type: "array", items: { type: "string" } },
    expressions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["phrase", "meaning", "useCases", "sourceEvidence"],
        properties: {
          phrase: { type: "string" },
          meaning: { type: "string" },
          useCases: { type: "array", items: { type: "string" } },
          sourceEvidence: { type: "string" }
        }
      }
    },
    mechanisms: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "chain", "transferableTo", "sourceEvidence"],
        properties: {
          title: { type: "string" },
          chain: { type: "string" },
          transferableTo: { type: "array", items: { type: "string" } },
          sourceEvidence: { type: "string" }
        }
      }
    },
    cases: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "summary", "transferableTo", "sourceEvidence"],
        properties: {
          title: { type: "string" },
          summary: { type: "string" },
          transferableTo: { type: "array", items: { type: "string" } },
          sourceEvidence: { type: "string" }
        }
      }
    },
    essayAngles: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["claim", "reasoning", "paragraphUse", "transferableTo"],
        properties: {
          claim: { type: "string" },
          reasoning: { type: "string" },
          paragraphUse: { type: "string" },
          transferableTo: { type: "array", items: { type: "string" } }
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
        "referenceAnswer 不要输出一篇空泛万能作文。请给出：中心立意 + 3个左右分论点 + 一段最有学习价值的示范论证，整体控制在900字以内。",
        "示范论证必须使用本题材料的事实或机制，但要完成抽象提升，体现可以迁移的大作文表达。"
      ].join("\n")
    : [
        `referenceAnswer 直接给出一版可以用于考场训练的参考作答，严格回应题干，原则上不超过 ${question.wordLimit} 字。`,
        "答案先保证得分维度完整，再做同类合并；保留主体、对象、中观词和关键机制，不堆材料例证。"
      ].join("\n");

  return {
    schemaName: "shenlun_material_deep_read_v01",
    jsonSchema: deepReadSchema,
    temperature: 0,
    instructions: [
      `你正在执行申论学习助手的“AI精读”任务，版本 ${MATERIAL_LEARNING_VERSION}。`,
      "这不是评分任务，也不要评价用户答案。只基于题干和给定材料完成参考作答与学习素材提炼。",
      "不得补写材料外事实；sourceEvidence 必须能回指材料原意，不得伪造政策、人物、数字或案例。",
      answerInstruction,
      "answerNotes 用2—5条说明这版参考作答的组织逻辑，例如题干问数、分类方式、为什么保留某个机制词。不要写长篇思维过程。",
      "expressions 只提炼真正值得复用的规范表达/中观词，优先是能够提高申论概括层级且不空泛的词。每条 phrase 尽量短。",
      "mechanisms 提炼可以迁移的因果链、作用路径或约束机制，用“条件/动作 → 中间机制 → 结果”的方式写清楚。",
      "cases 只保留材料中事实完整、可转化为作文例证的案例；若材料没有足够完整的案例，可以返回空数组。",
      "essayAngles 提炼可以用于大作文的观点和论证角度。观点必须来自材料逻辑，但表达要完成适度抽象，避免变成仅适用于本题的细节。",
      "不要为了凑数量重复同义内容。一般 expressions 3—8条、mechanisms 1—5条、cases 0—3条、essayAngles 2—5条即可。"
    ].join("\n"),
    input: JSON.stringify({ question: questionPayload(question) })
  };
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function validateDeepRead(value: unknown): MaterialDeepReadOutput {
  if (!value || typeof value !== "object") throw new Error("AI精读返回内容不是对象。");
  const data = value as Record<string, unknown>;
  if (typeof data.referenceAnswer !== "string" || !data.referenceAnswer.trim()) throw new Error("AI精读缺少参考作答。");

  const expressions = Array.isArray(data.expressions) ? data.expressions.map(item => item as Record<string, unknown>).filter(item =>
    typeof item.phrase === "string" && typeof item.meaning === "string" && typeof item.sourceEvidence === "string"
  ).map(item => ({
    phrase: String(item.phrase).trim(),
    meaning: String(item.meaning).trim(),
    useCases: asStringArray(item.useCases),
    sourceEvidence: String(item.sourceEvidence).trim()
  })) : [];

  const mechanisms = Array.isArray(data.mechanisms) ? data.mechanisms.map(item => item as Record<string, unknown>).filter(item =>
    typeof item.title === "string" && typeof item.chain === "string" && typeof item.sourceEvidence === "string"
  ).map(item => ({
    title: String(item.title).trim(),
    chain: String(item.chain).trim(),
    transferableTo: asStringArray(item.transferableTo),
    sourceEvidence: String(item.sourceEvidence).trim()
  })) : [];

  const cases = Array.isArray(data.cases) ? data.cases.map(item => item as Record<string, unknown>).filter(item =>
    typeof item.title === "string" && typeof item.summary === "string" && typeof item.sourceEvidence === "string"
  ).map(item => ({
    title: String(item.title).trim(),
    summary: String(item.summary).trim(),
    transferableTo: asStringArray(item.transferableTo),
    sourceEvidence: String(item.sourceEvidence).trim()
  })) : [];

  const essayAngles = Array.isArray(data.essayAngles) ? data.essayAngles.map(item => item as Record<string, unknown>).filter(item =>
    typeof item.claim === "string" && typeof item.reasoning === "string" && typeof item.paragraphUse === "string"
  ).map(item => ({
    claim: String(item.claim).trim(),
    reasoning: String(item.reasoning).trim(),
    paragraphUse: String(item.paragraphUse).trim(),
    transferableTo: asStringArray(item.transferableTo)
  })) : [];

  return {
    referenceAnswer: data.referenceAnswer.trim(),
    answerNotes: asStringArray(data.answerNotes),
    expressions,
    mechanisms,
    cases,
    essayAngles
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
      instructions: `${request.instructions}\n\n上一次输出未能被应用读取。请重新生成同一任务，只返回满足 JSON 结构的内容，不要解释错误。`
    });
    return validateDeepRead(response.data);
  } catch (retryError) {
    const message = retryError instanceof Error ? retryError.message : typeof retryError === "string" ? retryError : "未知错误";
    const first = firstError instanceof Error ? firstError.message : typeof firstError === "string" ? firstError : "";
    throw new Error(`AI精读失败：${message}${first && first !== message ? `（首次错误：${first}）` : ""}`);
  }
}
