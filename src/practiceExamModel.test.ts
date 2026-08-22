import { describe, expect, it } from "vitest";
import {
  answerSheetCapacity,
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
  it("uses 25 cells per row and follows the stated limit", () => {
    expect(answerSheetRows(350)).toBe(14);
    expect(answerSheetCapacity(350)).toBe(350);
    expect(answerSheetRows(300)).toBe(12);
    expect(answerSheetMarkers(350)).toEqual([100, 200, 300, 350]);
  });
});

describe("visual grid occupancy", () => {
  it("keeps Han characters and ordinary punctuation as individual cells", () => {
    expect(countExamGridCells("问题：地膜回收难。"))
      .toBe("问题：地膜回收难。".length);
  });

  it("packs common list enumerators into one simulated cell", () => {
    expect(countExamGridCells("1.建议"))
      .toBe(3);
    expect(countExamGridCells("2、治理"))
      .toBe(3);
  });

  it("packs consecutive Arabic digits two per simulated cell", () => {
    expect(countExamGridCells("2026年"))
      .toBe(3);
    expect(countExamGridCells("12345"))
      .toBe(3);
  });

  it("advances an explicit newline to the next answer-sheet row", () => {
    expect(countExamGridCells("甲乙\n丙", 5)).toBe(6);
  });
});
