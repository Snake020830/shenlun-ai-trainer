import { useEffect, useMemo, useState } from "react";
import { ArrowRight, BookOpenCheck, Check, ClipboardList, FileText, Lightbulb, RotateCcw, Sparkles } from "lucide-react";
import { evaluateEssayDrill, type EssayDrillFeedback } from "./essayDrill";
import { createEssayDrillDraft, loadEssayDrillDraft, saveEssayDrillDraft, type EssayDrillDraft, type EssayDrillMode } from "./essayDrillStore";
import type { MaterialDeepReadOutput } from "./materialLearning";
import type { Question } from "./types";

const MODE_META: Record<EssayDrillMode, { label: string; duration: string; hint: string }> = {
  outline: { label: "立意提纲", duration: "8—12 分钟", hint: "先把主题、中心论点和分论点摆清楚" },
  paragraph: { label: "单段论证", duration: "18—22 分钟", hint: "只练一段，把论据写出分析和回扣" },
  evidence: { label: "素材转论据", duration: "8—10 分钟", hint: "把一个案例变成可迁移的论证材料" }
};

function compactLength(value: string): number {
  return value.replace(/\s/g, "").length;
}

function FeedbackCard({ feedback }: { feedback: EssayDrillFeedback }) {
  return <section className={`essay-drill-feedback ${feedback.passed ? "is-passed" : "is-needing-work"}`}>
    <header><div><span>即时检查</span><strong>{feedback.scoreLabel}</strong></div><span>{feedback.passed ? "可以进入下一步" : "按提示补一处即可"}</span></header>
    <div className="essay-check-list">
      {feedback.checks.map(check => <div className={check.passed ? "passed" : "missed"} key={check.label}>
        <span className="essay-check-icon">{check.passed ? <Check size={13}/> : "·"}</span>
        <span><strong>{check.label}</strong><small>{check.detail}</small></span>
      </div>)}
    </div>
    <p className="essay-next-step"><Lightbulb size={14}/>{feedback.nextStep}</p>
  </section>;
}

function SuggestionShelf({ result, mode, onUseAngle, onUseCase }: {
  result: MaterialDeepReadOutput | null;
  mode: EssayDrillMode;
  onUseAngle: (value: string) => void;
  onUseCase: (value: string) => void;
}) {
  const angles = result?.essayAngles ?? [];
  const cases = result?.cases ?? [];
  if (!angles.length && !cases.length) return <div className="essay-drill-suggestion-empty"><BookOpenCheck size={17}/><span>完成一次“AI精读”后，这里会出现本题可迁移的观点和案例。没有素材也可以先独立练习。</span></div>;
  return <div className="essay-drill-suggestions">
    {mode !== "evidence" && angles.length > 0 && <div><header><span>可用分论点</span><small>点击带入</small></header><div className="essay-suggestion-list">{angles.slice(0, 4).map(item => <button key={item.claim} onClick={() => onUseAngle(item.claim)}><strong>{item.claim}</strong><small>{item.reasoning}</small></button>)}</div></div>}
    {mode !== "outline" && cases.length > 0 && <div><header><span>可用案例</span><small>点击带入</small></header><div className="essay-suggestion-list">{cases.slice(0, 3).map(item => <button key={item.title} onClick={() => onUseCase(`${item.title}：${item.summary}`)}><strong>{item.title}</strong><small>{item.summary}</small></button>)}</div></div>}
  </div>;
}

export default function EssayDrillPanel({ question, deepReadResult, onOpenFullAnswer }: {
  question: Question;
  deepReadResult: MaterialDeepReadOutput | null;
  onOpenFullAnswer: () => void;
}) {
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
  const outlineChars = compactLength(`${draft.outline.title}${draft.outline.thesis}${draft.outline.subpoints.join("")}${draft.outline.evidence}`);
  const paragraphChars = compactLength(draft.paragraph.text);
  const evidenceChars = compactLength(`${draft.evidence.caseText}${draft.evidence.mechanism}${draft.evidence.target}`);

  function selectMode(mode: EssayDrillMode) {
    setDraft(current => ({ ...current, mode }));
    setFeedback(null);
  }

  function checkCurrent() {
    setFeedback(evaluateEssayDrill(draft.mode, draft));
  }

  function resetCurrent() {
    setDraft(current => {
      if (current.mode === "outline") return { ...current, outline: createEssayDrillDraft().outline };
      if (current.mode === "paragraph") return { ...current, paragraph: createEssayDrillDraft().paragraph };
      return { ...current, evidence: createEssayDrillDraft().evidence };
    });
    setFeedback(null);
  }

  function useAngle(value: string) {
    if (draft.mode === "outline") {
      setDraft(current => ({ ...current, outline: { ...current.outline, subpoints: [value, ...current.outline.subpoints.filter(item => item !== value)].slice(0, 3) } }));
    } else {
      setDraft(current => ({ ...current, paragraph: { ...current.paragraph, claim: value } }));
    }
  }

  function useCase(value: string) {
    if (draft.mode === "evidence") setDraft(current => ({ ...current, evidence: { ...current.evidence, caseText: value } }));
    else if (draft.mode === "paragraph") setDraft(current => ({ ...current, paragraph: { ...current.paragraph, text: current.paragraph.text ? `${current.paragraph.text}\n${value}` : value } }));
    else setDraft(current => ({ ...current, outline: { ...current.outline, evidence: current.outline.evidence ? `${current.outline.evidence}\n${value}` : value } }));
  }

  const modeBody = useMemo(() => {
    if (draft.mode === "outline") return <div className="essay-drill-fields">
      <label><span>拟定标题</span><input value={draft.outline.title} onChange={event => setDraft(current => ({ ...current, outline: { ...current.outline, title: event.target.value } }))} placeholder="标题要出现题目核心命题"/></label>
      <label><span>中心论点 <em>一句话回答“怎么理解主题”</em></span><textarea rows={3} value={draft.outline.thesis} onChange={event => setDraft(current => ({ ...current, outline: { ...current.outline, thesis: event.target.value } }))} placeholder="示例：以……为抓手，才能把……转化为……"/></label>
      <div className="essay-subpoint-fields"><div className="essay-field-heading"><span>分论点（建议 2—3 个）</span><small>{draft.outline.subpoints.filter(Boolean).length}/3 已填写</small></div>{draft.outline.subpoints.map((item, index) => <label key={index}><b>{index + 1}</b><input value={item} onChange={event => setDraft(current => ({ ...current, outline: { ...current.outline, subpoints: current.outline.subpoints.map((point, pointIndex) => pointIndex === index ? event.target.value : point) } }))} placeholder={`分论点 ${index + 1}：一个可展开的角度`}/></label>)}</div>
      <label><span>材料证据挂接 <em>先写事实/案例，再写它证明了什么</em></span><textarea rows={4} value={draft.outline.evidence} onChange={event => setDraft(current => ({ ...current, outline: { ...current.outline, evidence: event.target.value } }))} placeholder="分论点1—材料事实；分论点2—案例或机制……"/></label>
      <div className="essay-drill-count">提纲已写 {outlineChars} 字 · 目标 120—220 字</div>
    </div>;
    if (draft.mode === "paragraph") return <div className="essay-drill-fields">
      <label><span>本段分论点</span><input value={draft.paragraph.claim} onChange={event => setDraft(current => ({ ...current, paragraph: { ...current.paragraph, claim: event.target.value } }))} placeholder="段首直接亮出要证明的观点"/></label>
      <div className="essay-structure-hint"><span>推荐顺序</span><strong>分论点 → 为什么 → 具体论据 → 分析回扣</strong></div>
      <label><span>单段论证 <em>不要追求整篇完整，先把一段写扎实</em></span><textarea className="essay-long-textarea" rows={12} value={draft.paragraph.text} onChange={event => setDraft(current => ({ ...current, paragraph: { ...current.paragraph, text: event.target.value } }))} placeholder="先写观点，再解释其必要性；接一个具体案例或材料事实；最后说明案例为何能证明观点。"/></label>
      <div className="essay-drill-count">本段 {paragraphChars} 字 · 建议 220—300 字</div>
    </div>;
    return <div className="essay-drill-fields">
      <label><span>要服务的分论点</span><input value={draft.evidence.target} onChange={event => setDraft(current => ({ ...current, evidence: { ...current.evidence, target: event.target.value } }))} placeholder="例如：以制度协同提升基层治理效能"/></label>
      <label><span>案例原貌 <em>主体 + 做法 + 结果</em></span><textarea rows={5} value={draft.evidence.caseText} onChange={event => setDraft(current => ({ ...current, evidence: { ...current.evidence, caseText: event.target.value } }))} placeholder="把材料中的一个案例讲完整，不要只抄一个地名。"/></label>
      <label><span>抽象机制 <em>这个案例为什么能证明分论点</em></span><textarea rows={4} value={draft.evidence.mechanism} onChange={event => setDraft(current => ({ ...current, evidence: { ...current.evidence, mechanism: event.target.value } }))} placeholder="从个案上提到可迁移的做法、机制或效果。"/></label>
      <div className="essay-drill-count">素材卡片已写 {evidenceChars} 字 · 目标 80—150 字</div>
    </div>;
  }, [draft, evidenceChars, outlineChars, paragraphChars]);

  return <section className="essay-drill-panel">
    <header className="essay-drill-header"><div><div className="essay-drill-kicker"><ClipboardList size={15}/>大作文专项练习</div><h3>先练一个零件，再组装整篇</h3><p>{activeMeta.hint}，单次控制在 {activeMeta.duration}。</p></div><button className="essay-full-answer-link" onClick={onOpenFullAnswer}><FileText size={15}/>进入完整作答 <ArrowRight size={14}/></button></header>
    <nav className="essay-drill-tabs" aria-label="大作文专项练习模式">{(Object.keys(MODE_META) as EssayDrillMode[]).map(mode => <button key={mode} className={draft.mode === mode ? "active" : ""} onClick={() => selectMode(mode)}><span>{MODE_META[mode].label}</span><small>{MODE_META[mode].duration}</small></button>)}</nav>
    <div className="essay-drill-layout"><div className="essay-drill-main">{modeBody}<div className="essay-drill-actions"><button className="secondary" onClick={resetCurrent}><RotateCcw size={14}/>清空本项</button><button className="primary" onClick={checkCurrent}><Sparkles size={15}/>完成检查</button></div>{feedback && <FeedbackCard feedback={feedback}/>}<div className="essay-drill-save"><span>草稿自动保存在本机</span><span>专项检查不计入整篇得分</span></div></div><aside className="essay-drill-aside"><SuggestionShelf result={deepReadResult} mode={draft.mode} onUseAngle={useAngle} onUseCase={useCase}/><div className="essay-drill-rule"><strong>本轮只盯一个动作</strong><span>{draft.mode === "outline" ? "观点先行，分论点不要互相重复。" : draft.mode === "paragraph" ? "论据之后必须回答‘这说明什么’。" : "素材要从个案上提到机制，才能迁移。"}</span></div></aside></div>
  </section>;
}
