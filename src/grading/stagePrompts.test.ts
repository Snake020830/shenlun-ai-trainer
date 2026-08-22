import { describe, expect, it } from "vitest";
import type { Question, QuestionType } from "../types";
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

describe("grading stage prompt isolation", () => {
  it("keeps the stored reference answer out of stages 1-4", () => {
    const candidates = [{
      id: "c1",
      materialId: "m1",
      elementType: "measure" as const,
      claim: "事项下沉",
      evidence: "推进事项下沉",
      independentDimension: true
    }];
    const rubric = [{
      id: "r1",
      title: "事项下沉",
      elementType: "measure" as const,
      candidateIds: ["c1"],
      evidence: ["推进事项下沉"]
    }];

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
    const rubric = [{
      id: "r1",
      title: "事项下沉",
      elementType: "measure" as const,
      candidateIds: ["c1"],
      evidence: ["推进事项下沉"]
    }];

    const stageFive = inputOf(buildReferenceCrossCheckRequest(question, rubric, question.referenceAnswer!));
    expect(stageFive.referenceAnswer).toEqual(question.referenceAnswer);
    expect(JSON.stringify(stageFive)).toContain("REF_ONLY_SOURCE");
    expect(JSON.stringify(stageFive)).toContain("REF_ONLY_DIMENSION");
  });

  it("injects question-type skill guidance into every remote grading stage", () => {
    const candidates = [{
      id: "c1",
      materialId: "m1",
      elementType: "measure" as const,
      claim: "事项下沉",
      evidence: "推进事项下沉",
      independentDimension: true
    }];
    const rubric = [{
      id: "r1",
      title: "事项下沉",
      elementType: "measure" as const,
      candidateIds: ["c1"],
      evidence: ["推进事项下沉"]
    }];
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
      "提出对策": "推导型对策必须能回指材料中的具体问题",
      "综合分析": "保留材料支持的逻辑关系、作用机制和必要结论",
      "贯彻执行": "身份、受众、目的、文种/场景和内容任务",
      "文章写作": "作文不能按小题关键词清单机械评分"
    };

    for (const [type, marker] of Object.entries(expected) as Array<[QuestionType, string]>) {
      const request = buildMaterialExtractionRequest({ ...question, type });
      expect(request.instructions).toContain(marker);
    }
  });
});