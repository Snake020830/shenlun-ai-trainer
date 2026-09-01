import { describe, expect, it, vi } from "vitest";
import type { Question } from "../../types";
import type { RemoteModelTransport } from "../remote/config";
import { ESSAY_DIMENSION_WEIGHTS, ESSAY_METHOD_ID, YUAN_DONG_ESSAY_RULES } from "./evidence";
import { createRemoteEssayGradingProvider, createEssayGradingService } from "./provider";
import { validateEssayEvaluation } from "./validation";

const question: Question = {
  id: "essay-real-1",
  title: "文章写作测试",
  year: 2026,
  region: "国家",
  type: "文章写作",
  difficulty: "挑战",
  score: 35,
  wordLimit: 1000,
  prompt: "围绕文化传承与创新发展，结合给定资料写一篇文章。",
  materials: [{ id: "m1", label: "材料1", content: "某地以数字技术活化文化遗产，扩大青年参与并带动文旅融合。" }],
  tags: ["作文"]
};

const task = {
  themeType: "double",
  topicKeywords: ["文化传承", "创新发展"],
  proposedThesis: "以创新表达推动文化传承，让传统文化在时代发展中焕发生机。",
  subpointCandidates: [
    { claim: "以数字技术拓展文化表达", source: "prompt-material", sourceEvidence: "数字技术活化文化遗产" },
    { claim: "以青年参与增强传承动力", source: "full-material", sourceEvidence: "扩大青年参与" }
  ],
  taskEvidence: "围绕文化传承与创新发展"
};

const evaluation = {
  summary: "立意准确、结构完整，论证链和材料评论仍可加强。",
  dimensions: [
    { id: "thesis", score: 24, finding: "主题关系明确。", answerEvidence: "以创新推动传承", action: "在总论点补明二者关系。", evidenceRuleIds: ["YD-THEME-01"] },
    { id: "structure", score: 16, finding: "五段结构完整。", answerEvidence: "三个主体段", action: "增强分论点区分。", evidenceRuleIds: ["YD-STRUCTURE-04"] },
    { id: "argument", score: 20, finding: "有分析与事例。", answerEvidence: "某地以数字技术活化遗产", action: "事例后补充机制评论。", evidenceRuleIds: ["YD-ARGUMENT-06"] },
    { id: "material", score: 12, finding: "材料已转化。", answerEvidence: "青年参与带动传承", action: "明确材料与分论点的证明关系。", evidenceRuleIds: ["YD-EVIDENCE-07"] },
    { id: "expression", score: 8, finding: "表达连贯。", answerEvidence: "让传统文化焕发生机", action: "压缩重复的价值判断。", evidenceRuleIds: ["YD-EXPRESSION-09"] }
  ],
  structureTrace: {
    title: "创新激活传承",
    centralThesis: "以创新推动文化传承。",
    subpoints: ["技术赋能", "青年参与", "融合发展"],
    paragraphCount: 5,
    introductionAssessment: "已引出总论点。",
    conclusionAssessment: "已回扣并展望。"
  },
  revisedOutline: {
    title: "以创新之笔续写传承新篇",
    thesis: "以多元创新推动文化传承融入时代。",
    subpoints: ["技术拓展表达", "青年增强动力", "融合释放价值"],
    paragraphPlan: ["开头立论", "技术段", "青年段", "融合段", "结尾回扣"]
  }
};

function transport(): RemoteModelTransport {
  return {
    config: {
      id: "essay-test", label: "Essay test", enabled: true, protocol: "openai-responses",
      baseUrl: "https://example.com/v1", model: "test-model", secretRef: "test-key", timeoutMs: 10_000, reasoningEffort: "provider-default"
    },
    completeJson: vi.fn(async request => ({ data: request.schemaName === "essay_task_analysis_v10" ? task : evaluation })) as unknown as RemoteModelTransport["completeJson"]
  };
}

describe("independent essay grading workflow", () => {
  it("keeps the evidence-derived diagnostic weights at 100", () => {
    expect(Object.values(ESSAY_DIMENSION_WEIGHTS).reduce((sum, value) => sum + value, 0)).toBe(100);
    expect(YUAN_DONG_ESSAY_RULES.length).toBeGreaterThanOrEqual(8);
  });

  it("runs task construction before article evaluation and scales to the question score", async () => {
    const remote = transport();
    const service = createEssayGradingService(createRemoteEssayGradingProvider(remote));
    const result = await service.gradeDetailed({ question, answer: "创新激活传承\n以创新推动文化传承。\n某地以数字技术活化遗产，因此应以技术赋能文化发展。" });
    expect(remote.completeJson).toHaveBeenCalledTimes(2);
    expect(result.review.score).toBe(28);
    expect(result.review.essayReview?.methodId).toBe(ESSAY_METHOD_ID);
    expect(result.review.essayReview?.dimensions).toHaveLength(5);
    expect(result.artifacts.taskAnalysis.topicKeywords).toContain("文化传承");
  });

  it("rejects duplicate dimensions instead of silently producing a score", () => {
    const invalid = { ...evaluation, dimensions: evaluation.dimensions.map(item => ({ ...item })) };
    invalid.dimensions[1].id = "thesis";
    expect(() => validateEssayEvaluation(invalid)).toThrow("invalid or duplicated");
  });

  it("refuses small questions at the essay contract boundary", async () => {
    const service = createEssayGradingService(createRemoteEssayGradingProvider(transport()));
    await expect(service.grade({ question: { ...question, type: "概括归纳" }, answer: "答案" })).rejects.toThrow("only accepts");
  });
});
