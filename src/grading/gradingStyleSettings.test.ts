import { beforeEach, describe, expect, it } from "vitest";
import {
  GRADING_STYLE_MAX_LENGTH,
  gradingStylePreset,
  loadGradingStyleProfile,
  sanitizeGradingStyleProfile,
  saveGradingStyleProfile
} from "./gradingStyleSettings";

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
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: new MemoryStorage() });
});

describe("grading style settings", () => {
  it("round-trips an editable preset without storing unknown fields", async () => {
    const saved = await saveGradingStyleProfile({ ...gradingStylePreset("yuan-dong"), prompt: "更重视中观词。" });
    expect((await loadGradingStyleProfile()).prompt).toBe("更重视中观词。");
    expect(saved.updatedAt).toBeTruthy();
  });

  it("sanitizes ids, names, and prompt length", () => {
    const profile = sanitizeGradingStyleProfile({ presetId: "unsafe", name: " x ", prompt: "a".repeat(GRADING_STYLE_MAX_LENGTH + 20) });
    expect(profile.presetId).toBe("default");
    expect(profile.name).toBe("x");
    expect(profile.prompt).toHaveLength(GRADING_STYLE_MAX_LENGTH);
  });

  it("ships the source-derived Bailu preset with concrete grading rules", () => {
    const preset = gradingStylePreset("bailu");
    expect(preset.prompt.length).toBeGreaterThan(2_800);
    expect(preset.prompt.length).toBeLessThanOrEqual(GRADING_STYLE_MAX_LENGTH);
    expect(preset.prompt).toContain("材料与任务边界严格");
    expect(preset.prompt).toContain("问题简、对策详");
    expect(preset.prompt).toContain("【三、归纳概括题】");
    expect(preset.prompt).toContain("【五、综合分析题】");
    expect(preset.prompt).toContain("【六、应用文题】");
    expect(preset.prompt).toContain("【七、大作文】");
    expect(preset.prompt).toContain("结构性限分、哪些是普通漏点");
  });

  it("upgrades only the exact legacy Bailu placeholder", async () => {
    const legacyPrompt = "采用温和、清晰的教练式反馈。先指出考生已经覆盖的有效内容，再说明还差哪个得分维度以及为什么；避免打击式表达。每条建议给出一个最小可执行改法，语言自然、有启发性，但不降低评分标准。";
    await saveGradingStyleProfile({ presetId: "bailu", name: "白鹭风格", prompt: legacyPrompt });
    expect((await loadGradingStyleProfile()).prompt).toContain("材料与任务边界严格");

    await saveGradingStyleProfile({ presetId: "bailu", name: "我的白鹭风格", prompt: `${legacyPrompt}\n保留我的补充。` });
    expect((await loadGradingStyleProfile()).prompt).toContain("保留我的补充");
  });
});
