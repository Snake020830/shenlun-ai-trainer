import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => false }));

import {
  getPracticeAnnotations,
  getPracticeInkStrokes,
  savePracticeAnnotations,
  savePracticeInkStrokes,
  saveTrainingPracticeMeta,
  type PracticeInkStroke,
  type PracticeTextAnnotation,
  type TrainingPracticeMeta
} from "./practiceSessionStore";

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(key: string) { return this.data.get(key) ?? null; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string) { this.data.delete(key); }
  setItem(key: string, value: string) { this.data.set(key, String(value)); }
}

beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: new MemoryStorage()
  });
});

describe("practice session store", () => {
  it("persists text annotations and highlighter colors per question", async () => {
    const annotations: PracticeTextAnnotation[] = [
      { id: "a1", materialId: "m1", start: 2, end: 8, type: "highlight", color: "yellow" },
      { id: "a2", materialId: "m2", start: 0, end: 4, type: "underline" },
      { id: "a3", materialId: "m2", start: 5, end: 9, type: "highlight", color: "pink" }
    ];
    await savePracticeAnnotations("q1", annotations);
    expect(await getPracticeAnnotations("q1")).toEqual(annotations);
    expect(await getPracticeAnnotations("q2")).toEqual([]);
  });

  it("keeps legacy highlights without an explicit color valid", async () => {
    const annotations: PracticeTextAnnotation[] = [
      { id: "legacy", materialId: "m1", start: 0, end: 3, type: "highlight" }
    ];
    await savePracticeAnnotations("q1", annotations);
    expect(await getPracticeAnnotations("q1")).toEqual(annotations);
  });

  it("rejects invalid ranges, duplicate ids and invalid highlight metadata", async () => {
    await expect(savePracticeAnnotations("q1", [
      { id: "a1", materialId: "m1", start: 5, end: 5, type: "highlight" }
    ])).rejects.toThrow("invalid text range");

    await expect(savePracticeAnnotations("q1", [
      { id: "a1", materialId: "m1", start: 0, end: 2, type: "highlight" },
      { id: "a1", materialId: "m1", start: 3, end: 5, type: "underline" }
    ])).rejects.toThrow("Duplicate practice annotation id");

    await expect(savePracticeAnnotations("q1", [
      { id: "a2", materialId: "m1", start: 0, end: 2, type: "highlight", color: "orange" as never }
    ])).rejects.toThrow("unsupported highlight color");

    await expect(savePracticeAnnotations("q1", [
      { id: "a3", materialId: "m1", start: 0, end: 2, type: "underline", color: "yellow" }
    ])).rejects.toThrow("cannot attach a highlight color");
  });

  it("persists character-anchored ink strokes per question", async () => {
    const strokes: PracticeInkStroke[] = [{
      id: "s1",
      materialId: "m1",
      color: "graphite",
      width: 2.2,
      points: [
        { offset: 12, dx: -1.5, dy: 8 },
        { offset: 13, dx: 3, dy: 9.5 },
        { offset: 15, dx: 1, dy: 10 }
      ]
    }];
    await savePracticeInkStrokes("q1", strokes);
    expect(await getPracticeInkStrokes("q1")).toEqual(strokes);
    expect(await getPracticeInkStrokes("q2")).toEqual([]);
  });

  it("rejects malformed or unsafe ink stroke data", async () => {
    await expect(savePracticeInkStrokes("q1", [{
      id: "s1",
      materialId: "m1",
      color: "graphite",
      width: 2,
      points: [{ offset: 1, dx: 0, dy: 0 }]
    }])).rejects.toThrow("invalid point count");

    await expect(savePracticeInkStrokes("q1", [{
      id: "s1",
      materialId: "m1",
      color: "purple" as never,
      width: 2,
      points: [{ offset: 1, dx: 0, dy: 0 }, { offset: 2, dx: 1, dy: 1 }]
    }])).rejects.toThrow("unsupported color");

    await expect(savePracticeInkStrokes("q1", [{
      id: "s1",
      materialId: "m1",
      color: "graphite",
      width: 30,
      points: [{ offset: 1, dx: 0, dy: 0 }, { offset: 2, dx: 1, dy: 1 }]
    }])).rejects.toThrow("invalid width");
  });

  it("stores timing metadata independently for each submitted training record", async () => {
    await saveTrainingPracticeMeta("record-1", 742, 3, "2026-08-22T11:00:00+08:00");
    await saveTrainingPracticeMeta("record-2", 480, 1, "2026-08-22T11:20:00+08:00");
    const stored = JSON.parse(localStorage.getItem("shenlun:training-practice-meta:v1") ?? "[]") as TrainingPracticeMeta[];
    expect(stored).toHaveLength(2);
    expect(stored.find(item => item.trainingRecordId === "record-1")?.elapsedSeconds).toBe(742);
    expect(stored.find(item => item.trainingRecordId === "record-1")?.annotationCount).toBe(3);
  });

  it("updates timing metadata idempotently for the same training record", async () => {
    await saveTrainingPracticeMeta("record-1", 100, 1, "2026-08-22T11:00:00+08:00");
    await saveTrainingPracticeMeta("record-1", 120, 2, "2026-08-22T11:02:00+08:00");
    const stored = JSON.parse(localStorage.getItem("shenlun:training-practice-meta:v1") ?? "[]") as TrainingPracticeMeta[];
    expect(stored).toHaveLength(1);
    expect(stored[0].elapsedSeconds).toBe(120);
    expect(stored[0].annotationCount).toBe(2);
  });
});
