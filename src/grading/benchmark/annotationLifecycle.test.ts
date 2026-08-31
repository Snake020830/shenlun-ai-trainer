import { describe, expect, it } from "vitest";
import type { GradingBenchmarkCase } from "./types";
import { validateBenchmarkCase } from "./validateCase";

const baseDraft: GradingBenchmarkCase = {
  schemaVersion: "0.1.0",
  id: "annotation-draft-1",
  tags: ["real-practice"],
  annotationStatus: "draft",
  question: {
    id: "q-annotation-1",
    title: "人工标注测试题",
    type: "概括归纳",
    maxScore: 10,
    wordLimit: 200,
    prompt: "概括主要做法。",
    materials: [{ id: "m1", label: "材料1", content: "下沉审批事项。" }]
  },
  answer: "下沉审批。",
  gold: {
    materialPoints: [],
    rubric: [],
    mappings: [],
    humanScores: []
  }
};

describe("benchmark annotation lifecycle", () => {
  it("allows a draft to save material points and rubric before answer mapping is finished", () => {
    const partial: GradingBenchmarkCase = {
      ...baseDraft,
      gold: {
        ...baseDraft.gold,
        materialPoints: [
          {
            id: "mp1",
            materialId: "m1",
            canonicalLabel: "审批事项下沉",
            elementType: "measure",
            evidence: "下沉审批事项",
            independentDimension: true
          }
        ],
        rubric: [
          {
            id: "r1",
            canonicalLabel: "推动审批事项下沉",
            elementType: "measure",
            materialPointIds: ["mp1"],
            evidence: ["下沉审批事项"]
          }
        ]
      }
    };

    const result = validateBenchmarkCase(partial);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toContain("missing gold mapping for rubric r1");
  });

  it("requires the same case to be complete before adjudication", () => {
    const incompleteAdjudicated: GradingBenchmarkCase = {
      ...baseDraft,
      annotationStatus: "adjudicated",
      split: "calibration",
      provenance: { annotatedAt: "2026-08-22" },
      gold: {
        ...baseDraft.gold,
        materialPoints: [
          {
            id: "mp1",
            materialId: "m1",
            canonicalLabel: "审批事项下沉",
            elementType: "measure",
            evidence: "下沉审批事项",
            independentDimension: true
          }
        ],
        rubric: [
          {
            id: "r1",
            canonicalLabel: "推动审批事项下沉",
            elementType: "measure",
            materialPointIds: ["mp1"],
            evidence: ["下沉审批事项"]
          }
        ]
      }
    };

    const result = validateBenchmarkCase(incompleteAdjudicated);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("missing gold mapping for rubric r1");
    expect(result.errors).toContain("adjudicated case must contain gold mappings");
  });

  it("requires an explicit split for adjudicated cases", () => {
    const adjudicatedWithoutSplit: GradingBenchmarkCase = {
      ...baseDraft,
      annotationStatus: "adjudicated",
      provenance: { annotatedAt: "2026-08-22" },
      gold: {
        materialPoints: [
          {
            id: "mp1",
            materialId: "m1",
            canonicalLabel: "审批事项下沉",
            elementType: "measure",
            evidence: "下沉审批事项",
            independentDimension: true
          }
        ],
        rubric: [
          {
            id: "r1",
            canonicalLabel: "推动审批事项下沉",
            elementType: "measure",
            materialPointIds: ["mp1"],
            evidence: ["下沉审批事项"]
          }
        ],
        mappings: [{ rubricPointId: "r1", status: "hit", expectedErrorCodes: [] }],
        humanScores: []
      }
    };

    const result = validateBenchmarkCase(adjudicatedWithoutSplit);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("adjudicated case must have an explicit benchmark split");
  });
});
