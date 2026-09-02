import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, ClipboardList, FileText, Lightbulb, RotateCcw, Sparkles } from "lucide-react";
import { compactLength, evaluateEssayDrill, type EssayDrillFeedback } from "./essayDrill";
import { gradeEssayDrill, type EssayDrillProfessionalReview } from "./grading/essay";
import {
  createEssayDrillDraft,
  loadEssayDrillDraft,
  saveEssayDrillDraft,
  type EssayDrillDraft,
  type EssayDrillMode
} from "./essayDrillStore";
import type { Question } from "./types";

const MODE_META: Record<EssayDrillMode, { label: string; duration: string; hint: string; rule: string }> = {
  theme: { label: "审题立意", duration: "1—2 分钟", hint: "只写一句话立意", rule: "YD-THEME-01 · YD-THESIS-02" },
  outline: { label: "分论点", duration: "2—3 分钟", hint: "只列2—3个分论点", rule: "YD-SUBPOINT-03 · YD-STRUCTURE-04" },
  paragraph: { label: "主体论证", duration: "3—5 分钟", hint: "任选一段写简版论证", rule: "YD-ARGUMENT-06" },
  evidence: { label: "素材转化", duration: "2—3 分钟", hint: "把一条材料压缩成可用论据", rule: "YD-EVIDENCE-07" },
  closing: { label: "结尾收束", duration: "1—2 分钟", hint: "用几句话完成结尾", rule: "YD-CLOSING-08" }
};

function FeedbackCard({ feedback }: { feedback: EssayDrillFeedback }) {
  return <section className={`essay-drill-feedback ${feedback.passed ? "is-passed" : "is-needing-work"}`}>
    <header><div><span>本步快速检查</span><strong>{feedback.scoreLabel}</strong></div><span>{feedback.passed ? "可以进入下一步" : "建议修改后再练"}</span></header>
    <div className="essay-drill-review"><strong>结构提示</strong><p>{feedback.review}</p></div>
    <div className="essay-check-list">{feedback.checks.map(check => <div className={check.passed ? "passed" : "missed"} key={check.label}><span className="essay-check-icon">{check.passed ? <Check size={13}/> : "·"}</span><span><strong>{check.label}</strong><small>{check.detail}</small></span></div>)}</div>
    <p className="essay-next-step"><Lightbulb size={14}/>{feedback.nextStep}</p>
  </section>;
}

const OVERALL_LABEL = { ready: "骨架成熟，可进入整篇", revise: "主线基本形成，需要修改", incomplete: "内容不完整，暂不建议组篇" } as const;
const STEP_STATUS_LABEL = { strong: "较成熟", developing: "需修改", missing: "未作答" } as const;

function OverallFeedbackCard({ feedback }: { feedback: EssayDrillProfessionalReview }) {
  return <section className={`essay-drill-overall-feedback is-${feedback.overallLevel}`}>
    <header><div><span>袁东课程方法·五步整体批改</span><strong>{OVERALL_LABEL[feedback.overallLevel]}</strong></div><span>{feedback.providerKind === "remote" ? "AI语义诊断" : "本地结构诊断"}</span></header>
    <p className="essay-overall-summary">{feedback.summary}</p>
    <div className="essay-overall-coherence"><strong>主线一致性</strong><p>{feedback.coherence.finding}</p>{feedback.coherence.breakpoints.length > 0 && <ul>{feedback.coherence.breakpoints.map(item => <li key={item}>{item}</li>)}</ul>}<p><b>总修改方向：</b>{feedback.coherence.action}</p></div>
    <div className="essay-overall-priorities"><strong>优先修改顺序</strong><ol>{feedback.priorityActions.map(item => <li key={item}>{item}</li>)}</ol></div>
    <div className="essay-professional-step-list">{feedback.stepReviews.map(step => <article key={step.id} className={`status-${step.status}`}>
      <header><div><b>{step.label}</b><span>{STEP_STATUS_LABEL[step.status]}</span></div><small>{step.courseRuleIds.join(" · ")}</small></header>
      <div className="essay-step-review-grid">
        <section><strong>批改判断</strong><p>{step.finding}</p></section>
        <section><strong>你的原文</strong><p>{step.answerEvidence}</p></section>
        <section><strong>最优先修改</strong><p>{step.action}</p></section>
        <section><strong>修改示例</strong><p>{step.rewriteExample}</p></section>
      </div>
    </article>)}</div>
    <div className="essay-assembly-plan"><strong>组装为整篇文章</strong><ol>{feedback.assemblyPlan.map(item => <li key={item}>{item}</li>)}</ol></div>
    {feedback.warnings.length > 0 && <div className="essay-overall-warnings">{feedback.warnings.map(item => <p key={item}>{item}</p>)}</div>}
  </section>;
}

export default function EssayDrillPanel({ question, onOpenFullAnswer }: { question: Question; onOpenFullAnswer: () => void }) {
  const [draft, setDraft] = useState<EssayDrillDraft>(createEssayDrillDraft);
  const [loaded, setLoaded] = useState(false);
  const [feedback, setFeedback] = useState<EssayDrillFeedback | null>(null);
  const [overallFeedback, setOverallFeedback] = useState<EssayDrillProfessionalReview | null>(null);
  const [overallSubmitting, setOverallSubmitting] = useState(false);
  const [overallError, setOverallError] = useState<string | null>(null);
  const draftContentKey = [draft.theme.quickTitle, draft.theme.quickText, draft.outline.quickText, draft.paragraph.quickText, draft.evidence.quickText, draft.closing.quickText].join("\u0000");

  useEffect(() => {
    setLoaded(false);
    setDraft(loadEssayDrillDraft(question.id));
    setFeedback(null);
    setOverallFeedback(null);
    setOverallError(null);
    setLoaded(true);
  }, [question.id]);

  useEffect(() => {
    setFeedback(null);
    setOverallFeedback(null);
    setOverallError(null);
  }, [draftContentKey]);

  useEffect(() => {
    if (!loaded) return;
    const timer = window.setTimeout(() => saveEssayDrillDraft(question.id, draft), 220);
    return () => {
      window.clearTimeout(timer);
      saveEssayDrillDraft(question.id, draft);
    };
  }, [draft, loaded, question.id]);

  const activeMeta = MODE_META[draft.mode];
  const paragraphChars = compactLength(draft.paragraph.quickText || Object.values(draft.paragraph).join(""));

  function selectMode(mode: EssayDrillMode) {
    setDraft(current => ({ ...current, mode }));
    setFeedback(null);
  }

  function resetCurrent() {
    const blank = createEssayDrillDraft();
    setDraft(current => ({ ...current, [current.mode]: blank[current.mode] }));
    setFeedback(null);
  }

  async function submitOverallReview() {
    setOverallSubmitting(true);
    setOverallError(null);
    try {
      setOverallFeedback(await gradeEssayDrill({ question, draft }));
    } catch (error) {
      setOverallFeedback(null);
      setOverallError(error instanceof Error ? error.message : "五步整体批改失败，请稍后重试。");
    } finally {
      setOverallSubmitting(false);
    }
  }

  const modeBody = useMemo(() => {
    if (draft.mode === "theme") return <div className="essay-drill-fields">
      <div className="essay-question-anchor"><span>本题题干</span><p>{question.prompt}</p></div>
      <label><span>自拟文章标题 <em>不是题干标题，由你为整篇作文拟定</em></span><input value={draft.theme.quickTitle} onChange={event => setDraft(current => ({ ...current, theme: { ...current.theme, quickTitle: event.target.value } }))} placeholder="例如：以智慧与勇气开创发展新局"/></label>
      <label><span>一句话立意 <em>题干主题词 + 你的核心判断</em></span><textarea className="essay-compact-textarea" rows={4} value={draft.theme.quickText} onChange={event => setDraft(current => ({ ...current, theme: { ...current.theme, quickText: event.target.value } }))} placeholder="例如：以智慧与勇气推动脱贫成果巩固和乡村振兴"/></label>
    </div>;

    if (draft.mode === "outline") return <div className="essay-drill-fields">
      <div className="essay-structure-hint"><span>寻找顺序</span><strong>题干 → 材料 → 观点</strong></div>
      <label><span>2—3个分论点 <em>用换行分隔，每条一句</em></span><textarea className="essay-compact-textarea" rows={7} value={draft.outline.quickText} onChange={event => setDraft(current => ({ ...current, outline: { ...current.outline, quickText: event.target.value } }))} placeholder="1. 以智慧破解发展难题\n2. 以勇气迎难而上\n3. 建立长效机制巩固成果"/></label>
    </div>;

    if (draft.mode === "paragraph") return <div className="essay-drill-fields">
      <div className="essay-structure-hint"><span>简版论证链</span><strong>观点 → 分析 → 例子 → 回扣</strong></div>
      <label><span>任选一个主体段 <em>建议80—220字，一段写完</em></span><textarea className="essay-compact-textarea essay-long-textarea" rows={10} value={draft.paragraph.quickText} onChange={event => setDraft(current => ({ ...current, paragraph: { ...current.paragraph, quickText: event.target.value } }))} placeholder="以智慧破解发展难题。贫困地区条件各异，必须因地制宜……例如……由此可见……"/></label>
      <div className="essay-drill-count">本段 {paragraphChars} 字 · 短练只要求一段</div>
    </div>;

    if (draft.mode === "evidence") return <div className="essay-drill-fields">
      <label><span>一条素材转化 <em>事实 → 机制 → 服务的观点</em></span><textarea className="essay-compact-textarea" rows={8} value={draft.evidence.quickText} onChange={event => setDraft(current => ({ ...current, evidence: { ...current.evidence, quickText: event.target.value } }))} placeholder="某地……取得……；这说明……机制能够……，可用于证明……观点。"/></label>
    </div>;

    return <div className="essay-drill-fields">
      <div className="essay-structure-hint"><span>结尾任务</span><strong>回扣中心 → 简短展望</strong></div>
      <label><span>一句话结尾 <em>30—120字即可</em></span><textarea className="essay-compact-textarea" rows={5} value={draft.closing.quickText} onChange={event => setDraft(current => ({ ...current, closing: { ...current.closing, quickText: event.target.value } }))} placeholder="回扣总论点，并用展望、号召或愿景完成收束。"/></label>
    </div>;
  }, [draft, paragraphChars, question.prompt]);

  return <section className="essay-drill-panel">
    <div className="essay-drill-question-title"><span>当前短练题目</span><strong>{question.title}</strong><small>{question.type} · {question.score} 分 · ≤ {question.wordLimit} 字</small></div>
    <header className="essay-drill-header"><div><div className="essay-drill-kicker"><ClipboardList size={15}/>大作文独立训练</div><h3>五步短练，每步只做一个动作</h3><p>{activeMeta.hint}，单次控制在 {activeMeta.duration}；想完整写作可直接进入整篇作答。</p></div><button className="essay-full-answer-link" onClick={onOpenFullAnswer}><FileText size={15}/>进入整篇作答 <ArrowRight size={14}/></button></header>
    <nav className="essay-drill-tabs" aria-label="大作文课程训练步骤">{(Object.keys(MODE_META) as EssayDrillMode[]).map((mode, index) => <button key={mode} className={draft.mode === mode ? "active" : ""} onClick={() => selectMode(mode)}><span>{index + 1}. {MODE_META[mode].label}</span><small>{MODE_META[mode].duration}</small></button>)}</nav>
    <div className="essay-drill-layout"><div className="essay-drill-main">{modeBody}<div className="essay-drill-actions"><button className="secondary" onClick={resetCurrent}><RotateCcw size={14}/>清空本环节</button><button className="primary" onClick={() => setFeedback(evaluateEssayDrill(draft.mode, draft))}><Sparkles size={15}/>检查本步</button><button className="essay-overall-button" disabled={overallSubmitting || !loaded} onClick={submitOverallReview}><Sparkles size={15}/>{overallSubmitting ? "五步批改中…" : "提交五步专业批改"}</button></div>{feedback && <FeedbackCard feedback={feedback}/>} {overallError && <div className="essay-overall-error">{overallError}</div>} {overallFeedback && <OverallFeedbackCard feedback={overallFeedback}/>}<div className="essay-drill-save"><span>草稿自动保存在本机</span><span>专业批改依据课程方法，不计入整篇考试分数</span></div></div></div>
  </section>;
}
