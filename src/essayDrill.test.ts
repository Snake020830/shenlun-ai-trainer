import { afterEach, describe, expect, it, vi } from "vitest";
import { evaluateEssayDrill } from "./essayDrill";
import { createEssayDrillDraft, loadEssayDrillDraft } from "./essayDrillStore";

afterEach(() => vi.unstubAllGlobals());

describe("essay drill feedback", () => {
  it("checks whether an outline has a usable argument skeleton", () => {
    const draft = createEssayDrillDraft();
    draft.outline.subpoints = ["以制度协同明确治理责任", "以群众参与凝聚治理合力", "以闭环反馈提升执行效果"];
    draft.outline.evidenceLinks = ["联席机制明确部门职责", "议事平台吸纳群众意见", "跟踪回访解决具体问题"];
    const feedback = evaluateEssayDrill("outline", draft);
    expect(feedback.passed).toBe(true);
    expect(feedback.scoreLabel).toBe("3/3 项达标");
  });

  it("requires topic keywords to survive into title and thesis", () => {
    const draft = createEssayDrillDraft();
    draft.theme.keywords = "文化传承，创新发展";
    draft.theme.themeType = "double";
    draft.theme.title = "以创新发展激活文化传承";
    draft.theme.thesis = "只有以创新发展拓展表达方式，才能让文化传承融入时代并持续焕发生机。";
    expect(evaluateEssayDrill("theme", draft).passed).toBe(true);
  });

  it("flags a paragraph that has a case but no analysis return", () => {
    const draft = createEssayDrillDraft();
    draft.paragraph.claim = "以制度协同提升基层治理效能";
    draft.paragraph.analysis = "基层治理面对事项交叉和职责分散，只有理顺协作关系、明确责任边界，才能降低协调成本并快速回应群众诉求。";
    draft.paragraph.caseText = "某地建立联席会议机制，组织多个部门共同会商，形成问题派单、协同处理和跟踪反馈的闭环，解决了一批长期积压诉求。";
    const feedback = evaluateEssayDrill("paragraph", draft);
    expect(feedback.checks.find(item => item.label === "分析与事例齐全")?.passed).toBe(true);
    expect(feedback.checks.find(item => item.label === "评论并回扣")?.passed).toBe(false);
  });

  it("requires all three parts when transforming a case", () => {
    const draft = createEssayDrillDraft();
    draft.evidence.caseText = "某村整合网格员、志愿者和村干部，建立问题上报与回访机制，及时解决道路和养老服务问题。";
    draft.evidence.mechanism = "通过多元主体协同和闭环反馈，把分散诉求转化为可跟踪的治理行动。";
    draft.evidence.target = "以协同机制提升基层治理效能";
    expect(evaluateEssayDrill("evidence", draft).passed).toBe(true);
  });

  it("migrates v1 outline and paragraph drafts into the five-stage model", () => {
    const values = new Map<string, string>();
    values.set("shenlun:essay-drills:v1", JSON.stringify({ q1: {
      mode: "paragraph",
      outline: { title: "以协同推动善治", thesis: "以多元协同凝聚基层治理合力，推动治理效能持续提升。", subpoints: ["制度协同", "群众参与", "闭环反馈"], evidence: "联席机制材料" },
      paragraph: { claim: "以制度协同提升治理效能", text: "原有整段草稿" },
      evidence: { caseText: "", mechanism: "", target: "" }
    } }));
    vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
    const migrated = loadEssayDrillDraft("q1");
    expect(migrated.mode).toBe("paragraph");
    expect(migrated.theme.title).toBe("以协同推动善治");
    expect(migrated.paragraph.analysis).toBe("原有整段草稿");
    expect(migrated.outline.evidenceLinks[0]).toBe("联席机制材料");
  });
});
