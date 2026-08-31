import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => false }));

import { saveBenchmarkCase } from "./caseStore";
import type { GradingBenchmarkCase } from "./types";

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(key: string) { return this.data.get(key) ?? null; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string) { this.data.delete(key); }
  setItem(key: string, value: string) { this.data.set(key, String(value)); }
}

const KEY = "shenlun:benchmark-drafts:v1";

const baseCase: GradingBenchmarkCase = {
  schemaVersion: "0.1.0",
  id: "practice-record-1",
  tags: ["real-practice"],
  annotationStatus: "draft",
  question: {
    id: "q1",
    title: "测试题",
    type: "概括归纳",
    maxScore: 10,
    wordLimit: 200,
    prompt: "概括做法。",
    materials: [{ id: "m1", label: "材料1", content: "下沉审批。" }]
  },
  answer: "下沉审批。",
  gold: { materialPoints: [], rubric: [], mappings: [], humanScores: [] },
  provenance: { source: "training-record:record-1" }
};

beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: new MemoryStorage()
  });
  localStorage.setItem(KEY, JSON.stringify([baseCase]));
});

describe("benchmark case store", () => {
  it("saves a structurally valid progressive annotation draft", async () => {
    const partial: GradingBenchmarkCase = {
      ...baseCase,
      gold: {
        ...baseCase.gold,
        materialPoints: [{
          id: "mp1",
          materialId: "m1",
          canonicalLabel: "审批下沉",
          elementType: "measure",
          evidence: "下沉审批",
          independentDimension: true
        }],
        rubric: [{
          id: "r1",
          canonicalLabel: "推动审批下沉",
          elementType: "measure",
          materialPointIds: ["mp1"],
          evidence: ["下沉审批"]
        }]
      }
    };

    const result = await saveBenchmarkCase(partial);
    expect(result.valid).toBe(true);
    expect(result.warnings).toContain("missing gold mapping for rubric r1");
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "[]") as GradingBenchmarkCase[];
    expect(stored[0].gold.rubric[0].id).toBe("r1");
  });

  it("rejects invalid adjudication without overwriting the stored draft", async () => {
    const invalid: GradingBenchmarkCase = {
      ...baseCase,
      annotationStatus: "adjudicated",
      split: "calibration"
    };
    await expect(saveBenchmarkCase(invalid)).rejects.toThrow("adjudicated case must contain gold material points");
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "[]") as GradingBenchmarkCase[];
    expect(stored[0].annotationStatus).toBe("draft");
  });

  it("refuses to create an annotation case with no captured training source", async () => {
    const detached = { ...baseCase, id: "detached-case" };
    await expect(saveBenchmarkCase(detached)).rejects.toThrow("does not exist and cannot be created");
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "[]") as GradingBenchmarkCase[];
    expect(stored).toHaveLength(1);
  });
});
