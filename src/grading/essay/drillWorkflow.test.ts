import { describe, expect, it } from "vitest";
import { createEssayDrillDraft } from "../../essayDrillStore";
import type { Question } from "../../types";
import { buildEssayDrillReviewRequest } from "./drillPrompts";
import { validateEssayDrillReview } from "./drillValidation";

const question: Question = {
  id: "essay-drill-q1",
  title: "智慧与勇气",
  year: 2021,
  region: "湖北",
  type: "文章写作",
  difficulty: "进阶",
  score: 45,
  wordLimit: 1000,
  prompt: "请结合给定资料，以‘智慧与勇气’为题写一篇议论文。",
  materials: [{ id: "m1", label: "材料1", content: "农业技术人员推广新品种，帮助农民增产增收。" }],
  tags: ["脱贫攻坚"]
};

const validReview = {
  overallLevel: "revise",
  summary: "五步主线基本形成，但素材与第二个分论点的证明关系需要加强。",
  coherence: {
    finding: "标题、总论点和结尾围绕智慧与勇气展开。",
    breakpoints: ["素材只证明科技智慧，尚未支撑勇气这一分论点。"],
    action: "为勇气分论点补充基层干部迎难而上的材料。"
  },
  stepReviews: [
    ["theme", "审题立意", "strong", "标题和总论点同题同向。", "以智慧与勇气开创发展新局", ["YD-THEME-01", "YD-THESIS-02"]],
    ["outline", "分论点", "developing", "三个分论点基本区分。", "以智慧破解难题", ["YD-SUBPOINT-03"]],
    ["paragraph", "主体论证", "developing", "案例后评论不足。", "农业技术人员推广新品种", ["YD-ARGUMENT-06"]],
    ["evidence", "素材转化", "developing", "素材机制已经提炼。", "科技赋能带动增收", ["YD-EVIDENCE-07"]],
    ["closing", "结尾收束", "strong", "能够回扣智慧与勇气。", "以智慧谋发展，以勇气闯新路", ["YD-CLOSING-08"]]
  ].map(([id, label, status, finding, answerEvidence, courseRuleIds]) => ({
    id, label, status, finding, answerEvidence, courseRuleIds,
    action: "补充一个最优先修改动作。",
    rewriteExample: "给出本步修改示例。"
  })),
  priorityActions: ["补强素材与勇气分论点的对应关系。"],
  assemblyPlan: ["标题", "开头", "主体一", "主体二", "结尾"]
};

describe("essay drill professional review", () => {
  it("builds a course-grounded request containing all five answers", () => {
    const draft = createEssayDrillDraft();
    draft.theme.quickTitle = "以智慧与勇气开创发展新局";
    draft.theme.quickText = "以科学智慧破解难题，以攻坚勇气推动乡村振兴。";
    draft.outline.quickText = "以智慧破解难题\n以勇气攻坚克难";
    draft.paragraph.quickText = "主体段答案";
    draft.evidence.quickText = "素材转化答案";
    draft.closing.quickText = "结尾答案";
    const request = buildEssayDrillReviewRequest(question, draft);
    expect(request.instructions).toContain("标题→总论点→分论点→主体论证→素材转化→结尾");
    expect(request.instructions).toContain("不得只数句子长度或搜索连接词");
    expect(request.input).toContain("以智慧与勇气开创发展新局");
    expect(request.input).toContain("素材转化答案");
  });

  it("validates a detailed five-step review", () => {
    const review = validateEssayDrillReview(validReview);
    expect(review.stepReviews).toHaveLength(5);
    expect(review.coherence.breakpoints).toHaveLength(1);
    expect(review.stepReviews[2].courseRuleIds).toContain("YD-ARGUMENT-06");
  });

  it("rejects unknown course evidence rules", () => {
    const invalid = structuredClone(validReview);
    invalid.stepReviews[0].courseRuleIds = ["UNKNOWN-RULE"];
    expect(() => validateEssayDrillReview(invalid)).toThrow(/unknown rule/i);
  });
});
