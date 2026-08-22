import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => false }));

import { saveBenchmarkAlignment, getBenchmarkAlignment } from "./alignmentStore";
import { saveBenchmarkModelRun } from "./modelRunStore";
import type { BenchmarkAlignment, BenchmarkModelRun, GradingBenchmarkCase } from "./types";

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(key: string) { return this.data.get(key) ?? null; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string) { this.data.delete(key); }
  setItem(key: string, value: string) { this.data.set(key, String(value)); }
}

const CASE_KEY = "shenlun:benchmark-drafts:v1";

const testCase: GradingBenchmarkCase = {
  schemaVersion: "0.1.0",
  id: "case-alignment-store",
  tags: ["real-practice"],
  annotationStatus: "adjudicated",
  split: "calibration",
  question: {
    id: "q-alignment-store",
    title: "对齐测试题",
    type: "概括归纳",
    maxScore: 10,
    wordLimit: 200,
    prompt: "概括做法。",
    materials: [{ id: "m1", label: "材料1", content: "下沉审批。" }]
  },
  answer: "下沉审批。",
  gold: {
    materialPoints: [{ id: "mp1", materialId: "m1", canonicalLabel: "审批下沉", elementType: "measure", evidence: "下沉审批", independentDimension: true }],
    rubric: [{ id: "r1", canonicalLabel: "审批下沉", elementType: "measure", materialPointIds: ["mp1"], evidence: ["下沉审批"] }],
    mappings: [{ rubricPointId: "r1", status: "hit", expectedErrorCodes: [] }],
    humanScores: [{ assessorId: "human-1", score: 8 }]
  },
  provenance: { annotatedAt: "2026-08-22", goldAnnotatorId: "human-gold-1" }
};

const run: BenchmarkModelRun = {
  schemaVersion: "0.1.0",
  caseId: testCase.id,
  runId: "run-alignment-1",
  predictedScore: 7,
  maxScore: 10,
  rubric: [
    { id: "p1", title: "审批下沉", elementType: "measure", evidence: ["下沉审批"] },
    { id: "p-extra", title: "材料外扩展", elementType: "other", evidence: ["模型额外生成的维度"] }
  ],
  mappings: [
    { predictedRubricPointId: "p1", status: "hit", errorCodes: [], diagnosis: "覆盖" },
    { predictedRubricPointId: "p-extra", status: "hit", errorCodes: [], diagnosis: "模型额外维度" }
  ],
  workflowVersion: "shenlun-workflow@0.1.0",
  promptsetVersion: "shenlun-stage-prompts@0.1.0",
  generatedAt: "2026-08-22T10:20:00+08:00",
  referenceCrossCheckUsed: false
};

beforeEach(async () => {
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: new MemoryStorage() });
  localStorage.setItem(CASE_KEY, JSON.stringify([testCase]));
  await saveBenchmarkModelRun(run);
});

describe("benchmark alignment store", () => {
  it("allows progressive draft alignment", async () => {
    const draft: BenchmarkAlignment = {
      caseId: testCase.id,
      runId: run.runId,
      alignmentStatus: "draft",
      rubricAlignments: [],
      mappingLinks: []
    };
    const saved = await saveBenchmarkAlignment(draft);
    expect(saved.alignmentStatus).toBe("draft");
    expect(await getBenchmarkAlignment(testCase.id, run.runId)).toEqual(saved);
  });

  it("requires every gold and predicted rubric to be reviewed before adjudication", async () => {
    const incomplete: BenchmarkAlignment = {
      caseId: testCase.id,
      runId: run.runId,
      alignmentStatus: "adjudicated",
      rubricAlignments: [
        { goldRubricPointIds: ["r1"], predictedRubricPointIds: ["p1"], relation: "match" }
      ],
      mappingLinks: [{ goldRubricPointId: "r1", predictedRubricPointIds: ["p1"] }],
      provenance: { alignedBy: "human-aligner", alignedAt: "2026-08-22T10:25:00+08:00" }
    };
    await expect(saveBenchmarkAlignment(incomplete)).rejects.toThrow("has not reviewed predicted rubric p-extra");
  });

  it("allows an intentionally unmatched predicted rubric and then locks the adjudicated alignment", async () => {
    const finalAlignment: BenchmarkAlignment = {
      caseId: testCase.id,
      runId: run.runId,
      alignmentStatus: "adjudicated",
      rubricAlignments: [
        { goldRubricPointIds: ["r1"], predictedRubricPointIds: ["p1"], relation: "match" }
      ],
      mappingLinks: [{ goldRubricPointId: "r1", predictedRubricPointIds: ["p1"] }],
      unmatchedGoldRubricPointIds: [],
      unmatchedPredictedRubricPointIds: ["p-extra"],
      provenance: { alignedBy: "human-aligner", alignedAt: "2026-08-22T10:30:00+08:00" }
    };
    await saveBenchmarkAlignment(finalAlignment);
    expect((await getBenchmarkAlignment(testCase.id, run.runId))?.unmatchedPredictedRubricPointIds).toEqual(["p-extra"]);
    await expect(saveBenchmarkAlignment({ ...finalAlignment, provenance: { ...finalAlignment.provenance, notes: "silent edit" } }))
      .rejects.toThrow("immutable");
  });

  it("rejects the same rubric being both aligned and unmatched", async () => {
    const invalid: BenchmarkAlignment = {
      caseId: testCase.id,
      runId: run.runId,
      alignmentStatus: "draft",
      rubricAlignments: [
        { goldRubricPointIds: ["r1"], predictedRubricPointIds: ["p1"], relation: "match" }
      ],
      mappingLinks: [{ goldRubricPointId: "r1", predictedRubricPointIds: ["p1"] }],
      unmatchedPredictedRubricPointIds: ["p1"]
    };
    await expect(saveBenchmarkAlignment(invalid)).rejects.toThrow("cannot be both aligned and unmatched");
  });
});
