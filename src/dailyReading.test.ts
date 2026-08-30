import { describe, expect, it } from "vitest";
import { getDailyReadingTheme, scoreDailyArticle, type DailyNewsArticle } from "./dailyReading";

function article(overrides: Partial<DailyNewsArticle> = {}): DailyNewsArticle {
  return {
    id: "article-1",
    title: "以综合查一次规范涉企行政检查",
    url: "https://www.ah.gov.cn/zwyw/jryw/123.html",
    source: "安徽日报",
    providerName: "安徽省政府网",
    publishedAt: "2026-08-27",
    scope: "anhui",
    role: "case",
    content: "针对多头检查、重复检查问题，当地建立跨部门联合检查制度，通过数据共享完善检查计划，推动监管提质增效，企业负担明显降低。".repeat(8),
    summary: "",
    score: 0,
    selectionReason: "",
    ...overrides
  };
}

describe("daily reading selection", () => {
  it("rotates through distinct themes instead of using one permanent hot-topic list", () => {
    const themes = Array.from({ length: 10 }, (_, offset) => getDailyReadingTheme(new Date(2026, 7, 20 + offset)).id);
    expect(new Set(themes).size).toBe(10);
  });

  it("rewards recent, structured and theme-relevant enforcement material", () => {
    const theme = {
      id: "business-market",
      name: "营商环境与市场监管",
      focus: "涉企检查",
      keywords: ["营商环境", "市场监管", "涉企", "企业服务"],
      readingPrompt: ""
    };
    const useful = scoreDailyArticle(article(), theme, new Date(2026, 7, 28));
    const ceremony = scoreDailyArticle(article({
      title: "有关负责人出席活动并举行会谈",
      publishedAt: "2025-01-01",
      content: "会议指出要持续努力推动工作。".repeat(25)
    }), theme, new Date(2026, 7, 28));
    expect(useful).toBeGreaterThan(ceremony);
    expect(useful).toBeGreaterThanOrEqual(70);
  });
});
