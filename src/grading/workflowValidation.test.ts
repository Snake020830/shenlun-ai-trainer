import { describe, expect, it } from "vitest";
import {
  validateAnswerMapping,
  validateMaterialExtraction,
  validateRubricConstruction,
  validateWordBudget
} from "./workflowValidation";

describe("grading workflow validation", () => {
  it("accepts a coherent extraction -> rubric -> mapping chain", () => {
    const extraction = validateMaterialExtraction({
      materialCandidates: [{
        id: "c1",
        materialId: "m1",
        elementType: "measure",
        claim: "下沉审批事项",
        evidence: "174项涉企审批事项下沉",
        independentDimension: true
      }]
    }, new Set(["m1"]));

    const rubric = validateRubricConstruction({
      rubric: [{
        id: "r1",
        title: "审批权限下沉",
        elementType: "measure",
        candidateIds: [extraction.materialCandidates[0].id],
        evidence: ["174项涉企审批事项下沉"]
      }]
    }, new Set(["c1"]));

    const mapping = validateAnswerMapping({
      mappings: [{
        rubricPointId: rubric.rubric[0].id,
        status: "partial",
        errorCodes: ["PARTIAL_COVERAGE"],
        diagnosis: "写到了审批下沉，但没有体现涉企事项。",
        suggestion: "补出涉企审批事项这一对象。"
      }]
    }, new Set(["r1"]));

    expect(mapping.mappings[0].status).toBe("partial");
  });

  it("rejects mappings that reference unknown rubric points", () => {
    expect(() => validateAnswerMapping({
      mappings: [{
        rubricPointId: "missing",
        status: "hit",
        errorCodes: [],
        diagnosis: "covered"
      }]
    }, new Set(["r1"]))).toThrow("unknown rubric point");
  });

  it("rejects unknown error taxonomy codes", () => {
    expect(() => validateAnswerMapping({
      mappings: [{
        rubricPointId: "r1",
        status: "missed",
        errorCodes: ["MADE_UP_ERROR"],
        diagnosis: "missing"
      }]
    }, new Set(["r1"]))).toThrow("unknown error taxonomy code");
  });

  it("requires exactly one mapping for every rubric point", () => {
    expect(() => validateAnswerMapping({ mappings: [] }, new Set(["r1"])))
      .toThrow("every rubric point must have exactly one answer mapping");
  });

  it("rejects a model-altered word limit in strict validation mode", () => {
    expect(() => validateWordBudget({
      wordBudget: {
        charCount: 100,
        wordLimit: 999,
        overLimit: false,
        redundantExcerpts: [],
        lowValueExcerpts: [],
        compressionAdvice: []
      }
    }, 250)).toThrow("changed the question word limit");
  });

  it("uses deterministic local counts for the remote word-budget artifact", () => {
    const normalized = validateWordBudget({
      wordBudget: {
        charCount: 96,
        wordLimit: 999,
        overLimit: false,
        redundantExcerpts: ["重复表达"],
        lowValueExcerpts: [],
        compressionAdvice: ["压缩重复表达"]
      }
    }, 100, 101);

    expect(normalized.wordBudget.charCount).toBe(101);
    expect(normalized.wordBudget.wordLimit).toBe(100);
    expect(normalized.wordBudget.overLimit).toBe(true);
    expect(normalized.wordBudget.redundantExcerpts).toEqual(["重复表达"]);
  });
});
