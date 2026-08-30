import { describe, expect, it } from "vitest";
import { buildExactQuestionSimilarityMap, buildQuestionSimilarityMap, materialSimilarity } from "./questionSimilarity";
import type { Question } from "./types";

function question(id: string, content: string, wordLimit = 200): Question {
  return {
    id,
    title: id,
    year: 2026,
    region: "测试",
    type: "概括归纳",
    difficulty: "进阶",
    score: 10,
    wordLimit,
    prompt: "概括主要做法。",
    materials: [{ id: "m1", label: "材料1", content }],
    tags: [],
    source: "local"
  };
}

describe("question material similarity", () => {
  it("treats identical material with different word limits as the same material group", () => {
    const left = question("bamboo-1", "竹产业通过标准化种植、精深加工和品牌建设，带动群众增收。", 200);
    const right = question("bamboo-2", "竹产业通过标准化种植、精深加工和品牌建设，带动群众增收。", 300);
    expect(materialSimilarity(left, right)).toBe(1);
    expect(buildQuestionSimilarityMap([left, right]).get(left.id)).toEqual([{ questionId: right.id, score: 1 }]);
    expect(buildExactQuestionSimilarityMap([left, right]).get(left.id)).toEqual([{ questionId: right.id, score: 1 }]);
  });

  it("does not group unrelated materials", () => {
    const left = question("q1", "通过数字平台整合政务服务事项，减少企业重复提交材料。")
    const right = question("q2", "通过河道治理和生态修复，改善农村人居环境质量。")
    expect(materialSimilarity(left, right)).toBeLessThan(0.78);
    expect(buildQuestionSimilarityMap([left, right]).get(left.id)).toEqual([]);
  });
});
