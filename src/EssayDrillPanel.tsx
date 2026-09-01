import { useEffect, useMemo, useState } from "react";
import { ArrowRight, BookOpenCheck, Check, ClipboardList, FileText, Lightbulb, RotateCcw, Sparkles } from "lucide-react";
import { compactLength, evaluateEssayDrill, type EssayDrillFeedback } from "./essayDrill";
import {
  createEssayDrillDraft,
  loadEssayDrillDraft,
  saveEssayDrillDraft,
  type EssayDrillDraft,
  type EssayDrillMode,
  type EssaySubpointSource
} from "./essayDrillStore";
import type { Question } from "./types";

const MODE_META: Record<EssayDrillMode, { label: string; duration: string; hint: string; rule: string }> = {
  theme: { label: "审题立意", duration: "5—8 分钟", hint: "题干关键词先行，判断单/双/多主题", rule: "YD-THEME-01 · YD-THESIS-02" },
  outline: { label: "分论点", duration: "8—12 分钟", hint: "按题干—所在材料—全篇材料确定分论点", rule: "YD-SUBPOINT-03 · YD-STRUCTURE-04" },
  paragraph: { label: "主体论证", duration: "18—22 分钟", hint: "练完整的分析—事例—评论—回扣", rule: "YD-ARGUMENT-06" },
  evidence: { label: "素材转化", duration: "8—10 分钟", hint: "把案例提炼成可迁移机制并绑定观点", rule: "YD-EVIDENCE-07" },
  closing: { label: "结尾收束", duration: "5—8 分钟", hint: "回扣总分论点，再完成展望", rule: "YD-CLOSING-08" }
};

const SOURCE_LABELS: Record<EssaySubpointSource, string> = {
  prompt: "题干",
  "prompt-material": "题干所在材料",
  "full-material": "全篇材料 / 客观小题"
};

function FeedbackCard({ feedback }: { feedback: EssayDrillFeedback }) {
  return <section className={`essay-drill-feedback ${feedback.passed ? "is-passed" : "is-needing-work"}`}>
    <header><div><span>课程规则检查</span><strong>{feedback.scoreLabel}</strong></div><span>{feedback.passed ? "可以进入下一步" : "先修本环节"}</span></header>
    <div className="essay-check-list">{feedback.checks.map(check => <div className={check.passed ? "passed" : "missed"} key={check.label}><span className="essay-check-icon">{check.passed ? <Check size={13}/> : "·"}</span><span><strong>{check.label}</strong><small>{check.detail}</small></span></div>)}</div>
    <p className="essay-next-step"><Lightbulb size={14}/>{feedback.nextStep}</p>
  </section>;
}

export default function EssayDrillPanel({ question, onOpenFullAnswer }: { question: Question; onOpenFullAnswer: () => void }) {
  const [draft, setDraft] = useState<EssayDrillDraft>(createEssayDrillDraft);
  const [loaded, setLoaded] = useState(false);
  const [feedback, setFeedback] = useState<EssayDrillFeedback | null>(null);

  useEffect(() => {
    setLoaded(false);
    setDraft(loadEssayDrillDraft(question.id));
    setFeedback(null);
    setLoaded(true);
  }, [question.id]);

  useEffect(() => {
    if (!loaded) return;
    const timer = window.setTimeout(() => saveEssayDrillDraft(question.id, draft), 220);
    return () => window.clearTimeout(timer);
  }, [draft, loaded, question.id]);

  const activeMeta = MODE_META[draft.mode];
  const paragraphChars = compactLength(Object.values(draft.paragraph).join(""));

  function selectMode(mode: EssayDrillMode) {
    setDraft(current => ({ ...current, mode }));
    setFeedback(null);
  }

  function resetCurrent() {
    const blank = createEssayDrillDraft();
    setDraft(current => ({ ...current, [current.mode]: blank[current.mode] }));
    setFeedback(null);
  }

  function updateSubpoint(index: number, field: "subpoints" | "sources" | "evidenceLinks", value: string) {
    setDraft(current => ({
      ...current,
      outline: {
        ...current.outline,
        [field]: current.outline[field].map((item, itemIndex) => itemIndex === index ? value : item)
      }
    } as EssayDrillDraft));
  }

  const modeBody = useMemo(() => {
    if (draft.mode === "theme") return <div className="essay-drill-fields">
      <div className="essay-question-anchor"><span>本题题干</span><p>{question.prompt}</p></div>
      <label><span>题干关键词 <em>用逗号分隔，照抄核心概念</em></span><input value={draft.theme.keywords} onChange={event => setDraft(current => ({ ...current, theme: { ...current.theme, keywords: event.target.value } }))} placeholder="例如：文化传承，创新发展"/></label>
      <label><span>主题类型</span><select value={draft.theme.themeType} onChange={event => setDraft(current => ({ ...current, theme: { ...current.theme, themeType: event.target.value as EssayDrillDraft["theme"]["themeType"] } }))}><option value="">请选择</option><option value="single">单主题</option><option value="double">双主题</option><option value="multi">多主题</option></select></label>
      <label><span>拟定标题 <em>关键词 + 对策 / 影响</em></span><input value={draft.theme.title} onChange={event => setDraft(current => ({ ...current, theme: { ...current.theme, title: event.target.value } }))} placeholder="标题保留题干核心词"/></label>
      <label><span>总论点 <em>将标题改写成完整判断句</em></span><textarea rows={4} value={draft.theme.thesis} onChange={event => setDraft(current => ({ ...current, theme: { ...current.theme, thesis: event.target.value } }))} placeholder="以……推动……，让……转化为……"/></label>
    </div>;

    if (draft.mode === "outline") return <div className="essay-drill-fields">
      <div className="essay-structure-hint"><span>寻找顺序</span><strong>题干 → 题干所在材料 → 全篇材料 / 客观小题</strong></div>
      <div className="essay-subpoint-cards">{draft.outline.subpoints.map((claim, index) => <article key={index}>
        <header><b>分论点 {index + 1}</b><select value={draft.outline.sources[index]} onChange={event => updateSubpoint(index, "sources", event.target.value)}>{Object.entries(SOURCE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></header>
        <input value={claim} onChange={event => updateSubpoint(index, "subpoints", event.target.value)} placeholder="观点句：总论点主题词 + 对策 / 影响"/>
        <textarea rows={3} value={draft.outline.evidenceLinks[index]} onChange={event => updateSubpoint(index, "evidenceLinks", event.target.value)} placeholder="材料挂接：哪一事实、要素或事例能支撑它？"/>
      </article>)}</div>
    </div>;

    if (draft.mode === "paragraph") return <div className="essay-drill-fields">
      <div className="essay-structure-hint"><span>完整论证链</span><strong>分论点 → 分析 → 事例 → 评论 → 回扣</strong></div>
      <label><span>1. 分论点句</span><input value={draft.paragraph.claim} onChange={event => setDraft(current => ({ ...current, paragraph: { ...current.paragraph, claim: event.target.value } }))} placeholder="本段要证明什么"/></label>
      <label><span>2. 分析说理</span><textarea rows={4} value={draft.paragraph.analysis} onChange={event => setDraft(current => ({ ...current, paragraph: { ...current.paragraph, analysis: event.target.value } }))} placeholder="背景、问题、原因、对策或影响：为什么成立？"/></label>
      <label><span>3. 具体事例 <em>主体 + 做法 + 结果</em></span><textarea rows={4} value={draft.paragraph.caseText} onChange={event => setDraft(current => ({ ...current, paragraph: { ...current.paragraph, caseText: event.target.value } }))} placeholder="写完整事实，不只写一个地名或人物名"/></label>
      <label><span>4. 事例评论</span><textarea rows={3} value={draft.paragraph.commentary} onChange={event => setDraft(current => ({ ...current, paragraph: { ...current.paragraph, commentary: event.target.value } }))} placeholder="这个事例为什么能证明本段观点？"/></label>
      <label><span>5. 回扣分论点</span><input value={draft.paragraph.returnToClaim} onChange={event => setDraft(current => ({ ...current, paragraph: { ...current.paragraph, returnToClaim: event.target.value } }))} placeholder="因此 / 由此可见……"/></label>
      <div className="essay-drill-count">本段 {paragraphChars} 字 · 建议220—300字</div>
    </div>;

    if (draft.mode === "evidence") return <div className="essay-drill-fields">
      <label><span>要服务的分论点</span><input value={draft.evidence.target} onChange={event => setDraft(current => ({ ...current, evidence: { ...current.evidence, target: event.target.value } }))} placeholder="这条素材证明哪个观点"/></label>
      <label><span>案例原貌 <em>主体 + 做法 + 结果</em></span><textarea rows={6} value={draft.evidence.caseText} onChange={event => setDraft(current => ({ ...current, evidence: { ...current.evidence, caseText: event.target.value } }))} placeholder="把材料中的一个案例讲完整"/></label>
      <label><span>抽象机制</span><textarea rows={4} value={draft.evidence.mechanism} onChange={event => setDraft(current => ({ ...current, evidence: { ...current.evidence, mechanism: event.target.value } }))} placeholder="从个案上提到可迁移的因果机制"/></label>
    </div>;

    return <div className="essay-drill-fields">
      <div className="essay-structure-hint"><span>结尾任务</span><strong>回扣总论点 → 照应分论点 → 展望 / 号召</strong></div>
      <label><span>回扣总论点</span><textarea rows={3} value={draft.closing.thesisReturn} onChange={event => setDraft(current => ({ ...current, closing: { ...current.closing, thesisReturn: event.target.value } }))} placeholder="换一种表达回到全文中心判断"/></label>
      <label><span>照应分论点</span><textarea rows={3} value={draft.closing.subpointEcho} onChange={event => setDraft(current => ({ ...current, closing: { ...current.closing, subpointEcho: event.target.value } }))} placeholder="压缩复现主体段的共同方向"/></label>
      <label><span>展望 / 号召 / 愿景</span><textarea rows={3} value={draft.closing.outlook} onChange={event => setDraft(current => ({ ...current, closing: { ...current.closing, outlook: event.target.value } }))} placeholder="完成收束，不增加新的分论点"/></label>
    </div>;
  }, [draft, paragraphChars, question.prompt]);

  return <section className="essay-drill-panel">
    <header className="essay-drill-header"><div><div className="essay-drill-kicker"><ClipboardList size={15}/>大作文独立训练</div><h3>按课程方法，从审题走到收束</h3><p>{activeMeta.hint}，单次控制在 {activeMeta.duration}。</p></div><button className="essay-full-answer-link" onClick={onOpenFullAnswer}><FileText size={15}/>进入整篇作答 <ArrowRight size={14}/></button></header>
    <nav className="essay-drill-tabs" aria-label="大作文课程训练步骤">{(Object.keys(MODE_META) as EssayDrillMode[]).map((mode, index) => <button key={mode} className={draft.mode === mode ? "active" : ""} onClick={() => selectMode(mode)}><span>{index + 1}. {MODE_META[mode].label}</span><small>{MODE_META[mode].duration}</small></button>)}</nav>
    <div className="essay-drill-layout"><div className="essay-drill-main">{modeBody}<div className="essay-drill-actions"><button className="secondary" onClick={resetCurrent}><RotateCcw size={14}/>清空本环节</button><button className="primary" onClick={() => setFeedback(evaluateEssayDrill(draft.mode, draft))}><Sparkles size={15}/>按课程规则检查</button></div>{feedback && <FeedbackCard feedback={feedback}/>}<div className="essay-drill-save"><span>草稿自动保存在本机</span><span>专项检查不计入整篇分数</span></div></div><aside className="essay-drill-aside"><div className="essay-drill-suggestion-empty"><BookOpenCheck size={17}/><span><b>本环节证据</b><br/>{activeMeta.rule}<br/>来源：《2027版大作文专项班》讲义与课程字幕。</span></div><div className="essay-drill-rule"><strong>方法边界</strong><span>课程规则用于训练诊断，不冒充官方评分细则；整篇作文将使用独立五维量表，不套用小题采点。</span></div></aside></div>
  </section>;
}
