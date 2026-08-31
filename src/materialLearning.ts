import { isTauri } from "@tauri-apps/api/core";
import type { Question } from "./types";
import { loadRemoteProviderConfig } from "./grading/providerSettings";
import type { RemoteJsonRequest, RemoteModelTransport } from "./grading/remote/config";
import { tauriSecureRemoteExecutor } from "./grading/remote/tauriExecutor";
import { createRemoteModelTransport } from "./grading/remote/transport";

export const MATERIAL_LEARNING_VERSION = "shenlun-material-learning@0.3.0";

export type DeepReadAnnotationType = "problem" | "practice" | "effect" | "insight";

export interface DeepReadAnnotation {
  /** A short, verbatim and continuous excerpt from one material block. */
  quote: string;
  type: DeepReadAnnotationType;
  keyPoint: string;
}

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
  annotations: DeepReadAnnotation[];
  referenceAnswer: string;
  answerNotes: string[];
  examApproach: string[];
  expressions: LearningExpression[];
  mechanisms: LearningMechanism[];
  cases: LearningCase[];
  essayAngles: EssayAngle[];
}

const deepReadSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["annotations", "referenceAnswer", "answerNotes", "examApproach", "expressions", "mechanisms", "cases", "essayAngles"],
  properties: {
    annotations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["quote", "type", "keyPoint"],
        properties: {
          quote: { type: "string" },
          type: { type: "string", enum: ["problem", "practice", "effect", "insight"] },
          keyPoint: { type: "string" }
        }
      }
    },
    referenceAnswer: { type: "string" },
    answerNotes: { type: "array", items: { type: "string" } },
    examApproach: { type: "array", items: { type: "string" } },
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
  const materialLength = question.materials.reduce((sum, material) => sum + material.content.length, 0);
  const annotationTarget = Math.min(22, Math.max(6, Math.ceil(materialLength / 170)));
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
    schemaName: "shenlun_material_deep_read_v03",
    jsonSchema: deepReadSchema,
    temperature: 0,
    instructions: [
      `你正在执行申论学习助手的“AI精读”任务，版本 ${MATERIAL_LEARNING_VERSION}。`,
      "这不是评分任务，也不要评价用户答案。只基于题干和给定材料完成参考作答与学习素材提炼。",
      "不得补写材料外事实；sourceEvidence 必须能回指材料原意，不得伪造政策、人物、数字或案例。",
      `annotations 用于在原文中直接做彩色标注。本题材料共约 ${materialLength} 字，预计提炼约 ${annotationTarget} 处；这是覆盖提示而非硬性凑数，短材料可更少，长材料可更多。`,
      "每条 quote 必须逐字复制材料中的一段连续原文，通常控制在8—60字，不得改写；keyPoint 用一句简洁的申论语言概括该处得分含义。",
      "标注的首要标准是得分信息覆盖：referenceAnswer 中每个独立得分点至少回指一条 annotation。逐段复核所有材料，凡能直接支撑答案的问题、原因、做法、成效、观点或关键事实都应标注；纯背景、过渡和重复例证可以不标。不得因为材料较长而只标后半段或只保留少量代表项。",
      "type 只能是 problem（直接问题/缺陷）、practice（行动/制度/措施）、effect（结果/影响）、insight（原因/机制/观点/原则）。依据原文信息性质分类，不要因为题目问“问题”就把所有证据机械标成 problem；同一处只保留最准确的类型，也不要为了颜色丰富而误分类。",
      answerInstruction,
      "answerNotes 用2—5条说明这版参考作答的组织逻辑，例如题干问数、分类方式、为什么保留某个机制词。不要写长篇思维过程。",
      "examApproach 用3—5个短步骤说明考场上如何审题、定位、归类、组织并检查答案。每步写可执行动作，不输出隐藏思维过程或冗长解释。",
      "expressions 只提炼真正值得复用的规范表达/中观词，优先是能够提高申论概括层级且不空泛的词。每条 phrase 尽量短。",
      "mechanisms 提炼可以迁移的因果链、作用路径或约束机制，用“条件/动作 → 中间机制 → 结果”的方式写清楚。",
      "cases 只保留材料中事实完整、可转化为作文例证的案例；若材料没有足够完整的案例，可以返回空数组。",
      "essayAngles 提炼可以用于大作文的观点和论证角度。观点必须来自材料逻辑，但表达要完成适度抽象，避免变成仅适用于本题的细节。",
      "提交前做一次覆盖核对：逐项检查 referenceAnswer 的得分点是否能在 annotations 中找到原文证据，并检查材料后半部分是否存在被遗漏的有效信息。",
      "不要为了凑数量重复同义内容。一般 expressions 3—8条、mechanisms 1—5条、cases 0—3条、essayAngles 2—5条即可。"
    ].join("\n"),
    input: JSON.stringify({ question: questionPayload(question) })
  };
}

function asRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`AI精读字段 ${field} 必须是对象。`);
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`AI精读字段 ${field} 不能为空。`);
  return value.trim();
}

function requiredStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || !value.every(item => typeof item === "string" && item.trim())) {
    throw new Error(`AI精读字段 ${field} 必须是非空字符串数组。`);
  }
  return value.map(item => item.trim());
}

function optionalStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || !value.every(item => typeof item === "string" && item.trim())) {
    throw new Error(`AI精读字段 ${field} 必须是字符串数组。`);
  }
  return value.map(item => item.trim());
}

export function validateMaterialDeepReadOutput(value: unknown): MaterialDeepReadOutput {
  if (!value || typeof value !== "object") throw new Error("AI精读返回内容不是对象。");
  const data = value as Record<string, unknown>;
  // annotations/examApproach were added in v0.2. Keep v0.1 snapshots readable so
  // users do not lose their completed-article archive after the UI upgrade.
  const requiredArrays = ["answerNotes", "expressions", "mechanisms", "cases", "essayAngles"];
  for (const field of requiredArrays) if (!Array.isArray(data[field])) throw new Error(`AI精读缺少字段 ${field}。`);

  const annotationTypes = new Set<DeepReadAnnotationType>(["problem", "practice", "effect", "insight"]);
  if (data.annotations !== undefined && !Array.isArray(data.annotations)) throw new Error("AI精读字段 annotations 必须是数组。");
  const annotations = ((data.annotations ?? []) as unknown[]).map((value, index) => {
    const item = asRecord(value, `annotations[${index}]`);
    const type = requiredText(item.type, `annotations[${index}].type`) as DeepReadAnnotationType;
    if (!annotationTypes.has(type)) throw new Error(`AI精读字段 annotations[${index}].type 无效。`);
    return {
      quote: requiredText(item.quote, `annotations[${index}].quote`),
      type,
      keyPoint: requiredText(item.keyPoint, `annotations[${index}].keyPoint`)
    };
  });

  const expressions = (data.expressions as unknown[]).map((value, index) => {
    const item = asRecord(value, `expressions[${index}]`);
    return {
      phrase: requiredText(item.phrase, `expressions[${index}].phrase`),
      meaning: requiredText(item.meaning, `expressions[${index}].meaning`),
      useCases: requiredStringArray(item.useCases, `expressions[${index}].useCases`),
      sourceEvidence: requiredText(item.sourceEvidence, `expressions[${index}].sourceEvidence`)
    };
  });

  const mechanisms = (data.mechanisms as unknown[]).map((value, index) => {
    const item = asRecord(value, `mechanisms[${index}]`);
    return {
      title: requiredText(item.title, `mechanisms[${index}].title`),
      chain: requiredText(item.chain, `mechanisms[${index}].chain`),
      transferableTo: requiredStringArray(item.transferableTo, `mechanisms[${index}].transferableTo`),
      sourceEvidence: requiredText(item.sourceEvidence, `mechanisms[${index}].sourceEvidence`)
    };
  });

  const cases = (data.cases as unknown[]).map((value, index) => {
    const item = asRecord(value, `cases[${index}]`);
    return {
      title: requiredText(item.title, `cases[${index}].title`),
      summary: requiredText(item.summary, `cases[${index}].summary`),
      transferableTo: requiredStringArray(item.transferableTo, `cases[${index}].transferableTo`),
      sourceEvidence: requiredText(item.sourceEvidence, `cases[${index}].sourceEvidence`)
    };
  });

  const essayAngles = (data.essayAngles as unknown[]).map((value, index) => {
    const item = asRecord(value, `essayAngles[${index}]`);
    return {
      claim: requiredText(item.claim, `essayAngles[${index}].claim`),
      reasoning: requiredText(item.reasoning, `essayAngles[${index}].reasoning`),
      paragraphUse: requiredText(item.paragraphUse, `essayAngles[${index}].paragraphUse`),
      transferableTo: requiredStringArray(item.transferableTo, `essayAngles[${index}].transferableTo`)
    };
  });

  const migratedAnnotations: DeepReadAnnotation[] = data.annotations === undefined ? [
    ...expressions.map(item => ({ quote: item.sourceEvidence, type: "insight" as const, keyPoint: `${item.phrase}：${item.meaning}` })),
    ...mechanisms.map(item => ({ quote: item.sourceEvidence, type: "insight" as const, keyPoint: `${item.title}：${item.chain}` })),
    ...cases.map(item => ({ quote: item.sourceEvidence, type: "effect" as const, keyPoint: item.summary }))
  ].slice(0, 8) : annotations;
  const answerNotes = optionalStringArray(data.answerNotes, "answerNotes");
  const examApproach = data.examApproach === undefined
    ? (answerNotes.length ? answerNotes : ["审清作答对象与要求。", "逐段定位材料要点。", "分类合并后按题目要求作答。"])
    : requiredStringArray(data.examApproach, "examApproach");

  return {
    annotations: migratedAnnotations,
    referenceAnswer: requiredText(data.referenceAnswer, "referenceAnswer"),
    answerNotes,
    examApproach,
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
    return validateMaterialDeepReadOutput(response.data);
  } catch (error) {
    firstError = error;
  }

  try {
    const response = await transport.completeJson<unknown>({
      ...request,
      instructions: `${request.instructions}\n\n上一次输出未能被应用读取。请重新生成同一任务，只返回满足 JSON 结构的内容，不要解释错误。`
    });
    return validateMaterialDeepReadOutput(response.data);
  } catch (retryError) {
    const message = retryError instanceof Error ? retryError.message : typeof retryError === "string" ? retryError : "未知错误";
    const first = firstError instanceof Error ? firstError.message : typeof firstError === "string" ? firstError : "";
    throw new Error(`AI精读失败：${message}${first && first !== message ? `（首次错误：${first}）` : ""}`);
  }
}
