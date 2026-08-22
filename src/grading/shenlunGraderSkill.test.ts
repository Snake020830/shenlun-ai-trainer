import { describe, expect, it } from "vitest";
import { preflightShenlunGrading, SHENLUN_GRADER_SKILL_VERSION } from "./shenlunGraderSkill";
import type { Question } from "../types";

const question: Question = {
  id: "q-real-1",
  title: "测试申论题",
  year: 2025,
  region: "国家",
  type: "概括归纳",
  difficulty: "进阶",
  score: 20,
  wordLimit: 200,
  prompt: "请根据给定资料1概括主要做法。",
  materials: [
    { id: "m1", label: "材料1", content: "第一段材料。\n\n第二段材料。" },
    { id: "m2", label: "材料2", content: "补充材料。" }
  ],
  tags: ["公开真题"],
  source: "local"
};

describe("Shenlun Grader skill", () => {
  it("has a stable skill version", () => {
    expect(SHENLUN_GRADER_SKILL_VERSION).toBe("shenlun-grader-skill@0.3.1");
  });

  it("builds deterministic preflight metadata from full materials and answer", () => {
    const result = preflightShenlunGrading({
      question,
      answer: "一是完善机制；二是强化协同。",
      referenceAnswer: { content: "参考答案", source: "人工参考" }
    });
    expect(result.questionId).toBe(question.id);
    expect(result.materialCount).toBe(2);
    expect(result.materialCharCount).toBeGreaterThan(0);
    expect(result.answerCharCount).toBeGreaterThan(0);
    expect(result.wordLimit).toBe(200);
    expect(result.overLimit).toBe(false);
    expect(result.hasReferenceAnswer).toBe(true);
  });

  it("flags over-limit answers without blocking grading", () => {
    const result = preflightShenlunGrading({ question: { ...question, wordLimit: 5 }, answer: "一二三四五六七八九十" });
    expect(result.overLimit).toBe(true);
    expect(result.answerCharCount).toBe(10);
  });

  it("fails closed on incomplete question/material inputs", () => {
    expect(() => preflightShenlunGrading({ question: { ...question, prompt: "" }, answer: "答案" })).toThrow("question prompt");
    expect(() => preflightShenlunGrading({ question: { ...question, materials: [] }, answer: "答案" })).toThrow("at least one material");
    expect(() => preflightShenlunGrading({ question: { ...question, materials: [{ id: "m1", label: "材料1", content: "" }] }, answer: "答案" })).toThrow("material 1 is empty");
    expect(() => preflightShenlunGrading({ question, answer: "   \n" })).toThrow("answer is empty");
  });
});
