import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => false }));

import { loadMaterialDeepReadSnapshot, loadMaterialDeepReadSnapshots, questionSignature, saveMaterialDeepReadSnapshot } from "./materialLearningStore";
import type { MaterialDeepReadOutput } from "./materialLearning";
import type { Question } from "./types";

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(key: string) { return this.data.get(key) ?? null; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string) { this.data.delete(key); }
  setItem(key: string, value: string) { this.data.set(key, String(value)); }
}

const question: Question = {
  id: "learning-store-q1",
  title: "精读测试题",
  year: 2026,
  region: "测试",
  type: "概括归纳",
  difficulty: "进阶",
  score: 10,
  wordLimit: 200,
  prompt: "概括做法。",
  materials: [{ id: "m1", label: "材料1", content: "通过制度协同提升服务效能。" }],
  tags: [],
  source: "local"
};

const output: MaterialDeepReadOutput = {
  annotations: [{ quote: "制度协同", type: "practice", keyPoint: "强化制度协同" }],
  referenceAnswer: "完善制度协同，提升服务效能。",
  answerNotes: [],
  examApproach: ["定位制度协同这一核心做法"],
  expressions: [],
  mechanisms: [],
  cases: [],
  essayAngles: []
};

beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: new MemoryStorage() });
});

describe("material deep-read snapshots", () => {
  it("round-trips a snapshot and rejects a changed question signature", async () => {
    await saveMaterialDeepReadSnapshot(question, output, "2026-08-26T00:00:00.000Z");
    const loaded = await loadMaterialDeepReadSnapshot(question);
    expect(loaded?.result).toEqual(output);
    expect(loaded?.questionSignature).toBe(questionSignature(question));
    expect(await loadMaterialDeepReadSnapshot({ ...question, wordLimit: 300 })).toBeNull();
  });

  it("ignores a malformed stored result", async () => {
    localStorage.setItem("shenlun:public-settings:v1", JSON.stringify({
      "public:material-deep-read.v1:learning-store-q1": {
        questionId: question.id,
        questionSignature: questionSignature(question),
        generatedAt: "2026-08-26T00:00:00.000Z",
        result: { referenceAnswer: "有答案" }
      }
    }));
    expect(await loadMaterialDeepReadSnapshot(question)).toBeNull();
  });

  it("loads all matching snapshots through one prefix read", async () => {
    await saveMaterialDeepReadSnapshot(question, output);
    const missingQuestion = { ...question, id: "learning-store-missing" };
    const snapshots = await loadMaterialDeepReadSnapshots([question, missingQuestion]);
    expect(snapshots.get(question.id)?.result).toEqual(output);
    expect(snapshots.has(missingQuestion.id)).toBe(false);
  });
});
