import { describe, expect, it } from "vitest";
import { selectShenlunRegressionCases, summarizeRegressionCoverage } from "./regressionPlan";
import type { Question, QuestionType, TrainingRecord } from "../types";

const types: QuestionType[] = ["概括归纳", "综合分析", "提出对策", "贯彻执行", "文章写作"];

function question(index: number, type: QuestionType, publicQuestion = true): Question {
  return {
    id: publicQuestion ? `publicq:c${index}:task:1` : `manual-${index}`,
    title: `题目${index}`,
    year: 2025,
    region: "国家",
    type,
    difficulty: type === "文章写作" ? "挑战" : "进阶",
    score: type === "文章写作" ? 40 : 20,
    wordLimit: type === "文章写作" ? 1200 : 300,
    prompt: `请完成${type}任务。`,
    materials: [{ id: `m${index}`, label: "材料1", content: `真实材料${index}` }],
    tags: ["公开真题"],
    source: "local"
  };
}

function record(index: number, q: Question, minutesAgo: number): TrainingRecord {
  return {
    id: `r${index}`,
    questionId: q.id,
    title: q.title,
    score: 10,
    maxScore: q.score,
    submittedAt: "2026/8/22 15:00:00",
    submittedAtIso: new Date(Date.parse("2026-08-22T15:00:00+08:00") - minutesAgo * 60_000).toISOString(),
    answer: `这是第${index}个真实训练回答。`
  };
}

describe("Shenlun grader regression plan", () => {
  it("round-robins across task types and caps the replay pool at 20", () => {
    const questions: Question[] = [];
    const records: TrainingRecord[] = [];
    let index = 0;
    for (let round = 0; round < 4; round += 1) {
      for (const type of types) {
        index += 1;
        const q = question(index, type);
        questions.push(q);
        records.push(record(index, q, index));
      }
    }

    const selected = selectShenlunRegressionCases(questions, records, 15);
    expect(selected).toHaveLength(15);
    const summary = summarizeRegressionCoverage(selected);
    expect(summary.readyForSmokeReplay).toBe(true);
    expect(summary.publicQuestionCount).toBe(15);
    expect(Object.values(summary.byType)).toEqual([3, 3, 3, 3, 3]);
  });

  it("uses only the latest non-empty real answer for each question", () => {
    const q = question(1, "概括归纳");
    const oldRecord = record(1, q, 20);
    const latestRecord = { ...record(2, q, 1), answer: "最新真实回答" };
    const emptyLatest = { ...record(3, q, 0), answer: "   " };
    const selected = selectShenlunRegressionCases([q], [oldRecord, latestRecord, emptyLatest], 10);
    expect(selected).toHaveLength(1);
    expect(selected[0].answer).toBe("最新真实回答");
  });

  it("does not treat builtin demo questions as regression evidence", () => {
    const demo = { ...question(1, "概括归纳", false), source: "builtin" as const };
    const selected = selectShenlunRegressionCases([demo], [record(1, demo, 1)], 10);
    expect(selected).toEqual([]);
    expect(summarizeRegressionCoverage(selected).readyForSmokeReplay).toBe(false);
  });
});
