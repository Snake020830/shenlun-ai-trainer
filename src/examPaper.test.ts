import { describe, expect, it } from "vitest";
import { inferPaperLevel, isTownshipPaper, questionPaperId } from "./examPaper";
import type { Question } from "./types";

describe("exam paper classification", () => {
  it("recognizes national paper levels", () => {
    expect(inferPaperLevel("国家", "副省级", "2025年国家公务员考试申论")).toBe("国考副省级");
    expect(inferPaperLevel("国家", "地市级", "2025年国家公务员考试申论")).toBe("国考地市级");
    expect(inferPaperLevel("国家", "行政执法卷", "2025年国家公务员考试申论")).toBe("国考行政执法类");
  });

  it("keeps province A/B/C labels without pretending they are universal", () => {
    expect(inferPaperLevel("浙江", "A卷", "2024年浙江省公务员考试申论")).toBe("省考A类");
    expect(inferPaperLevel("江苏", "C类", "2024年江苏省公务员考试申论")).toBe("省考乡镇级");
    expect(inferPaperLevel("广东", "县乡卷", "2024年广东省公务员考试申论")).toBe("省考县乡级");
  });

  it("identifies and hides explicit township papers", () => {
    const question = {
      id: "publicq:paper-1:task:1",
      title: "2024年某省申论乡镇卷 · 第1题",
      year: 2024,
      region: "某省",
      type: "概括归纳",
      difficulty: "进阶",
      score: 10,
      wordLimit: 200,
      prompt: "概括。",
      materials: [],
      tags: ["乡镇卷"]
    } satisfies Question;
    expect(isTownshipPaper(question)).toBe(true);
    expect(questionPaperId(question)).toBe("paper:paper-1");
  });
});
