import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => false }));

import { persistence } from "./storage";
import type { GradingBenchmarkCase } from "./grading/benchmark/types";
import type { TrainingRecord } from "./types";

class MemoryStorage implements Storage {
  private data = new Map<string, string>();

  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(key: string) { return this.data.get(key) ?? null; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string) { this.data.delete(key); }
  setItem(key: string, value: string) { this.data.set(key, String(value)); }
}

const BENCHMARK_DRAFTS_KEY = "shenlun:benchmark-drafts:v1";

function makeRecord(questionId: string): TrainingRecord {
  return {
    id: "record-real-001",
    questionId,
    title: "真实训练题",
    score: 12,
    maxScore: 20,
    submittedAt: "2026/8/22 09:55:00",
    submittedAtIso: "2026-08-22T01:55:00.000Z",
    answer: "一是整合资源，二是下沉审批，三是建立项目服务机制。",
    review: {
      score: 12,
      maxScore: 20,
      coverage: "开发期记录",
      classification: "开发期记录",
      expression: "开发期记录",
      redundancy: "开发期记录",
      summary: "未校准评分",
      points: [],
      calibrationStatus: "uncalibrated"
    }
  };
}

beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: new MemoryStorage()
  });
});

describe("training history -> benchmark draft capture", () => {
  it("automatically freezes a local imported question and real answer as an annotation draft", async () => {
    const question = await persistence.addImportedQuestion({
      title: "真实训练题",
      year: 2026,
      region: "本地训练",
      type: "概括归纳",
      difficulty: "进阶",
      score: 20,
      wordLimit: 300,
      prompt: "概括主要做法。",
      materialText: "材料一：推进资源整合。\n\n材料二：下沉审批事项并建立项目服务机制。",
      tags: ["真实训练", "基层治理"],
      referenceAnswerContent: "整合资源；下沉审批；建立项目服务机制。",
      referenceAnswerSource: "老师参考答案"
    });
    const record = makeRecord(question.id);

    await persistence.addHistory(record);
    const drafts = await persistence.listBenchmarkDrafts();

    expect(drafts).toHaveLength(1);
    expect(drafts[0].id).toBe(`practice-${record.id}`);
    expect(drafts[0].annotationStatus).toBe("draft");
    expect(drafts[0].split).toBeUndefined();
    expect(drafts[0].question.id).toBe(question.id);
    expect(drafts[0].question.materials).toHaveLength(2);
    expect(drafts[0].question.referenceAnswer?.source).toBe("老师参考答案");
    expect(drafts[0].answer).toBe(record.answer);
    expect(drafts[0].gold.materialPoints).toEqual([]);
    expect(drafts[0].gold.rubric).toEqual([]);
    expect(drafts[0].gold.mappings).toEqual([]);
    expect(drafts[0].gold.humanScores).toEqual([]);
    expect(drafts[0].provenance?.source).toBe(`training-record:${record.id}`);
  });

  it("is idempotent across initialization and explicit recapture", async () => {
    const question = await persistence.addImportedQuestion({
      title: "真实训练题",
      year: 2026,
      region: "本地训练",
      type: "概括归纳",
      difficulty: "进阶",
      score: 20,
      wordLimit: 300,
      prompt: "概括主要做法。",
      materialText: "推进资源整合。",
      tags: ["真实训练"]
    });
    const record = makeRecord(question.id);
    await persistence.addHistory(record);

    await persistence.initialize();
    await persistence.captureBenchmarkDraftFromHistory(record.id);
    await persistence.initialize();

    expect(await persistence.listBenchmarkDrafts()).toHaveLength(1);
  });

  it("never overwrites an existing adjudicated case during backfill", async () => {
    const question = await persistence.addImportedQuestion({
      title: "真实训练题",
      year: 2026,
      region: "本地训练",
      type: "概括归纳",
      difficulty: "进阶",
      score: 20,
      wordLimit: 300,
      prompt: "概括主要做法。",
      materialText: "推进资源整合。",
      tags: ["真实训练"]
    });
    const record = makeRecord(question.id);
    await persistence.addHistory(record);

    const [draft] = await persistence.listBenchmarkDrafts();
    const adjudicated: GradingBenchmarkCase = {
      ...draft,
      annotationStatus: "adjudicated",
      split: "calibration",
      provenance: {
        ...draft.provenance,
        annotatedAt: "2026-08-22",
        adjudicationNotes: "人工标注已完成；本测试只验证自动回填不得覆盖。"
      }
    };
    localStorage.setItem(BENCHMARK_DRAFTS_KEY, JSON.stringify([adjudicated]));

    await persistence.initialize();
    const [afterBackfill] = await persistence.listBenchmarkDrafts();

    expect(afterBackfill.annotationStatus).toBe("adjudicated");
    expect(afterBackfill.split).toBe("calibration");
    expect(afterBackfill.provenance?.adjudicationNotes).toContain("不得覆盖");
  });
});
