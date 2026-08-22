import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  BookOpenText,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Eraser,
  Highlighter,
  Minus,
  PanelRightClose,
  PanelRightOpen,
  Pause,
  PenLine,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Underline,
  Undo2
} from "lucide-react";
import { errorMessage } from "./errorMessage";
import { gradingService } from "./grading";
import {
  answerSheetCapacity,
  answerSheetMarkers,
  answerSheetRows,
  countExamGridCells,
  EXAM_GRID_COLUMNS,
  recommendedPracticeSeconds
} from "./practiceExamModel";
import { anchorInkPoint, distanceToInkStroke, resolveInkPolyline } from "./practiceInkAnchors";
import {
  getPracticeAnnotations,
  getPracticeInkStrokes,
  savePracticeAnnotations,
  savePracticeInkStrokes,
  saveTrainingPracticeMeta,
  type PracticeHighlightColor,
  type PracticeInkStroke,
  type PracticeTextAnnotation
} from "./practiceSessionStore";
import ReferenceCrossCheckPanel from "./ReferenceCrossCheckPanel";
import { persistence } from "./storage";
import type { MockReview, Question, TrainingRecord } from "./types";
import "./practiceExam.css";

type AnnotationMode = PracticeTextAnnotation["type"] | null;
type InkMode = "pen" | "eraser" | null;
type MaterialView = "single" | "all";

const MATERIAL_FONT_KEY = "shenlun:material-font-size:v2";
const MATERIAL_FONT_MIN = 16;
const MATERIAL_FONT_MAX = 24;
const MATERIAL_FONT_DEFAULT = 18;
const HIGHLIGHT_COLORS: Array<{ value: PracticeHighlightColor; label: string }> = [
  { value: "yellow", label: "黄色" },
  { value: "blue", label: "蓝色" },
  { value: "green", label: "绿色" },
  { value: "pink", label: "粉色" }
];

function clampMaterialFontSize(value: number): number {
  return Math.min(MATERIAL_FONT_MAX, Math.max(MATERIAL_FONT_MIN, Math.round(value)));
}

function readMaterialFontSize(): number {
  const raw = Number(localStorage.getItem(MATERIAL_FONT_KEY));
  return Number.isFinite(raw) ? clampMaterialFontSize(raw) : MATERIAL_FONT_DEFAULT;
}

function formatDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
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

function renderAnnotatedText(
  content: string,
  annotations: PracticeTextAnnotation[],
  selectedAnnotationId: string | null,
  onSelectAnnotation: (id: string) => void
) {
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
    if (!active.length) return text;
    const annotation = active[active.length - 1];
    const activeHighlight = [...active].reverse().find(item => item.type === "highlight");
    const highlightColor = activeHighlight?.color ?? "blue";
    const className = [
      activeHighlight ? `material-highlight material-highlight-${highlightColor}` : "",
      active.some(item => item.type === "underline") ? "material-underline" : "",
      active.some(item => item.id === selectedAnnotationId) ? "material-mark-selected" : ""
    ].filter(Boolean).join(" ");
    return <span
      key={`${start}-${end}`}
      className={className}
      role="button"
      tabIndex={0}
      title="点击选中此标记，可单独删除"
      onClick={event => {
        event.stopPropagation();
        onSelectAnnotation(annotation.id);
      }}
    >{text}</span>;
  });
}

function AnchoredInkLayer({
  textRef,
  strokes,
  layoutKey
}: {
  textRef: React.RefObject<HTMLParagraphElement | null>;
  strokes: PracticeInkStroke[];
  layoutKey: string;
}) {
  const [paths, setPaths] = useState<Array<{ id: string; points: string; width: number; color: PracticeInkStroke["color"] }>>([]);

  useLayoutEffect(() => {
    const root = textRef.current;
    if (!root) {
      setPaths([]);
      return;
    }
    let disposed = false;
    const recompute = () => {
      if (disposed) return;
      setPaths(strokes.map(stroke => ({
        id: stroke.id,
        points: resolveInkPolyline(root, stroke),
        width: stroke.width,
        color: stroke.color
      })).filter(item => item.points.length > 0));
    };
    recompute();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(recompute);
    observer?.observe(root);
    window.addEventListener("resize", recompute);
    void document.fonts?.ready.then(recompute).catch(() => undefined);
    return () => {
      disposed = true;
      observer?.disconnect();
      window.removeEventListener("resize", recompute);
    };
  }, [layoutKey, strokes, textRef]);

  return <svg className="material-ink-layer" aria-hidden="true">
    {paths.map(path => <polyline
      key={path.id}
      className={`material-ink-stroke ink-${path.color}`}
      points={path.points}
      fill="none"
      strokeWidth={path.width}
      strokeLinecap="round"
      strokeLinejoin="round"
      vectorEffect="non-scaling-stroke"
    />)}
  </svg>;
}

function MaterialTextStage({
  materialId,
  content,
  fontSize,
  annotations,
  selectedAnnotationId,
  annotationMode,
  inkMode,
  strokes,
  onAnnotateSelection,
  onSelectAnnotation,
  onClearAnnotationSelection,
  onCommitStroke,
  onEraseStroke
}: {
  materialId: string;
  content: string;
  fontSize: number;
  annotations: PracticeTextAnnotation[];
  selectedAnnotationId: string | null;
  annotationMode: AnnotationMode;
  inkMode: InkMode;
  strokes: PracticeInkStroke[];
  onAnnotateSelection: (materialId: string, event: React.MouseEvent<HTMLElement>) => void;
  onSelectAnnotation: (id: string) => void;
  onClearAnnotationSelection: () => void;
  onCommitStroke: (stroke: PracticeInkStroke) => void;
  onEraseStroke: (strokeId: string) => void;
}) {
  const textRef = useRef<HTMLParagraphElement>(null);
  const draftRef = useRef<PracticeInkStroke | null>(null);
  const lastClientPoint = useRef<{ x: number; y: number } | null>(null);
  const [draftStroke, setDraftStroke] = useState<PracticeInkStroke | null>(null);

  useEffect(() => {
    draftRef.current = null;
    lastClientPoint.current = null;
    setDraftStroke(null);
  }, [inkMode, materialId]);

  function beginInk(event: React.PointerEvent<HTMLDivElement>) {
    if (!inkMode) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const root = textRef.current;
    if (!root) return;
    event.preventDefault();

    if (inkMode === "eraser") {
      let nearest: { id: string; distance: number } | null = null;
      for (const stroke of strokes) {
        const distance = distanceToInkStroke(root, stroke, event.clientX, event.clientY);
        if (!nearest || distance < nearest.distance) nearest = { id: stroke.id, distance };
      }
      if (nearest && nearest.distance <= 14) onEraseStroke(nearest.id);
      return;
    }

    const point = anchorInkPoint(root, event.clientX, event.clientY);
    if (!point) return;
    const stroke: PracticeInkStroke = {
      id: crypto.randomUUID(),
      materialId,
      color: "graphite",
      width: 2.2,
      points: [point]
    };
    draftRef.current = stroke;
    lastClientPoint.current = { x: event.clientX, y: event.clientY };
    setDraftStroke(stroke);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveInk(event: React.PointerEvent<HTMLDivElement>) {
    if (inkMode !== "pen" || !draftRef.current) return;
    const root = textRef.current;
    if (!root) return;
    const previous = lastClientPoint.current;
    if (previous && Math.hypot(event.clientX - previous.x, event.clientY - previous.y) < 3) return;
    const point = anchorInkPoint(root, event.clientX, event.clientY);
    if (!point) return;
    const next = { ...draftRef.current, points: [...draftRef.current.points, point].slice(-5000) };
    draftRef.current = next;
    lastClientPoint.current = { x: event.clientX, y: event.clientY };
    setDraftStroke(next);
  }

  function finishInk(event: React.PointerEvent<HTMLDivElement>) {
    const stroke = draftRef.current;
    draftRef.current = null;
    lastClientPoint.current = null;
    setDraftStroke(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (stroke && stroke.points.length >= 2) onCommitStroke(stroke);
  }

  const visibleStrokes = draftStroke ? [...strokes, draftStroke] : strokes;
  const annotationLayoutKey = annotations.map(item => `${item.id}:${item.start}:${item.end}`).join("|");

  return <div
    className={`material-text-stage ${inkMode ? "ink-active" : ""} ${inkMode === "eraser" ? "eraser-active" : ""}`}
    onPointerDown={beginInk}
    onPointerMove={moveInk}
    onPointerUp={finishInk}
    onPointerCancel={finishInk}
  >
    <p
      ref={textRef}
      className="exam-material-text"
      style={{ fontSize: `${fontSize}px` }}
      onMouseUp={event => onAnnotateSelection(materialId, event)}
      onClick={() => { if (!inkMode) onClearAnnotationSelection(); }}
    >{renderAnnotatedText(content, annotations, selectedAnnotationId, onSelectAnnotation)}</p>
    <AnchoredInkLayer textRef={textRef} strokes={visibleStrokes} layoutKey={`${fontSize}:${content.length}:${annotationLayoutKey}`}/>
  </div>;
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
  const countdownSeconds = useMemo(
    () => recommendedPracticeSeconds(question.wordLimit, question.type),
    [question.type, question.wordLimit]
  );
  const [answer, setAnswer] = useState("");
  const [review, setReview] = useState<MockReview | null>(null);
  const [rightOpen, setRightOpen] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(countdownSeconds);
  const [timerRunning, setTimerRunning] = useState(true);
  const [annotationMode, setAnnotationMode] = useState<AnnotationMode>(null);
  const [inkMode, setInkMode] = useState<InkMode>(null);
  const [highlightColor, setHighlightColor] = useState<PracticeHighlightColor>("yellow");
  const [annotations, setAnnotations] = useState<PracticeTextAnnotation[]>([]);
  const [annotationsLoaded, setAnnotationsLoaded] = useState(false);
  const [inkStrokes, setInkStrokes] = useState<PracticeInkStroke[]>([]);
  const [inkLoaded, setInkLoaded] = useState(false);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [activeMaterialId, setActiveMaterialId] = useState(question.materials[0]?.id ?? "");
  const [materialView, setMaterialView] = useState<MaterialView>("single");
  const [materialFontSize, setMaterialFontSize] = useState(readMaterialFontSize);
  const chars = answer.replace(/\s/g, "").length;
  const elapsedSeconds = Math.max(0, countdownSeconds - remainingSeconds);
  const overtimeSeconds = Math.max(0, -remainingSeconds);
  const gridCells = countExamGridCells(answer);
  const gridRows = answerSheetRows(question.wordLimit);
  const gridCapacity = answerSheetCapacity(question.wordLimit);
  const gridMarkers = answerSheetMarkers(question.wordLimit);
  const gridStyle = { "--answer-rows": gridRows } as React.CSSProperties;
  const activeMaterialIndex = Math.max(0, question.materials.findIndex(item => item.id === activeMaterialId));
  const visibleMaterials = useMemo(
    () => materialView === "all" ? question.materials : question.materials.filter(item => item.id === activeMaterialId),
    [activeMaterialId, materialView, question.materials]
  );

  useEffect(() => {
    let cancelled = false;
    setAnnotationsLoaded(false);
    setInkLoaded(false);
    setAnnotations([]);
    setInkStrokes([]);
    setAnnotationMode(null);
    setInkMode(null);
    setSelectedAnnotationId(null);
    setActiveMaterialId(question.materials[0]?.id ?? "");
    setMaterialView("single");
    setRemainingSeconds(countdownSeconds);
    setTimerRunning(true);
    Promise.all([
      getPracticeAnnotations(question.id).catch(error => {
        console.error("Failed to load practice annotations.", error);
        return [] as PracticeTextAnnotation[];
      }),
      getPracticeInkStrokes(question.id).catch(error => {
        console.error("Failed to load practice ink strokes.", error);
        return [] as PracticeInkStroke[];
      })
    ]).then(([storedAnnotations, storedInk]) => {
      if (cancelled) return;
      setAnnotations(storedAnnotations);
      setInkStrokes(storedInk);
      setAnnotationsLoaded(true);
      setInkLoaded(true);
    });
    return () => { cancelled = true; };
  }, [countdownSeconds, question.id, question.materials]);

  useEffect(() => {
    localStorage.setItem(MATERIAL_FONT_KEY, String(materialFontSize));
  }, [materialFontSize]);

  useEffect(() => {
    if (!timerRunning) return;
    const timer = window.setInterval(() => setRemainingSeconds(value => value - 1), 1000);
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
    if (!inkLoaded) return;
    const timer = window.setTimeout(() => {
      void savePracticeInkStrokes(question.id, inkStrokes)
        .catch(error => console.error("Failed to persist anchored ink strokes.", error));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [inkLoaded, inkStrokes, question.id]);

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
      setRightOpen(true);
      setTimerRunning(false);
      const now = new Date();
      const record: TrainingRecord = { id: crypto.randomUUID(), questionId: question.id, title: question.title, score: result.score, maxScore: result.maxScore, submittedAt: now.toLocaleString("zh-CN"), submittedAtIso: now.toISOString(), answer, review: result };
      await persistence.addHistory(record);
      try {
        await saveTrainingPracticeMeta(record.id, elapsedSeconds, annotations.length + inkStrokes.length, now.toISOString());
      } catch (error) {
        console.error("Training record was saved, but practice timing metadata failed.", error);
      }
      onSubmitted(record);
    } catch (error) {
      console.error("Failed to grade or save training record.", error);
      setRightOpen(true);
      setSubmitError(`批改失败：${errorMessage(error, "未知错误，请重试。")}`);
    } finally {
      setSubmitting(false);
    }
  }

  function annotateSelection(materialId: string, event: React.MouseEvent<HTMLElement>) {
    if (!annotationMode || !annotationsLoaded || inkMode) return;
    const root = event.currentTarget;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return;
    const start = selectionOffset(root, range.startContainer, range.startOffset);
    const end = selectionOffset(root, range.endContainer, range.endOffset);
    if (end <= start) return;
    const id = crypto.randomUUID();
    setAnnotations(current => [...current, {
      id,
      materialId,
      start,
      end,
      type: annotationMode,
      ...(annotationMode === "highlight" ? { color: highlightColor } : {})
    }]);
    setSelectedAnnotationId(id);
    selection.removeAllRanges();
  }

  function undoLastAnnotation() {
    setAnnotations(current => {
      if (!current.length) return current;
      const next = current.slice(0, -1);
      setSelectedAnnotationId(next.at(-1)?.id ?? null);
      return next;
    });
  }

  function deleteSelectedAnnotation() {
    if (!selectedAnnotationId) return;
    setAnnotations(current => current.filter(item => item.id !== selectedAnnotationId));
    setSelectedAnnotationId(null);
  }

  function commitInkStroke(stroke: PracticeInkStroke) {
    setInkStrokes(current => [...current, stroke].slice(-500));
  }

  function eraseInkStroke(strokeId: string) {
    setInkStrokes(current => current.filter(item => item.id !== strokeId));
  }

  function undoLastInkStroke() {
    setInkStrokes(current => current.length ? current.slice(0, -1) : current);
  }

  function changeMaterial(step: -1 | 1) {
    if (!question.materials.length) return;
    const nextIndex = Math.min(question.materials.length - 1, Math.max(0, activeMaterialIndex + step));
    setActiveMaterialId(question.materials[nextIndex].id);
    setMaterialView("single");
    setSelectedAnnotationId(null);
  }

  function changeMaterialFontSize(delta: number) {
    setMaterialFontSize(current => {
      const next = clampMaterialFontSize(current + delta);
      localStorage.setItem(MATERIAL_FONT_KEY, String(next));
      return next;
    });
  }

  function resetMaterialFontSize() {
    localStorage.setItem(MATERIAL_FONT_KEY, String(MATERIAL_FONT_DEFAULT));
    setMaterialFontSize(MATERIAL_FONT_DEFAULT);
  }

  const persistenceStatus = submitError ?? (draftLoaded ? "已自动保存" : "正在读取草稿…");
  const isDemo = question.source !== "local";
  const timerText = remainingSeconds >= 0 ? formatDuration(remainingSeconds) : `+${formatDuration(overtimeSeconds)}`;

  return <div className="practice-shell exam-practice-shell">
    <header className="practice-header exam-practice-header">
      <button className="text-button" onClick={onExit}>← 返回题库</button>
      <div className="practice-title-block"><strong>{question.title}</strong><span>{question.type} · {question.score} 分 · ≤ {question.wordLimit} 字</span></div>
      <div className="practice-header-actions">
        <div className={`exam-timer ${timerRunning ? "running" : ""} ${remainingSeconds < 0 ? "overtime" : ""}`}><Clock3 size={16}/><strong>{timerText}</strong><small>{Math.round(countdownSeconds / 60)} 分钟建议</small><button title={timerRunning ? "暂停倒计时" : "继续倒计时"} onClick={() => setTimerRunning(value => !value)}>{timerRunning ? <Pause size={14}/> : <Play size={14}/>}</button><button title="重新开始本题倒计时" onClick={() => { setRemainingSeconds(countdownSeconds); setTimerRunning(true); }}><RotateCcw size={13}/></button></div>
        <button className="icon-button" title={rightOpen ? "收起批改栏" : "展开批改栏"} onClick={() => setRightOpen(value => !value)}>{rightOpen ? <PanelRightClose size={19}/> : <PanelRightOpen size={19}/>}</button>
      </div>
    </header>
    {isDemo && <div className="demo-question-notice">当前为内置功能演示题；正式训练将使用完整题干与完整材料。</div>}
    <div className={rightOpen ? "practice-grid" : "practice-grid right-hidden"}>
      <section className="materials-pane exam-materials-pane">
        <div className="material-navigation">
          <div className="material-tabs" role="tablist">
            {question.materials.map((block, index) => <button key={block.id} className={materialView === "single" && block.id === activeMaterialId ? "active" : ""} onClick={() => { setActiveMaterialId(block.id); setMaterialView("single"); setSelectedAnnotationId(null); }}>材料{index + 1}</button>)}
            {question.materials.length > 1 && <button className={materialView === "all" ? "active" : ""} onClick={() => { setMaterialView("all"); setSelectedAnnotationId(null); }}>查看全部</button>}
          </div>
          <div className="material-nav-stepper"><button disabled={materialView === "all" || activeMaterialIndex === 0} onClick={() => changeMaterial(-1)}><ChevronLeft size={15}/></button><span>{materialView === "all" ? "全部材料" : `${activeMaterialIndex + 1} / ${question.materials.length}`}</span><button disabled={materialView === "all" || activeMaterialIndex >= question.materials.length - 1} onClick={() => changeMaterial(1)}><ChevronRight size={15}/></button></div>
        </div>
        <div className="annotation-toolbar" aria-label="材料标注工具">
          <div className="annotation-tool-group"><BookOpenText size={15}/><strong>给定资料</strong></div>
          <button disabled={!annotationsLoaded} className={annotationMode === "highlight" ? "active" : ""} onClick={() => { setInkMode(null); setAnnotationMode(mode => mode === "highlight" ? null : "highlight"); }}><Highlighter size={15}/><span>记号笔</span></button>
          {annotationMode === "highlight" && <div className="highlight-color-palette" aria-label="记号笔颜色">
            {HIGHLIGHT_COLORS.map(item => <button type="button" key={item.value} className={`highlight-color-dot color-${item.value} ${highlightColor === item.value ? "selected" : ""}`} title={`${item.label}记号笔`} aria-label={`${item.label}记号笔`} onClick={() => setHighlightColor(item.value)}/>) }
          </div>}
          <button disabled={!annotationsLoaded} className={annotationMode === "underline" ? "active" : ""} onClick={() => { setInkMode(null); setAnnotationMode(mode => mode === "underline" ? null : "underline"); }}><Underline size={15}/><span>下划线</span></button>
          <button disabled={!inkLoaded} className={inkMode === "pen" ? "active" : ""} onClick={() => { setAnnotationMode(null); setInkMode(mode => mode === "pen" ? null : "pen"); }}><PenLine size={15}/><span>画笔</span></button>
          <button disabled={!inkLoaded || !inkStrokes.length} className={inkMode === "eraser" ? "active" : ""} onClick={() => { setAnnotationMode(null); setInkMode(mode => mode === "eraser" ? null : "eraser"); }}><Eraser size={15}/><span>橡皮</span></button>
          <button disabled={!annotations.length} onClick={undoLastAnnotation}><Undo2 size={15}/><span>撤销标记</span></button>
          <button disabled={!selectedAnnotationId} onClick={deleteSelectedAnnotation}><Trash2 size={15}/><span>删除当前</span></button>
          <button disabled={!inkStrokes.length} onClick={undoLastInkStroke}><Undo2 size={15}/><span>撤销笔迹</span></button>
          <div className="material-font-controls">
            <button type="button" disabled={materialFontSize <= MATERIAL_FONT_MIN} onClick={() => changeMaterialFontSize(-1)} aria-label="减小材料字号"><Minus size={13}/><span>A</span></button>
            <span className="material-font-value" aria-live="polite">{materialFontSize}px</span>
            <button type="button" disabled={materialFontSize >= MATERIAL_FONT_MAX} onClick={() => changeMaterialFontSize(1)} aria-label="增大材料字号"><Plus size={13}/><span>A</span></button>
            <button type="button" className="material-font-reset" disabled={materialFontSize === MATERIAL_FONT_DEFAULT} onClick={resetMaterialFontSize}>默认</button>
          </div>
        </div>
        <div key={`${materialView}:${activeMaterialId}`} className="material-scroll exam-paper-scroll">
          {visibleMaterials.map((block, visibleIndex) => {
            const blockAnnotations = annotations.filter(item => item.materialId === block.id);
            const blockInk = inkStrokes.filter(item => item.materialId === block.id);
            const trueIndex = question.materials.findIndex(item => item.id === block.id);
            return <article className="material exam-material" key={block.id}>
              <div className="material-label"><span>材料{trueIndex + 1}</span>{materialView === "all" && visibleIndex > 0 ? <i/> : null}</div>
              <MaterialTextStage
                materialId={block.id}
                content={block.content}
                fontSize={materialFontSize}
                annotations={blockAnnotations}
                selectedAnnotationId={selectedAnnotationId}
                annotationMode={annotationMode}
                inkMode={inkMode}
                strokes={blockInk}
                onAnnotateSelection={annotateSelection}
                onSelectAnnotation={setSelectedAnnotationId}
                onClearAnnotationSelection={() => setSelectedAnnotationId(null)}
                onCommitStroke={commitInkStroke}
                onEraseStroke={eraseInkStroke}
              />
            </article>;
          })}
        </div>
      </section>
      <section className="answer-pane exam-answer-pane">
        <div className="prompt-box exam-prompt-box"><span>题目要求</span><p>{question.prompt}</p></div>
        <div className="grid-answer-wrap">
          <div className="answer-paper-label"><span>你的作答</span><small>每行 {EXAM_GRID_COLUMNS} 格 · 共 {gridRows} 行 · 按本题字数上限生成</small></div>
          <div className="grid-answer-stage" style={gridStyle}>
            <div className="answer-grid-layer" aria-hidden="true"/>
            <div className="answer-grid-markers" aria-hidden="true">
              {gridMarkers.map(marker => <span key={marker} style={{ top: `${Math.min(100, marker / gridCapacity * 100)}%` }}>{marker}字线</span>)}
            </div>
            <textarea className="grid-answer-input" spellCheck={false} value={answer} onChange={event => setAnswer(event.target.value)} placeholder={draftLoaded ? "" : "正在读取本地草稿……"} disabled={!draftLoaded}/>
          </div>
          <div className="answer-sheet-hint"><span>字数 {chars}/{question.wordLimit}</span><span>稿纸占格 {gridCells}/{gridCapacity}</span><small>稿纸占格为书写模拟：常见数字两位一格，1. / 1、等短序号按一格；评分字数仍按提交文本独立统计。</small></div>
        </div>
        <div className="answer-footer exam-answer-footer"><span className={chars > question.wordLimit ? "over-limit" : ""}>{chars} / {question.wordLimit} 字</span><span className={remainingSeconds < 0 ? "over-limit" : ""}>{timerText}</span><span className={submitError ? "over-limit" : ""} title={submitError ?? undefined}>{persistenceStatus}</span><button className="primary" disabled={chars < 10 || !draftLoaded || submitting} onClick={submit}><Sparkles size={16}/>{submitting ? "批改中…" : "提交批改"}</button></div>
      </section>
      {rightOpen && <aside className="review-pane">{review ? <ReviewPanel review={review}/> : <BeforeReview question={question}/>}</aside>}
    </div>
  </div>;
}
