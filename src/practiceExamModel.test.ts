import { describe, expect, it } from "vitest";
import {
  answerSheetCapacity,
  answerSheetDisplayLimit,
  answerSheetMarkers,
  answerSheetRows,
  countExamGridCells,
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

  it("packs common list enumerators into one simulated cell", () => {
    expect(countExamGridCells("1.建议")).toBe(3);
    expect(countExamGridCells("2、治理")).toBe(3);
    expect(countExamGridCells("(3)协同")).toBe(3);
    expect(countExamGridCells("（4）监管")).toBe(3);
  });

  it("packs consecutive Arabic digits two per simulated cell", () => {
    expect(countExamGridCells("2026年")).toBe(3);
    expect(countExamGridCells("12345")).toBe(3);
  });

  it("advances an explicit newline to the next answer-sheet row", () => {
    expect(countExamGridCells("甲乙\n丙", 5)).toBe(6);
  });
});
