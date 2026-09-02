import { describe, expect, it } from "vitest";
import {
  answerSheetCapacity,
  answerSheetDisplayLimit,
  answerSheetMarkers,
  answerSheetRows,
  buildExamGridLayout,
  countExamGridCells,
  examGridCellForOffset,
  examGridOffsetForCell,
  recommendedPracticeMinutes
} from "./practiceExamModel";

describe("practice exam timing", () => {
  it("allocates deterministic countdowns from the task word limit", () => {
    expect(recommendedPracticeMinutes(200, "概括归纳")).toBe(20);
    expect(recommendedPracticeMinutes(300, "提出对策")).toBe(25);
    expect(recommendedPracticeMinutes(350, "综合分析")).toBe(30);
    expect(recommendedPracticeMinutes(400, "贯彻执行")).toBe(30);
    expect(recommendedPracticeMinutes(1200, "文章写作")).toBe(70);
  });
});

describe("answer-sheet geometry", () => {
  it("rounds visual paper capacity upward without changing the grading word limit", () => {
    expect(answerSheetDisplayLimit(300)).toBe(300);
    expect(answerSheetDisplayLimit(350)).toBe(400);
    expect(answerSheetDisplayLimit(550)).toBe(600);
    expect(answerSheetRows(350)).toBe(16);
    expect(answerSheetCapacity(350)).toBe(400);
    expect(answerSheetRows(300)).toBe(12);
  });

  it("shows only sparse 200-character paper-side markers", () => {
    expect(answerSheetMarkers(300)).toEqual([200]);
    expect(answerSheetMarkers(350)).toEqual([200, 400]);
    expect(answerSheetMarkers(550)).toEqual([200, 400, 600]);
  });
});

describe("visual grid occupancy", () => {
  it("keeps Han characters and ordinary punctuation as individual cells", () => {
    expect(countExamGridCells("问题：地膜回收难。"))
      .toBe("问题：地膜回收难。".length);
  });

  it("packs common list enumerators into one real visual cell", () => {
    const layout = buildExamGridLayout("1.建议 2、治理 （3）协同");
    expect(layout.tokens[0]).toMatchObject({ text: "1.", cellIndex: 0, kind: "enumerator" });
    expect(layout.tokens.find(token => token.text === "2、")?.kind).toBe("enumerator");
    expect(layout.tokens.find(token => token.text === "（3）")?.kind).toBe("enumerator");
    expect(countExamGridCells("1.建议")).toBe(3);
    expect(countExamGridCells("2、治理")).toBe(3);
    expect(countExamGridCells("(3)协同")).toBe(3);
    expect(countExamGridCells("（4）监管")).toBe(3);
  });

  it("packs terminal punctuation with a closing quote or bracket", () => {
    const text = "一句话。”";
    const layout = buildExamGridLayout(text);
    expect(layout.tokens.at(-1)).toMatchObject({ text: "。”", kind: "paired-punctuation", cellIndex: 3 });
    expect(countExamGridCells(text)).toBe(4);
    expect(countExamGridCells("“引用”。”")).toBe(5);
  });

  it("does not merge ordinary punctuation inside a sentence", () => {
    expect(countExamGridCells("一，二。三")).toBe(5);
  });

  it("packs consecutive Arabic digits into visible pairs", () => {
    const layout = buildExamGridLayout("2026年");
    expect(layout.tokens.map(token => [token.text, token.cellIndex]))
      .toEqual([["20", 0], ["26", 1], ["年", 2]]);
    expect(countExamGridCells("2026年")).toBe(3);
    expect(countExamGridCells("12345")).toBe(3);
  });

  it("fills the 25th cell before advancing to the next row", () => {
    const text = "甲".repeat(26);
    const layout = buildExamGridLayout(text, 25);
    expect(layout.tokens[24].cellIndex).toBe(24);
    expect(layout.tokens[25].cellIndex).toBe(25);
    expect(layout.occupiedCells).toBe(26);
  });

  it("maps clicks and caret offsets through merged tokens", () => {
    const text = "1.建议2026年";
    expect(examGridOffsetForCell(text, 0)).toBe(0);
    expect(examGridOffsetForCell(text, 1)).toBe(2);
    expect(examGridCellForOffset(text, 1)).toBe(0);
    expect(examGridCellForOffset(text, 2)).toBe(1);
  });

  it("advances an explicit newline to the next answer-sheet row", () => {
    expect(countExamGridCells("甲乙\n丙", 5)).toBe(6);
  });
});
