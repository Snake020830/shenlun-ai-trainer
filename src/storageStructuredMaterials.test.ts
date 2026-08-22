import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => false }));

import { persistence } from "./storage";

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

describe("structured material persistence", () => {
  it("prefers explicit materials over the legacy materialText bridge", async () => {
    const question = await persistence.addImportedQuestion({
      title: "2025国考申论 · 第1题",
      year: 2025,
      region: "国家",
      type: "概括归纳",
      difficulty: "进阶",
      score: 10,
      wordLimit: 200,
      prompt: "请根据给定资料1概括主要做法。",
      materialText: "旧桥接内容不应覆盖结构化材料。",
      materials: [
        {
          label: "材料1",
          content: "第一段。\n\n第二段。"
        },
        {
          label: "材料2",
          content: "第三段。"
        }
      ],
      tags: ["公开真题"]
    });

    expect(question.materials).toEqual([
      { id: "m1", label: "材料1", content: "第一段。\n\n第二段。" },
      { id: "m2", label: "材料2", content: "第三段。" }
    ]);

    const stored = await persistence.listImportedQuestions();
    expect(stored).toHaveLength(1);
    expect(stored[0].materials[0].label).toBe("材料1");
    expect(stored[0].materials[0].content).toBe("第一段。\n\n第二段。");
  });

  it("keeps the legacy materialText path for manual imports without structured materials", async () => {
    const question = await persistence.addImportedQuestion({
      title: "手工题",
      year: 2026,
      region: "本地导入",
      type: "概括归纳",
      difficulty: "进阶",
      score: 20,
      wordLimit: 300,
      prompt: "概括材料。",
      materialText: "第一则。\n\n第二则。",
      tags: []
    });

    expect(question.materials.map(item => item.content)).toEqual(["第一则。", "第二则。 ".trim()]);
    expect(question.materials.map(item => item.label)).toEqual(["材料 1", "材料 2"]);
  });
});
