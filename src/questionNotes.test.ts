import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));

vi.mock("./storage", () => ({
  persistence: {
    getPublicSetting: vi.fn(async (_key: string, fallback: unknown) => Object.keys(state.value).length ? state.value : fallback),
    setPublicSetting: vi.fn(async (_key: string, value: Record<string, unknown>) => { state.value = value; })
  }
}));

import { getQuestionNote, getQuestionNoteIds, saveQuestionNote } from "./questionNotes";

beforeEach(() => {
  state.value = {};
});

describe("question notes", () => {
  it("stores and reloads a note by question id", async () => {
    await saveQuestionNote("publicq:test:1", "审题时先拆问题和建议。\n注意主体。 ");
    const note = await getQuestionNote("publicq:test:1");
    expect(note?.content).toContain("先拆问题和建议");
    expect(note?.questionId).toBe("publicq:test:1");
  });

  it("reports only questions with non-empty notes", async () => {
    await saveQuestionNote("q1", "有笔记");
    await saveQuestionNote("q2", "   ");
    const ids = await getQuestionNoteIds();
    expect(ids.has("q1")).toBe(true);
    expect(ids.has("q2")).toBe(false);
  });
});
