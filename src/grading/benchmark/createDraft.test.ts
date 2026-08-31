import { describe, expect, it } from "vitest";
import type { Question } from "../../types";
import type { BenchmarkAlignment, BenchmarkModelRun } from "./types";
import { createBenchmarkDraft } from "./createDraft";
import { calculateMappingQuality } from "./metrics";
import { validateBenchmarkCase } from "./validateCase";

const question: Question = {
  id: "q-draft",
  title: "测试导入题",
  year: 2026,
  region: "本地",
  type: "概括归纳",
  difficulty: "进阶",
  score: 10,
  wordLimit: 200,
  prompt: "概括主要做法。",
  materials: [{ id: "m1", label: "材料1", content: "建立联动机制。" }],
  tags: ["基层治理"],
  source: "local",
  referenceAnswer: { content: "建立联动机制。", source: "老师答案" }
};

describe("benchmark draft creation", () => {
  it("snapshots question data without fabricating gold annotations", () => {
    const draft = createBenchmarkDraft(question, "建议建立联动机制。", {
      caseId: "draft-001",
      source: "training-record:record-1",
      tags: ["real-practice"],
      createdAt: "2026-08-22T09:30:00+08:00"
    });

    expect(draft.annotationStatus).toBe("draft");
    expect(draft.split).toBeUndefined();
    expect(draft.question.referenceAnswer).toEqual(question.referenceAnswer);
    expect(draft.gold.materialPoints).toEqual([]);
    expect(draft.gold.rubric).toEqual([]);
    expect(draft.gold.mappings).toEqual([]);
    expect(draft.gold.humanScores).toEqual([]);
    expect(draft.tags).toContain("real-practice");
    expect(draft.tags).toContain("基层治理");

    const validation = validateBenchmarkCase(draft);
    expect(validation.valid).toBe(true);
    expect(validation.warnings).toContain("case is an annotation draft and must not be used for evaluation metrics");
  });

  it("cannot be evaluated before adjudication", () => {
    const draft = createBenchmarkDraft(question, "建议建立联动机制。", { caseId: "draft-002" });
    const run: BenchmarkModelRun = {
      schemaVersion: "0.1.0",
      caseId: draft.id,
      runId: "run-draft",
      predictedScore: 0,
      maxScore: question.score,
      rubric: [],
      mappings: [],
      workflowVersion: "shenlun-workflow@0.1.0",
      promptsetVersion: "shenlun-stage-prompts@0.1.0",
      referenceCrossCheckUsed: false
    };
    const alignment: BenchmarkAlignment = {
      caseId: draft.id,
      runId: run.runId,
      rubricAlignments: [],
      mappingLinks: []
    };
    expect(() => calculateMappingQuality(draft, run, alignment)).toThrow("not adjudicated");
  });

  it("rejects empty case ids and answers", () => {
    expect(() => createBenchmarkDraft(question, "答案", { caseId: "  " })).toThrow("caseId is required");
    expect(() => createBenchmarkDraft(question, "  ", { caseId: "draft-003" })).toThrow("answer is required");
  });
});
