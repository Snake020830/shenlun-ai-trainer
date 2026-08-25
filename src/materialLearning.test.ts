import { describe, expect, it } from "vitest";
import { buildMaterialDeepReadRequest, MATERIAL_LEARNING_VERSION } from "./materialLearning";
import type { Question } from "./types";

const baseQuestion: Question = {
  id: "q-learning",
  title: "基层治理材料题",
  year: 2025,
  region: "国家",
  type: "综合分析",
  difficulty: "进阶",
  score: 20,
  wordLimit: 300,
  prompt: "请谈谈对这句话的理解。",
  materials: [{ id: "m1", label: "材料1", content: "某地通过资源整合、群众参与和制度协同提升基层治理效能。" }],
  tags: ["基层治理"],
  source: "local"
};

describe("AI material deep-read", () => {
  it("is explicitly a learning workflow rather than answer grading", () => {
    const request = buildMaterialDeepReadRequest(baseQuestion);
    expect(request.instructions).toContain(MATERIAL_LEARNING_VERSION);
    expect(request.instructions).toContain("这不是评分任务");
    expect(request.instructions).toContain("不要评价用户答案");
    expect(request.instructions).toContain("先整合材料逻辑，再做提炼");
    expect(request.instructions).toContain("规范表达");
    expect(request.instructions).toContain("因果链");
    expect(request.instructions).toContain("大作文调用单元");
    expect(request.input).not.toContain("userAnswer");
  });

  it("asks small questions for a direct answer within the question word limit", () => {
    const request = buildMaterialDeepReadRequest(baseQuestion);
    expect(request.instructions).toContain("不超过 300 字");
    expect(request.instructions).toContain("主体、对象、中观词和关键机制");
    expect(request.instructions).toContain("answerBlueprint 只保留2—4条");
  });

  it("integrates essay learning as fact mechanism and reusable claim", () => {
    const request = buildMaterialDeepReadRequest({ ...baseQuestion, type: "文章写作", wordLimit: 1200 });
    expect(request.instructions).toContain("中心立意 + 3个左右分论点");
    expect(request.instructions).toContain("示范论证");
    expect(request.instructions).toContain("不套万能模板");
    expect(request.instructions).toContain("fact（事实压缩）→ mechanism（为什么会产生作用/问题）→ usableClaim");
    expect(request.instructions).toContain("不得机械重复");
  });

  it("uses the v2 integrated output schema instead of parallel case and angle lists", () => {
    const request = buildMaterialDeepReadRequest(baseQuestion);
    const schema = request.jsonSchema as { required: string[]; properties: Record<string, unknown> };
    expect(schema.required).toEqual(["referenceAnswer", "answerBlueprint", "themeSummary", "expressions", "reasoningChains", "essayUnits"]);
    expect(schema.properties).not.toHaveProperty("cases");
    expect(schema.properties).not.toHaveProperty("essayAngles");
  });
});
