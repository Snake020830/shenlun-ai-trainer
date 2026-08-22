import { useEffect, useMemo, useState } from "react";
import {
  BookOpenText,
  Check,
  CircleAlert,
  Clock3,
  Eraser,
  Highlighter,
  PanelRightClose,
  PanelRightOpen,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Underline
} from "lucide-react";
import { gradingService } from "./grading";
import {
  getPracticeAnnotations,
  savePracticeAnnotations,
  saveTrainingPracticeMeta,
  type PracticeTextAnnotation
} from "./practiceSessionStore";
import ReferenceCrossCheckPanel from "./ReferenceCrossCheckPanel";
import { persistence } from "./storage";
import type { MockReview, Question, TrainingRecord } from "./types";
import "./practiceExam.css";

type AnnotationMode = PracticeTextAnnotation["type"] | null;

function formatElapsed(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function selectionOffset(root: HTMLElement, node: Node, offset: number): number {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  return range.toString().length;
}

function renderAnnotatedText(content: string, annotations: PracticeTextAnnotation[]) {
  if (!annotations.length) return content;
  const boundaries = new Set<number>([0, content.length]);
  for (const item of annotations) {
    boundaries.add(Math.max(0, Math.min(content.length, item.start)));
    boundaries.add(Math.max(0, Math.min(content.length, item.end)));
  }
  const points = [...boundaries].sort((a, b) => a - b);
  return points.slice(0, -1).map((start, index) => {
    const end = points[index + 1];
    const text = content.slice(start, end);
    const active = annotations.filter(item => item.start < end && item.end > start);
    const className = [
      active.some(item => item.type === "highlight") ? "material-highlight" : "",
      active.some(item => item.type === "underline") ? "material-underline" : ""
    ].filter(Boolean).join(" ");
    return className ? <span key={`${start}-${end}`} className={className}>{text}</span> : text;
  });
}

function BeforeReview({ question }: { question: Question }) {
  return <div className="before-review"><div className="review-icon"><Sparkles size={22}/></div><h3>批改面板</h3><p>提交前不展示要点，避免提示效应。提交后这里会显示结构化反馈。</p><div className="review-rule"><Check size={16}/><span>要点覆盖</span></div><div className="review-rule"><Check size={16}/><span>要素分类</span></div><div className="review-rule"><Check size={16}/><span>表达与冗余</span></div><small>提交后按当前设置的评分引擎运行；远程 AI 若启用，其数值分仍属于未校准实验评分。</small><div className="question-facts"><span>题型</span><strong>{question.type}</strong><span>字数</span><strong>≤ {question.wordLimit}</strong></div></div>;
}

function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "green" | "amber" }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

function ReviewPanel({ review }: { review: MockReview }) {
  return <div className="review-content"><div className="score-panel"><span>本次得分</span><strong>{review.score}<small> / {review.maxScore}</small></strong><p>{review.summary}</p></div><div className="review-metrics"><div><span>要点覆盖</span><strong>{review.coverage}</strong></div><div><span>分类</span><strong>{review.classification}</strong></div><div><span>表达</span><strong>{review.expression}</strong></div><div><span>冗余</span><strong>{review.redundancy}</strong></div></div><div className="point-list"><h4>逐点核对</h4>{review.points.map(point => <article key={point.title} className={`point point-${point.status}`}><div className="point-heading">{point.status === "hit" ? <Check size={16}/> : <CircleAlert size={16}/>}<strong>{point.title}</strong><Badge tone={point.status === "hit" ? "green" : "amber"}>{point.status === "hit" ? "已覆盖" : point.status === "partial" ? "部分覆盖" : "遗漏"}</Badge></div><p><b>材料依据：</b>{point.evidence}</p>{point.suggestion && <p className="suggestion"><b>修改：</b>{point.suggestion}</p>}</article>)}</div>{review.referenceCrossCheck && <ReferenceCrossCheckPanel crossCheck={review.referenceCrossCheck}/>}</div>;
}

export default function PracticeWorkspace({ question, onExit, onSubmitted }: { question: Question; onExit: () => void; onSubmitted: (record: TrainingRecord) => void }) {
  const [answer, setAnswer] = useState("");
  const [review, setReview] = useState<MockReview | null>(null);
  const [rightOpen, setRightOpen] = useState(true);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [annotationMode, setAnnotationMode] = useState<AnnotationMode>(null);
  const [annotations, setAnnotations] = useState<PracticeTextAnnotation[]>([]);
  const [annotationsLoaded, setAnnotationsLoaded] = useState(false);
  const chars = answer.replace(/\s/g, "").length;
  const totalMaterialChars = useMemo(() => question.materials.reduce((sum, item) => sum + item.content.replace(/\s/g, "").length, 0), [question.materials]);

  useEffect(() => {
    let cancelled = false;
    setAnnotationsLoaded(false);
    setAnnotations([]);
    setElapsedSeconds(0);
    setTimerRunning(false);
    getPracticeAnnotations(question.id)
      .then(stored => {
        if (cancelled) return;
        setAnnotations(stored);
        setAnnotationsLoaded(true);
      })
      .catch(error => {
        console.error("Failed to load practice annotations.", error);
        if (!cancelled) setAnnotationsLoaded(true);
      });
    return () => { cancelled = true; };
  }, [question.id]);

  useEffect(() => {
    if (!timerRunning) return;
    const timer = window.setInterval(() => setElapsedSeconds(value => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [timerRunning]);

  useEffect(() => {
    if (!annotationsLoaded) return;
    const timer = window.setTimeout(() => {
      void savePracticeAnnotations(question.id, annotations)
        .catch(error => console.error("Failed to persist material annotations.", error));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [annotations, annotationsLoaded, question.id]);

  useEffect(() => {
    let cancelled = false;
    setDraftLoaded(false);
    setAnswer("");
    setReview(null);
    setSubmitting(false);
    setSubmitError(null);
    persistence.getDraft(question.id)
      .then(draft => {
        if (cancelled) return;
        setAnswer(draft?.answer ?? "");
        setDraftLoaded(true);
      })
      .catch(error => {
        console.error("Failed to load draft.", error);
        if (!cancelled) setDraftLoaded(true);
      });
    return () => { cancelled = true; };
  }, [question.id]);

  useEffect(() => {
    if (!draftLoaded) return;
    const timer = window.setTimeout(() => {
      void persistence.saveDraft({ questionId: question.id, answer, updatedAt: new Date().toISOString() })
        .catch(error => console.error("Failed to save draft.", error));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [answer, draftLoaded, question.id]);

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await gradingService.grade({ question, answer, referenceAnswer: question.referenceAnswer });
      setReview(result);
      setTimerRunning(false);
      const now = new Date();
      const record: TrainingRecord = { id: crypto.randomUUID(), questionId: question.id, title: question.title, score: result.score, maxScore: result.maxScore, submittedAt: now.toLocaleString("zh-CN"), submittedAtIso: now.toISOString(), answer, review: result };
      await persistence.addHistory(record);
      try {
        await saveTrainingPracticeMeta(record.id, elapsedSeconds, annotations.length, now.toISOString());
      } catch (error) {
        console.error("Training record was saved, but practice timing metadata failed.", error);
      }
      onSubmitted(record);
    } catch (error) {
      console.error("Failed to grade or save training record.", error);
      setSubmitError("批改未完成，请重试");
    } finally {
      setSubmitting(false);
    }
  }

  function annotateSelection(materialId: string, event: React.MouseEvent<HTMLElement>) {
    if (!annotationMode) return;
    const root = event.currentTarget;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return;
    const start = selectionOffset(root, range.startContainer, range.startOffset);
    const end = selectionOffset(root, range.endContainer, range.endOffset);
    if (end <= start) return;
    setAnnotations(current => [...current, {
      id: crypto.randomUUID(),
      materialId,
      start,
      end,
      type: annotationMode
    }]);
    selection.removeAllRanges();
  }

  const persistenceStatus = submitError ?? (draftLoaded ? "已自动保存" : "正在读取草稿…");
  const isDemo = question.source !== "local";

  return <div className="practice-shell exam-practice-shell">
    <header className="practice-header exam-practice-header">
      <button className="text-button" onClick={onExit}>← 返回题库</button>
      <div className="practice-title-block"><strong>{question.title}</strong><span>{question.type} · {question.score} 分 · ≤ {question.wordLimit} 字</span></div>
      <div className="practice-header-actions">
        <div className={`exam-timer ${timerRunning ? "running" : ""}`}><Clock3 size={16}/><strong>{formatElapsed(elapsedSeconds)}</strong><button title={timerRunning ? "暂停计时" : "开始计时"} onClick={() => setTimerRunning(value => !value)}>{timerRunning ? <Pause size={14}/> : <Play size={14}/>}</button><button title="计时归零" onClick={() => { setTimerRunning(false); setElapsedSeconds(0); }}><RotateCcw size={13}/></button></div>
        <button className="icon-button" onClick={() => setRightOpen(value => !value)}>{rightOpen ? <PanelRightClose size={19}/> : <PanelRightOpen size={19}/>}</button>
      </div>
    </header>
    {isDemo && <div className="demo-question-notice">当前为内置功能演示题，材料长度仅用于测试交互；正式训练请导入完整真题材料。</div>}
    <div className={rightOpen ? "practice-grid" : "practice-grid right-hidden"}>
      <section className="materials-pane exam-materials-pane">
        <div className="pane-title exam-pane-title"><BookOpenText size={18}/><strong>给定资料</strong><span>{question.materials.length} 则 · 约 {totalMaterialChars} 字</span></div>
        <div className="annotation-toolbar" aria-label="材料标注工具">
          <button className={annotationMode === "highlight" ? "active" : ""} onClick={() => setAnnotationMode(mode => mode === "highlight" ? null : "highlight")}><Highlighter size={15}/><span>记号笔</span></button>
          <button className={annotationMode === "underline" ? "active" : ""} onClick={() => setAnnotationMode(mode => mode === "underline" ? null : "underline")}><Underline size={15}/><span>下划线</span></button>
          <button disabled={!annotations.length} onClick={() => setAnnotations([])}><Eraser size={15}/><span>清除标记</span></button>
          <small>{!annotationsLoaded ? "正在读取标记…" : annotationMode ? "选中材料文字即可标记" : "选择工具后，再拖选原文"}</small>
        </div>
        <div className="material-scroll exam-paper-scroll">{question.materials.map(block => {
          const blockAnnotations = annotations.filter(item => item.materialId === block.id);
          return <article className="material exam-material" key={block.id}><div className="material-label"><span>{block.label}</span><small>{block.content.replace(/\s/g, "").length} 字</small></div><p onMouseUp={event => annotateSelection(block.id, event)}>{renderAnnotatedText(block.content, blockAnnotations)}</p></article>;
        })}</div>
      </section>
      <section className="answer-pane exam-answer-pane">
        <div className="prompt-box exam-prompt-box"><span>作答任务</span><p>{question.prompt}</p></div>
        <div className="grid-answer-wrap"><div className="answer-paper-label"><span>答题区</span><small>一字一格 · 键盘输入模拟申论答题纸</small></div><textarea className="grid-answer-input" value={answer} onChange={event => setAnswer(event.target.value)} placeholder={draftLoaded ? "在稿纸中独立作答……" : "正在读取本地草稿……"} disabled={!draftLoaded}/></div>
        <div className="answer-footer exam-answer-footer"><span className={chars > question.wordLimit ? "over-limit" : ""}>{chars} / {question.wordLimit} 字</span><span>{formatElapsed(elapsedSeconds)}</span><span className={submitError ? "over-limit" : ""}>{persistenceStatus}</span><button className="primary" disabled={chars < 10 || !draftLoaded || submitting} onClick={submit}><Sparkles size={16}/>{submitting ? "批改中…" : "提交批改"}</button></div>
      </section>
      {rightOpen && <aside className="review-pane">{review ? <ReviewPanel review={review}/> : <BeforeReview question={question}/>}</aside>}
    </div>
  </div>;
}
