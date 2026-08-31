import { describe, expect, it } from "vitest";
import { buildMaterialDeepReadRequest, MATERIAL_LEARNING_VERSION, validateMaterialDeepReadOutput } from "./materialLearning";
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
    expect(request.instructions).toContain("参考作答");
    expect(request.instructions).toContain("规范表达");
    expect(request.instructions).toContain("因果链");
    expect(request.instructions).toContain("大作文");
    expect(request.instructions).toContain("逐字复制材料");
    expect(request.instructions).toContain("考场上如何审题");
    expect(request.instructions).toContain("每个独立得分点至少回指一条 annotation");
    expect(request.instructions).toContain("逐段复核所有材料");
    expect(request.instructions).toContain("不要因为题目问“问题”就把所有证据机械标成 problem");
    expect(request.input).not.toContain("userAnswer");
  });

  it("asks small questions for a direct answer within the question word limit", () => {
    const request = buildMaterialDeepReadRequest(baseQuestion);
    expect(request.instructions).toContain("不超过 300 字");
    expect(request.instructions).toContain("主体、对象、中观词和关键机制");
  });

  it("uses an essay-specific learning output instead of the small-question rubric model", () => {
    const request = buildMaterialDeepReadRequest({ ...baseQuestion, type: "文章写作", wordLimit: 1200 });
    expect(request.instructions).toContain("中心立意 + 3个左右分论点");
    expect(request.instructions).toContain("示范论证");
    expect(request.instructions).toContain("不套万能模板");
  });

  it("fails closed when a structured deep-read field is missing or empty", () => {
    const valid = {
      annotations: [{ quote: "资源整合", type: "practice", keyPoint: "整合治理资源" }],
      referenceAnswer: "参考作答",
      answerNotes: [],
      examApproach: ["圈定作答对象"],
      expressions: [],
      mechanisms: [],
      cases: [],
      essayAngles: []
    };
    expect(validateMaterialDeepReadOutput(valid).referenceAnswer).toBe("参考作答");
    expect(validateMaterialDeepReadOutput(valid).annotations[0].type).toBe("practice");
    expect(() => validateMaterialDeepReadOutput({ ...valid, mechanisms: undefined })).toThrow("mechanisms");
    expect(() => validateMaterialDeepReadOutput({ ...valid, referenceAnswer: " " })).toThrow("referenceAnswer");
  });

  it("keeps v0.1 snapshots readable after annotation support is added", () => {
    const legacy = validateMaterialDeepReadOutput({
      referenceAnswer: "参考作答",
      answerNotes: ["先概括，再分类"],
      expressions: [{ phrase: "制度协同", meaning: "强化部门联动", useCases: ["基层治理"], sourceEvidence: "通过制度协同提升服务效能" }],
      mechanisms: [],
      cases: [],
      essayAngles: []
    });
    expect(legacy.annotations[0].quote).toContain("制度协同");
    expect(legacy.examApproach).toEqual(["先概括，再分类"]);
  });
});
