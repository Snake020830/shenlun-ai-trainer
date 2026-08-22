import { describe, expect, it } from "vitest";
import type { Question } from "../types";
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
});