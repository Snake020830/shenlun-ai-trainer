import { describe, expect, it } from "vitest";
import { evaluateEssayDrill } from "./essayDrill";
import { createEssayDrillDraft } from "./essayDrillStore";

describe("essay drill feedback", () => {
  it("checks whether an outline has a usable argument skeleton", () => {
    const draft = createEssayDrillDraft();
    draft.outline.title = "以协同治理推动基层善治";
    draft.outline.thesis = "只有把制度协同、主体参与和执行反馈结合起来，才能把治理效能落到基层。";
    draft.outline.subpoints = ["以制度协同明确治理责任", "以群众参与凝聚治理合力", "以闭环反馈提升执行效果"];
    draft.outline.evidence = "材料中的联席机制明确了部门职责，某地通过议事平台吸纳群众意见，并以跟踪回访解决问题。";
    const feedback = evaluateEssayDrill("outline", draft);
    expect(feedback.passed).toBe(true);
    expect(feedback.scoreLabel).toBe("4/4 项达标");
  });

  it("flags a paragraph that has a case but no analysis return", () => {
    const draft = createEssayDrillDraft();
    draft.paragraph.claim = "以制度协同提升基层治理效能";
    draft.paragraph.text = "以制度协同提升基层治理效能。某地建立联席会议机制，组织多个部门共同解决群众诉求，实践中形成了较好的治理效果。".repeat(3);
    const feedback = evaluateEssayDrill("paragraph", draft);
    expect(feedback.checks.find(item => item.label === "有具体论据")?.passed).toBe(true);
    expect(feedback.checks.find(item => item.label === "完成分析回扣")?.passed).toBe(false);
  });

  it("requires all three parts when transforming a case", () => {
    const draft = createEssayDrillDraft();
    draft.evidence.caseText = "某村整合网格员、志愿者和村干部，建立问题上报与回访机制，及时解决道路和养老服务问题。";
    draft.evidence.mechanism = "通过多元主体协同和闭环反馈，把分散诉求转化为可跟踪的治理行动。";
    draft.evidence.target = "以协同机制提升基层治理效能";
    expect(evaluateEssayDrill("evidence", draft).passed).toBe(true);
  });
});
