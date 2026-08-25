import { describe, expect, it } from "vitest";
import type { Question, QuestionType } from "../types";
import { ERROR_TAXONOMY, ERROR_TAXONOMY_VERSION } from "./errorTaxonomy";
import { QUESTION_TYPE_SKILL_VERSION } from "./questionTypeSkill";
import {
  buildAnswerMappingRequest,
  buildMaterialExtractionRequest,
  buildReferenceCrossCheckRequest,
  buildRubricConstructionRequest,
  buildWordBudgetRequest
} from "./stagePrompts";

const question: Question = {
  id: "q-ref",
  title: "测试题",
  year: 2026,
  region: "测试",
  type: "概括归纳",
  difficulty: "进阶",
  score: 20,
  wordLimit: 250,
  prompt: "概括主要做法。",
  tags: [],
  materials: [{ id: "m1", label: "材料 1", content: "某地推进事项下沉并配置项目专员。" }],
  referenceAnswer: {
    source: "REF_ONLY_SOURCE",
    content: "REF_ONLY_DIMENSION"
  }
};

function inputOf(request: { input: string }) {
  return JSON.parse(request.input) as Record<string, unknown>;
}

function sampleCandidates() {
  return [{
    id: "c1",
    materialId: "m1",
    elementType: "measure" as const,
    claim: "事项下沉",
    evidence: "推进事项下沉",
    independentDimension: true
  }];
}

function sampleRubric() {
  return [{
    id: "r1",
    title: "事项下沉",
    elementType: "measure" as const,
    candidateIds: ["c1"],
    evidence: ["推进事项下沉"]
  }];
}

describe("grading stage prompt isolation", () => {
  it("keeps the stored reference answer out of stages 1-4", () => {
    const candidates = sampleCandidates();
    const rubric = sampleRubric();

    const earlyStageInputs = [
      inputOf(buildMaterialExtractionRequest(question)),
      inputOf(buildRubricConstructionRequest(question, candidates)),
      inputOf(buildAnswerMappingRequest(question, rubric, "推进事项下沉。")),
      inputOf(buildWordBudgetRequest(question, "推进事项下沉。"))
    ];

    for (const input of earlyStageInputs) {
      const serialized = JSON.stringify(input);
      expect(serialized).not.toContain("REF_ONLY_SOURCE");
      expect(serialized).not.toContain("REF_ONLY_DIMENSION");
      expect(input.referenceAnswer).toBeUndefined();
    }
  });

  it("passes the reference answer explicitly only to stage 5", () => {
    const stageFive = inputOf(buildReferenceCrossCheckRequest(question, sampleRubric(), question.referenceAnswer!));
    expect(stageFive.referenceAnswer).toEqual(question.referenceAnswer);
    expect(JSON.stringify(stageFive)).toContain("REF_ONLY_SOURCE");
    expect(JSON.stringify(stageFive)).toContain("REF_ONLY_DIMENSION");
  });

  it("injects question-type skill guidance into every remote grading stage", () => {
    const candidates = sampleCandidates();
    const rubric = sampleRubric();
    const requests = [
      buildMaterialExtractionRequest(question),
      buildRubricConstructionRequest(question, candidates),
      buildAnswerMappingRequest(question, rubric, "推进事项下沉。"),
      buildWordBudgetRequest(question, "推进事项下沉。"),
      buildReferenceCrossCheckRequest(question, rubric, question.referenceAnswer!)
    ];

    for (const request of requests) {
      expect(request.instructions).toContain(QUESTION_TYPE_SKILL_VERSION);
      expect(request.instructions).toContain("题型专用批改约束（概括归纳");
      expect(request.instructions).toContain("多个主体或多个对象必须先分别归属");
    }
  });

  it("uses distinct practical guidance for all five supported question types", () => {
    const expected: Record<QuestionType, string> = {
      "概括归纳": "多个主体或多个对象必须先分别归属",
      "提出对策": "主得分方向",
      "综合分析": "保留材料支持的逻辑关系、作用机制和必要结论",
      "贯彻执行": "身份、受众、目的、文种/场景和内容任务",
      "文章写作": "作文不能按小题关键词清单机械评分"
    };

    for (const [type, marker] of Object.entries(expected) as Array<[QuestionType, string]>) {
      const request = buildMaterialExtractionRequest({ ...question, type });
      expect(request.instructions).toContain(marker);
    }
  });

  it("keeps rubric granularity at independent scoring dimensions instead of material sentences", () => {
    const countermeasureQuestion = { ...question, type: "提出对策" as const };
    const rubricRequest = buildRubricConstructionRequest(countermeasureQuestion, sampleCandidates());
    const mappingRequest = buildAnswerMappingRequest(countermeasureQuestion, sampleRubric(), "加强管理。完善机制。");
    expect(rubricRequest.instructions).toContain("考场可独立得分的中观语义维度");
    expect(rubricRequest.instructions).toContain("不要因为证据多就拆点");
    expect(mappingRequest.instructions).toContain("上位概括过空");
    expect(mappingRequest.instructions).toContain("中观词丢失");
    expect(mappingRequest.instructions).toContain("机制没写透");
    expect(mappingRequest.instructions).toContain("真正遗漏");
    expect(mappingRequest.instructions).toContain("40个汉字以内");
  });

  it("passes the complete error taxonomy contract to stage 3 instead of asking the model to invent codes", () => {
    const request = buildAnswerMappingRequest(question, sampleRubric(), "推进事项下沉。");
    expect(request.instructions).toContain(ERROR_TAXONOMY_VERSION);
    for (const entry of ERROR_TAXONOMY) {
      expect(request.instructions).toContain(entry.id);
      expect(request.instructions).toContain(entry.label);
    }
  });

  it("constrains errorCodes in the structured-output schema to known taxonomy ids", () => {
    const request = buildAnswerMappingRequest(question, sampleRubric(), "推进事项下沉。");
    const schema = request.jsonSchema as {
      properties: {
        mappings: {
          items: {
            properties: {
              errorCodes: { items: { enum: string[] } }
            }
          }
        }
      }
    };
    expect(schema.properties.mappings.items.properties.errorCodes.items.enum)
      .toEqual(ERROR_TAXONOMY.map(item => item.id));
  });

  it("gives Stage 3 enough output budget and a provider-facing JSON example", () => {
    const request = buildAnswerMappingRequest(question, sampleRubric(), "推进事项下沉。");
    expect(request.maxOutputTokens).toBe(12_000);
    expect(request.jsonExample).toEqual({
      mappings: [{
        rubricPointId: "<使用当前 rubric 中真实 id>",
        status: "hit",
        errorCodes: [],
        diagnosis: "已覆盖该得分维度。"
      }]
    });
  });
});
