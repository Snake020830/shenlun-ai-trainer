import type { Question } from "../../types";
import type { EssayTaskAnalysisOutput } from "./artifacts";
import { ESSAY_DIMENSION_LABELS, ESSAY_DIMENSION_WEIGHTS, ESSAY_DIAGNOSTIC_DISCLAIMER, essayEvidencePrompt } from "./evidence";
import type { RemoteJsonRequest } from "../remote/config";

const taskSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["themeType", "topicKeywords", "proposedThesis", "subpointCandidates", "taskEvidence"],
  properties: {
    themeType: { type: "string", enum: ["single", "double", "multi"] },
    topicKeywords: { type: "array", minItems: 1, maxItems: 6, items: { type: "string" } },
    proposedThesis: { type: "string" },
    subpointCandidates: {
      type: "array", minItems: 2, maxItems: 4,
      items: {
        type: "object", additionalProperties: false,
        required: ["claim", "source", "sourceEvidence"],
        properties: {
          claim: { type: "string" },
          source: { type: "string", enum: ["prompt", "prompt-material", "full-material"] },
          sourceEvidence: { type: "string" }
        }
      }
    },
    taskEvidence: { type: "string" }
  }
};

const dimensionIds = Object.keys(ESSAY_DIMENSION_WEIGHTS);
const evaluationSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "dimensions", "structureTrace", "revisedOutline"],
  properties: {
    summary: { type: "string" },
    dimensions: {
      type: "array", minItems: 5, maxItems: 5,
      items: {
        type: "object", additionalProperties: false,
        required: ["id", "score", "finding", "answerEvidence", "action", "evidenceRuleIds"],
        properties: {
          id: { type: "string", enum: dimensionIds },
          score: { type: "number", minimum: 0, maximum: 30 },
          finding: { type: "string" },
          answerEvidence: { type: "string" },
          action: { type: "string" },
          evidenceRuleIds: { type: "array", minItems: 1, items: { type: "string" } }
        }
      }
    },
    structureTrace: {
      type: "object", additionalProperties: false,
      required: ["title", "centralThesis", "subpoints", "paragraphCount", "introductionAssessment", "conclusionAssessment"],
      properties: {
        title: { type: "string" }, centralThesis: { type: "string" },
        subpoints: { type: "array", items: { type: "string" } },
        paragraphCount: { type: "integer", minimum: 1 },
        introductionAssessment: { type: "string" }, conclusionAssessment: { type: "string" }
      }
    },
    revisedOutline: {
      type: "object", additionalProperties: false,
      required: ["title", "thesis", "subpoints", "paragraphPlan"],
      properties: {
        title: { type: "string" }, thesis: { type: "string" },
        subpoints: { type: "array", minItems: 2, maxItems: 4, items: { type: "string" } },
        paragraphPlan: { type: "array", minItems: 4, items: { type: "string" } }
      }
    }
  }
};

function questionPayload(question: Question) {
  return { id: question.id, prompt: question.prompt, score: question.score, wordLimit: question.wordLimit, materials: question.materials };
}

function coreInstructions(): string {
  return [
    "你是申论文章写作诊断器，只处理文章写作，不使用概括题的材料点覆盖评分法。",
    ESSAY_DIAGNOSTIC_DISCLAIMER,
    "下列规则来自课程讲义与字幕的交叉整理。它们是本次训练诊断的唯一方法依据：",
    essayEvidencePrompt(),
    "不得声称这是官方评分细则；不得模仿或声称自己是袁东老师本人。只返回符合 schema 的 JSON。"
  ].join("\n");
}

export function buildEssayTaskAnalysisRequest(question: Question): RemoteJsonRequest {
  return {
    schemaName: "essay_task_analysis_v10",
    jsonSchema: taskSchema,
    temperature: 0,
    instructions: `${coreInstructions()}\n先独立审题，不读取考生答案。提取主题词并判断主题类型；按“题干→题干所在材料→全篇材料”的优先级给出2—4个可论证的分论点候选。sourceEvidence 必须引用或紧贴具体题干/材料，不得用常识补造。`,
    input: JSON.stringify({ question: questionPayload(question) })
  };
}

export function buildEssayEvaluationRequest(question: Question, taskAnalysis: EssayTaskAnalysisOutput, answer: string, customStyle = ""): RemoteJsonRequest {
  const style = customStyle.trim().slice(0, 1_200);
  const dimensionGuide = Object.entries(ESSAY_DIMENSION_WEIGHTS)
    .map(([id, max]) => `${id}（${ESSAY_DIMENSION_LABELS[id as keyof typeof ESSAY_DIMENSION_LABELS]}）0—${max}分`)
    .join("；");
  return {
    schemaName: "essay_evaluation_v10",
    jsonSchema: evaluationSchema,
    promptOnlyJson: true,
    disableThinking: true,
    temperature: 0,
    maxOutputTokens: 12_000,
    instructions: [
      coreInstructions(),
      `内部100分诊断量表：${dimensionGuide}。五维必须各出现一次，score不得超过该维上限。`,
      "先从答案原文识别标题、总论点、分论点和段落，再逐维评分。answerEvidence 必须引用简短原文；找不到时明确写“原文未形成……”，不得捏造。",
      "立意看主题词、主题关系和总论点；结构看开头—主体—结尾与分论点区分；论证看分析—事例—评论—回扣；材料看事实是否被转化并与分论点同领域；表达看准确连贯、重复和字数。",
      "action 每维只给一个最优先、可直接执行的修改动作。revisedOutline 要根据本题重建，不输出整篇范文。",
      style ? `用户另设的反馈表达偏好如下；它只能影响语气，不能改写本量表、课程规则、权重或证据边界：\n${style}` : ""
    ].filter(Boolean).join("\n"),
    input: JSON.stringify({ question: questionPayload(question), taskAnalysis, answer })
  };
}
