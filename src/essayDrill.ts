import type { EssayDrillDraft, EssayDrillMode } from "./essayDrillStore";

export interface EssayDrillCheck { label: string; passed: boolean; detail: string }
export interface EssayDrillFeedback {
  mode: EssayDrillMode;
  passed: boolean;
  scoreLabel: string;
  checks: EssayDrillCheck[];
  nextStep: string;
  review: string;
}

export interface EssayDrillOverallFeedback {
  passed: boolean;
  scoreLabel: string;
  summary: string;
  strengths: string[];
  priorities: string[];
  stages: Array<{ mode: EssayDrillMode; label: string; feedback: EssayDrillFeedback }>;
}

const MODE_LABELS: Record<EssayDrillMode, string> = {
  theme: "审题立意",
  outline: "分论点",
  paragraph: "主体论证",
  evidence: "素材转化",
  closing: "结尾收束"
};

export function compactLength(value: string): number {
  return value.replace(/\s/g, "").length;
}

function scoreChecks(mode: EssayDrillMode, checks: EssayDrillCheck[], nextStep: string, review?: string): EssayDrillFeedback {
  const passedCount = checks.filter(item => item.passed).length;
  const passed = passedCount === checks.length;
  const missed = checks.filter(item => !item.passed);
  const computedReview = missed.length
    ? `本步主要问题：${missed.map(item => item.label).join("、")}。优先修改：${missed[0].detail}`
    : "本步核心动作已完成，表达可以继续压缩得更准确，但无需再拆成更多小项。";
  return {
    mode,
    passed,
    scoreLabel: `${passedCount}/${checks.length} 项达标`,
    checks,
    nextStep,
    review: review ?? computedReview
  };
}

export function evaluateEssayDrill(mode: EssayDrillMode, draft: EssayDrillDraft): EssayDrillFeedback {
  if (mode === "theme") {
    if (compactLength(draft.theme.quickTitle) > 0 || compactLength(draft.theme.quickText) > 0) {
      const titleLength = compactLength(draft.theme.quickTitle);
      const length = compactLength(draft.theme.quickText);
      const title = draft.theme.quickTitle.trim();
      const thesis = draft.theme.quickText.trim();
      const titleOverlap = title && thesis ? [...new Set(title.split("") as string[])].filter(char => thesis.includes(char)).length : 0;
      return scoreChecks(mode, [
        { label: "文章标题明确", passed: titleLength >= 4 && titleLength <= 30 && /[\u4e00-\u9fff]/u.test(title), detail: titleLength ? `当前标题 ${titleLength} 字；保留题干主题词，避免只写口号。` : "还没有填写文章标题；标题应由你自拟并回应题干主题。" },
        { label: "标题与立意相互呼应", passed: titleOverlap >= 2, detail: titleOverlap >= 2 ? "标题中的核心词已在立意中得到回应。" : "标题和立意的关键词联系偏弱，建议保留同一组核心概念。" },
        { label: "一句话立意完成", passed: length >= 18 && length <= 100 && /(以|通过|需要|必须|才能|推动|实现|让|既|也)/u.test(thesis), detail: `当前 ${length} 字；写清题干主题词、核心关系和发展方向即可。` }
      ], "先补上自拟文章标题，再用一句话写清‘题干主题词 + 核心判断 + 发展方向’，不用展开成完整开头。", `标题“${title || "未填写"}”与立意${titleOverlap >= 2 ? "已经形成呼应" : "还没有形成稳定呼应"}；立意${length >= 18 ? "具备基本判断" : "偏短，论断不够完整"}。下一步写分论点时，应继续沿用这组核心概念。`);
    }
    const keywords = draft.theme.keywords.split(/[，,、\s]+/).map(item => item.trim()).filter(Boolean);
    return scoreChecks(mode, [
      { label: "题干关键词明确", passed: keywords.length >= 1 && keywords.length <= 4, detail: "从题干抄准1—4个核心词，不先用自己的近义词替换。" },
      { label: "主题类型已判断", passed: Boolean(draft.theme.themeType), detail: "先判断单主题、双主题或多主题，再决定主题关系。" },
      { label: "标题回应主题", passed: compactLength(draft.theme.title) >= 6 && keywords.some(keyword => draft.theme.title.includes(keyword)), detail: "标题保留题干核心词，可加对策或影响。" },
      { label: "总论点完成改写", passed: compactLength(draft.theme.thesis) >= 18 && keywords.some(keyword => draft.theme.thesis.includes(keyword)), detail: "把标题改写为完整判断句，说明靠什么或带来什么。" }
    ], "先抄准题干关键词并判断主题类型，再用关键词完成标题和总论点。");
  }

  if (mode === "outline") {
    if (compactLength(draft.outline.quickText) > 0) {
      const subpoints = draft.outline.quickText.split(/[\n；;。]+/).map(item => item.trim()).filter(Boolean);
      const uniqueSubpoints = new Set(subpoints.map(item => item.replace(/[，、\s]/g, "").slice(0, 20))).size;
      const actionable = subpoints.filter(item => /(以|通过|推动|提升|破解|巩固|完善|强化|促进|让|把)/u.test(item)).length;
      return scoreChecks(mode, [
        { label: "2—3个分论点成组", passed: subpoints.length >= 2 && subpoints.length <= 3, detail: `当前识别到 ${subpoints.length} 条；建议保持2—3条。` },
        { label: "观点彼此区分", passed: uniqueSubpoints === subpoints.length && subpoints.every(item => compactLength(item) >= 6), detail: "每条都应是不同角度的观点句，避免同义重复。" },
        { label: "分论点具有行动方向", passed: actionable === subpoints.length, detail: "分论点最好包含破解、推动、完善、巩固等明确方向，而不是只有抽象名词。" }
      ], "用换行补出2—3个分论点，每条只写一句，并检查角度区分和行动方向。", `目前形成${subpoints.length}条分论点，${uniqueSubpoints === subpoints.length ? "没有明显重复" : "存在同义或角度重叠"}；${actionable === subpoints.length ? "每条都有明确行动方向" : "部分分论点仍停留在名词层面"}。下一步应让三条分论点分别承担不同论证任务。`);
    }
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
    if (compactLength(draft.paragraph.quickText) > 0) {
      const paragraphLength = compactLength(draft.paragraph.quickText);
      const paragraphText = draft.paragraph.quickText;
      const hasCase = /(例如|比如|某地|某村|某市|实践|材料|案例|工作人员|干部)/u.test(paragraphText);
      const hasReasoning = /(因为|只有|必须|才能|由于|因此|这说明|由此|可见|意味着)/u.test(paragraphText);
      return scoreChecks(mode, [
        { label: "主体段长度合适", passed: paragraphLength >= 80 && paragraphLength <= 220, detail: `当前 ${paragraphLength} 字；短练建议控制在80—220字。` },
        { label: "分析与因果关系清楚", passed: hasReasoning, detail: "需要说明为什么成立、如何产生结果，不能只罗列观点。" },
        { label: "材料或事例落地", passed: hasCase, detail: "至少落到一个主体、做法或结果，避免空泛议论。" },
        { label: "结论回扣分论点", passed: /(因此|由此|这说明|可见|才能|从而)/u.test(paragraphText), detail: "事例后补一句‘这说明什么’，把材料重新扣回分论点。" }
      ], "任选一个分论点，用80—220字写出‘观点—分析—例子—回扣’的简版论证。", `主体段目前${paragraphLength}字，${hasCase ? "已经有材料落点" : "还缺少具体事例"}，${hasReasoning ? "有基本因果分析" : "分析说理不足"}。最需要补的是“事例为什么能证明观点”的评论句。`);
    }
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
    if (compactLength(evidence.quickText) > 0) {
      const evidenceLength = compactLength(evidence.quickText);
      const evidenceText = evidence.quickText;
      return scoreChecks(mode, [
        { label: "素材信息完整", passed: evidenceLength >= 30 && evidenceLength <= 140, detail: `当前 ${evidenceLength} 字；交代主体、做法和结果即可。` },
        { label: "抽象出因果机制", passed: /(说明|体现|通过|从而|因此|机制|把|将)/u.test(evidenceText), detail: "不能停留在复述案例，要说清它为什么有效。" },
        { label: "明确服务观点", passed: /(观点|证明|支撑|用于|说明)/u.test(evidenceText), detail: "最后点明这条素材要证明哪个分论点。" }
      ], "把一条材料压缩成‘事实 → 背后机制 → 服务的观点’，控制在30—140字。", `这条素材${evidenceLength >= 30 ? "信息量够用" : "信息偏少"}，${/(说明|体现|通过|从而|因此|机制|把|将)/u.test(evidenceText) ? "已经出现机制提炼" : "仍主要是案例复述"}；下一步要把它嵌入对应分论点，而不是孤立堆砌。`);
    }
    return scoreChecks(mode, [
      { label: "案例信息完整", passed: compactLength(evidence.caseText) >= 30, detail: "交代主体、做法和结果。" },
      { label: "抽象出机制", passed: compactLength(evidence.mechanism) >= 18, detail: "把个案背后的因果关系提炼成可迁移表达。" },
      { label: "绑定分论点", passed: compactLength(evidence.target) >= 8, detail: "明确这条素材服务于哪个分论点。" }
    ], "先补全主体—做法—结果，再写出可迁移机制并绑定分论点。");
  }

  if (compactLength(draft.closing.quickText) > 0) {
    const closingLength = compactLength(draft.closing.quickText);
    const closingText = draft.closing.quickText;
      return scoreChecks(mode, [
      { label: "结尾长度合适", passed: closingLength >= 30 && closingLength <= 120, detail: `当前 ${closingLength} 字；短练建议控制在30—120字。` },
      { label: "回扣文章主题", passed: /(智慧|勇气|脱贫|发展|乡村|文化|治理|创新|人民)/u.test(closingText), detail: "结尾应回到全文的核心主题，而不是突然引入新话题。" },
      { label: "完成展望或行动收束", passed: /(要|应|必须|继续|推动|建设|实现|让|才能|唯有)/u.test(closingText), detail: "用展望、行动或愿景收束，避免只重复前文。" }
    ], "用30—120字回扣中心论点并完成展望，不再拆成三个小空。", `结尾目前${closingLength}字，${/(智慧|勇气|脱贫|发展|乡村|文化|治理|创新|人民)/u.test(closingText) ? "能够回扣主题" : "主题回扣不够明显"}，${/(要|应|必须|继续|推动|建设|实现|让|才能|唯有)/u.test(closingText) ? "有行动或愿景方向" : "还缺少向前收束的力量"}。`);
  }

  return scoreChecks(mode, [
    { label: "回扣总论点", passed: compactLength(draft.closing.thesisReturn) >= 18, detail: "明确回到全文总论点，不另起新话题。" },
    { label: "照应分论点", passed: compactLength(draft.closing.subpointEcho) >= 22, detail: "压缩复现各分论点的共同方向。" },
    { label: "展望完成收束", passed: compactLength(draft.closing.outlook) >= 18, detail: "用展望、号召或愿景升华，但不要空喊。" }
  ], "按‘总论点回扣—分论点照应—展望收束’补齐结尾。");
}

export function evaluateEssayDrillOverall(draft: EssayDrillDraft): EssayDrillOverallFeedback {
  const modes: EssayDrillMode[] = ["theme", "outline", "paragraph", "evidence", "closing"];
  const stages = modes.map(mode => ({ mode, label: MODE_LABELS[mode], feedback: evaluateEssayDrill(mode, draft) }));
  const passedStages = stages.filter(stage => stage.feedback.passed).length;
  const strengths = stages.flatMap(stage => stage.feedback.checks.filter(check => check.passed).map(check => `${stage.label}：${check.detail}`)).slice(0, 8);
  const priorities = stages.map(stage => `${stage.label}：${stage.feedback.passed ? `下一步优化——${stage.feedback.nextStep}` : stage.feedback.review}`);
  const score = Math.round((passedStages / stages.length) * 100);
  return {
    passed: passedStages === stages.length,
    scoreLabel: `${passedStages}/5 步达标 · 综合完成度 ${score}/100`,
    summary: passedStages === stages.length
      ? "五步内容已经形成从立意、分论点到论证、素材和结尾的完整写作骨架，可以进入整篇作答。"
      : `已完成 ${passedStages}/5 个步骤。整体骨架${passedStages >= 3 ? "基本成形" : "尚未成形"}，应先处理下方优先修改项。`,
    strengths: strengths.length ? strengths : ["暂未发现完整达标的步骤，建议先补齐五步核心输入。"],
    priorities,
    stages
  };
}
