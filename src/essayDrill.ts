import type { EssayDrillDraft, EssayDrillMode } from "./essayDrillStore";

export interface EssayDrillCheck {
  label: string;
  passed: boolean;
  detail: string;
}

export interface EssayDrillFeedback {
  mode: EssayDrillMode;
  passed: boolean;
  scoreLabel: string;
  checks: EssayDrillCheck[];
  nextStep: string;
}

export function compactLength(value: string): number {
  return value.replace(/\s/g, "").length;
}

function filledSubpoints(draft: EssayDrillDraft): string[] {
  return draft.outline.subpoints.map(item => item.trim()).filter(Boolean);
}

function hasAny(value: string, words: string[]): boolean {
  return words.some(word => value.includes(word));
}

function scoreChecks(mode: EssayDrillMode, checks: EssayDrillCheck[], nextStep: string): EssayDrillFeedback {
  const passedCount = checks.filter(item => item.passed).length;
  const passed = passedCount === checks.length;
  return {
    mode,
    passed,
    scoreLabel: `${passedCount}/${checks.length} 项达标`,
    checks,
    nextStep: passed ? "可以进入下一轮练习，逐步提高论据的具体度和分析力度。" : nextStep
  };
}

export function evaluateEssayDrill(mode: EssayDrillMode, draft: EssayDrillDraft): EssayDrillFeedback {
  if (mode === "outline") {
    const subpoints = filledSubpoints(draft);
    const uniqueSubpoints = new Set(subpoints.map(item => item.replace(/[，。；、\s]/g, "").slice(0, 16))).size;
    return scoreChecks(mode, [
      { label: "标题回应主题", passed: compactLength(draft.outline.title) >= 6, detail: "标题至少包含主题词或核心命题，不追求华丽。" },
      { label: "中心论点清楚", passed: compactLength(draft.outline.thesis) >= 18, detail: "用一句话回答‘为什么重要、靠什么实现’。" },
      { label: "分论点成组", passed: subpoints.length >= 2 && subpoints.length <= 3 && uniqueSubpoints === subpoints.length, detail: "建议先写 2—3 个互不重复、可以展开的角度。" },
      { label: "材料证据到位", passed: compactLength(draft.outline.evidence) >= 30, detail: "每个分论点至少挂接一个材料事实、案例或机制。" }
    ], "先补齐中心论点和 2—3 个分论点，再为每个分论点写一条材料证据。");
  }

  if (mode === "paragraph") {
    const paragraphLength = compactLength(draft.paragraph.text);
    const paragraph = draft.paragraph.text;
    return scoreChecks(mode, [
      { label: "分论点明确", passed: compactLength(draft.paragraph.claim) >= 8, detail: "段首直接亮出本段要证明的观点。" },
      { label: "篇幅适中", passed: paragraphLength >= 180 && paragraphLength <= 360, detail: `当前 ${paragraphLength} 字，建议单段控制在 220—300 字附近。` },
      { label: "有具体论据", passed: hasAny(paragraph, ["例如", "比如", "以……为例", "案例", "材料", "实践中", "某地", "某村"]), detail: "不要只写抽象口号，至少落到一个事实、案例或材料细节。" },
      { label: "完成分析回扣", passed: hasAny(paragraph, ["因此", "这说明", "可见", "由此", "只有", "从而", "才能"]), detail: "论据之后补一句机制分析，并回扣分论点。" }
    ], "先把段落压到 220—300 字，再补上‘论据之后的为什么’和结尾回扣。");
  }

  const evidence = draft.evidence;
  return scoreChecks(mode, [
    { label: "案例信息完整", passed: compactLength(evidence.caseText) >= 30, detail: "交代主体、做法和结果，避免只留下一个地名或口号。" },
    { label: "抽象出机制", passed: compactLength(evidence.mechanism) >= 18, detail: "把案例背后的因果关系提炼成可迁移的中观表达。" },
    { label: "绑定分论点", passed: compactLength(evidence.target) >= 8, detail: "明确这条素材服务于哪个分论点，避免素材与文章两张皮。" }
  ], "先补全案例的主体—做法—结果，再用一句话写出可迁移机制，并绑定到一个分论点。");
}
