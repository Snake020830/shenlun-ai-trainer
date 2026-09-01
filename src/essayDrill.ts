import type { EssayDrillDraft, EssayDrillMode } from "./essayDrillStore";

export interface EssayDrillCheck { label: string; passed: boolean; detail: string }
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

function scoreChecks(mode: EssayDrillMode, checks: EssayDrillCheck[], nextStep: string): EssayDrillFeedback {
  const passedCount = checks.filter(item => item.passed).length;
  const passed = passedCount === checks.length;
  return {
    mode,
    passed,
    scoreLabel: `${passedCount}/${checks.length} 项达标`,
    checks,
    nextStep: passed ? "本环节可以进入下一步；整篇提交后仍以五维作文诊断为准。" : nextStep
  };
}

export function evaluateEssayDrill(mode: EssayDrillMode, draft: EssayDrillDraft): EssayDrillFeedback {
  if (mode === "theme") {
    const keywords = draft.theme.keywords.split(/[，,、\s]+/).map(item => item.trim()).filter(Boolean);
    return scoreChecks(mode, [
      { label: "题干关键词明确", passed: keywords.length >= 1 && keywords.length <= 4, detail: "从题干抄准1—4个核心词，不先用自己的近义词替换。" },
      { label: "主题类型已判断", passed: Boolean(draft.theme.themeType), detail: "先判断单主题、双主题或多主题，再决定主题关系。" },
      { label: "标题回应主题", passed: compactLength(draft.theme.title) >= 6 && keywords.some(keyword => draft.theme.title.includes(keyword)), detail: "标题保留题干核心词，可加对策或影响。" },
      { label: "总论点完成改写", passed: compactLength(draft.theme.thesis) >= 18 && keywords.some(keyword => draft.theme.thesis.includes(keyword)), detail: "把标题改写为完整判断句，说明靠什么或带来什么。" }
    ], "先抄准题干关键词并判断主题类型，再用关键词完成标题和总论点。");
  }

  if (mode === "outline") {
    const subpoints = draft.outline.subpoints.map(item => item.trim()).filter(Boolean);
    const uniqueSubpoints = new Set(subpoints.map(item => item.replace(/[，。；、\s]/g, "").slice(0, 16))).size;
    const linkedEvidenceCount = draft.outline.evidenceLinks.filter(item => compactLength(item) >= 8).length;
    return scoreChecks(mode, [
      { label: "分论点成组", passed: subpoints.length >= 2 && subpoints.length <= 3 && uniqueSubpoints === subpoints.length, detail: "形成2—3个互不重复、共同支撑总论点的角度。" },
      { label: "来源优先级可追溯", passed: subpoints.every((_, index) => Boolean(draft.outline.sources[index])), detail: "逐条注明来自题干、题干所在材料或全篇材料。" },
      { label: "论据逐条挂接", passed: linkedEvidenceCount >= subpoints.length, detail: "每个分论点都挂接一条事实、要素或事例。" }
    ], "先形成2—3个互不重复的分论点，再逐条标明来源并挂接材料证据。");
  }

  if (mode === "paragraph") {
    const paragraph = `${draft.paragraph.claim}${draft.paragraph.analysis}${draft.paragraph.caseText}${draft.paragraph.commentary}${draft.paragraph.returnToClaim}`;
    const paragraphLength = compactLength(paragraph);
    return scoreChecks(mode, [
      { label: "分论点明确", passed: compactLength(draft.paragraph.claim) >= 8, detail: "段首直接亮出本段要证明的观点。" },
      { label: "篇幅适中", passed: paragraphLength >= 180 && paragraphLength <= 360, detail: `当前 ${paragraphLength} 字，建议单段控制在220—300字附近。` },
      { label: "分析与事例齐全", passed: compactLength(draft.paragraph.analysis) >= 35 && compactLength(draft.paragraph.caseText) >= 35, detail: "先解释为什么，再写主体—做法—结果完整的事例。" },
      { label: "评论并回扣", passed: compactLength(draft.paragraph.commentary) >= 20 && compactLength(draft.paragraph.returnToClaim) >= 12, detail: "事例后解释证明关系，最后回到本段分论点。" }
    ], "按‘分论点—分析—事例—评论—回扣’补全本段，不要只堆案例。");
  }

  if (mode === "evidence") {
    const evidence = draft.evidence;
    return scoreChecks(mode, [
      { label: "案例信息完整", passed: compactLength(evidence.caseText) >= 30, detail: "交代主体、做法和结果。" },
      { label: "抽象出机制", passed: compactLength(evidence.mechanism) >= 18, detail: "把个案背后的因果关系提炼成可迁移表达。" },
      { label: "绑定分论点", passed: compactLength(evidence.target) >= 8, detail: "明确这条素材服务于哪个分论点。" }
    ], "先补全主体—做法—结果，再写出可迁移机制并绑定分论点。");
  }

  return scoreChecks(mode, [
    { label: "回扣总论点", passed: compactLength(draft.closing.thesisReturn) >= 18, detail: "明确回到全文总论点，不另起新话题。" },
    { label: "照应分论点", passed: compactLength(draft.closing.subpointEcho) >= 22, detail: "压缩复现各分论点的共同方向。" },
    { label: "展望完成收束", passed: compactLength(draft.closing.outlook) >= 18, detail: "用展望、号召或愿景升华，但不要空喊。" }
  ], "按‘总论点回扣—分论点照应—展望收束’补齐结尾。");
}
