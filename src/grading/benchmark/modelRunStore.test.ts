import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => false }));

import { saveBenchmarkModelRun, listBenchmarkModelRuns } from "./modelRunStore";
import type { BenchmarkModelRun, GradingBenchmarkCase } from "./types";

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
  id: "case-run-store",
  tags: ["real-practice"],
  annotationStatus: "adjudicated",
  split: "calibration",
  question: {
    id: "q-run-store",
    title: "测试题",
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
  runId: "run-immutable-1",
  predictedScore: 8,
  maxScore: 10,
  rubric: [{ id: "p1", title: "审批下沉", elementType: "measure", evidence: ["下沉审批"] }],
  mappings: [{ predictedRubricPointId: "p1", status: "hit", errorCodes: [], diagnosis: "完整覆盖" }],
  providerId: "remote:test",
  model: "model-x",
  protocol: "openai-responses",
  reasoningEffort: "high",
  rulesetVersion: "shenlun-grading@0.1.0",
  workflowVersion: "shenlun-workflow@0.1.0",
  promptsetVersion: "shenlun-stage-prompts@0.1.0",
  scoringPolicy: "equal-rubric-diagnostic@0.1.0",
  generatedAt: "2026-08-22T10:10:00+08:00",
  referenceCrossCheckUsed: false
};

beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: new MemoryStorage() });
  localStorage.setItem(CASE_KEY, JSON.stringify([testCase]));
});

describe("benchmark model run store", () => {
  it("persists a valid model run and never overwrites it", async () => {
    await saveBenchmarkModelRun(run);
    expect(await listBenchmarkModelRuns(testCase.id)).toEqual([run]);
    await expect(saveBenchmarkModelRun({ ...run, predictedScore: 1 })).rejects.toThrow("already exists and is immutable");
    expect((await listBenchmarkModelRuns(testCase.id))[0].predictedScore).toBe(8);
  });

  it("refuses to run experiments against a non-adjudicated human-gold case", async () => {
    localStorage.setItem(CASE_KEY, JSON.stringify([{ ...testCase, annotationStatus: "draft" }]));
    await expect(saveBenchmarkModelRun(run)).rejects.toThrow("require an adjudicated human-gold case");
  });

  it("rejects invalid taxonomy output before persistence", async () => {
    const invalid: BenchmarkModelRun = {
      ...run,
      runId: "run-invalid",
      mappings: [{ ...run.mappings[0], errorCodes: ["NOT_A_REAL_CODE"] }]
    };
    await expect(saveBenchmarkModelRun(invalid)).rejects.toThrow("unknown error code");
  });
});
