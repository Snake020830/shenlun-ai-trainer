import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  BookOpenText,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Clock3,
  Eraser,
  Highlighter,
  GripHorizontal,
  LoaderCircle,
  Minus,
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
import { taskNumber } from "./examPaper";
import EssayDrillPanel from "./EssayDrillPanel";
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
import { clampResultDockHeight, resizedResultDockHeight, RESULT_DOCK_DEFAULT_HEIGHT } from "./practiceResultDock";
import ReviewPanel from "./ReviewPanel";
import { persistence } from "./storage";
import type { MockReview, Question, TrainingRecord } from "./types";
import "./practiceExam.css";
import "./practiceResultsDock.css";

type AnnotationMode = PracticeTextAnnotation["type"] | null;
type InkMode = "pen" | "eraser" | null;
const MATERIAL_FONT_KEY = "shenlun:material-font-size:v2";
const MATERIAL_FONT_MIN = 16;
const MATERIAL_FONT_MAX = 24;
const MATERIAL_FONT_DEFAULT = 18;
const RESULT_DOCK_HEIGHT_KEY = "shenlun:practice-result-dock-height:v1";
const HIGHLIGHT_COLORS: Array<{ value: PracticeHighlightColor; label: string; hint: string }> = [
  { value: "yellow", label: "核心/帽子", hint: "主题、主体、分类、总括句" },
  { value: "red", label: "问题/风险", hint: "问题表现、短板、矛盾、隐患" },
  { value: "blue", label: "原因/机制", hint: "原因、条件、影响路径、制约因素" },
  { value: "green", label: "对策/动作", hint: "措施、制度、执行动作、解决方案" },
  { value: "purple", label: "成效/影响", hint: "结果、意义、作用、经验启示" }
];

function cycleHighlightColor(current: PracticeHighlightColor, direction: 1 | -1): PracticeHighlightColor {
  const currentIndex = HIGHLIGHT_COLORS.findIndex(item => item.value === current);
  const nextIndex = (currentIndex + direction + HIGHLIGHT_COLORS.length) % HIGHLIGHT_COLORS.length;
  return HIGHLIGHT_COLORS[nextIndex].value;
}

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

function ResultEmpty() {
  return <div className="practice-result-empty"><strong>还没有批改结果</strong><span>完成作答后点击“提交批改”，结果会固定显示在答题卡下方，并可独立滚动查看。</span></div>;
}

function readResultDockHeight(): number {
  const raw = Number(localStorage.getItem(RESULT_DOCK_HEIGHT_KEY));
  return Number.isFinite(raw) && raw > 0 ? raw : RESULT_DOCK_DEFAULT_HEIGHT;
}

function FullAnswerGrid({ question, answer, draftLoaded, onAnswerChange, onBackToDrill }: {
  question: Question;
  answer: string;
  draftLoaded: boolean;
  onAnswerChange: (value: string) => void;
  onBackToDrill?: () => void;
}) {
  const gridRows = answerSheetRows(question.wordLimit);
  const gridCapacity = answerSheetCapacity(question.wordLimit);
  const gridMarkers = answerSheetMarkers(question.wordLimit);
  const gridCells = countExamGridCells(answer);
  const chars = answer.replace(/\s/g, "").length;
  const gridStyle = { "--answer-rows": gridRows } as React.CSSProperties;
  return <div className="grid-answer-wrap">
    <div className="answer-paper-label"><span>完整作答</span><small>每行 {EXAM_GRID_COLUMNS} 格 · 共 {gridRows} 行 · 标号及句末引号按考试规则合并占格</small>{onBackToDrill && <button className="essay-back-to-drill" onClick={onBackToDrill}>返回短练</button>}</div>
    <div className="grid-answer-stage" style={gridStyle}>
      <div className="answer-grid-layer" aria-hidden="true"/>
      <div className="answer-grid-markers" aria-hidden="true">
        {gridMarkers.map(marker => <span key={marker} style={{ top: `${Math.min(100, marker / gridCapacity * 100)}%` }}>{marker}字线</span>)}
      </div>
      <textarea className="grid-answer-input" spellCheck={false} value={answer} onChange={event => onAnswerChange(event.target.value)} placeholder={draftLoaded ? "" : "正在读取本地草稿……"} disabled={!draftLoaded}/>
    </div>
    <div className="answer-sheet-hint"><span>字数 {chars}/{question.wordLimit}</span><span>稿纸占格 {gridCells}/{gridCapacity}</span><small>建议先完成一轮短练，再把提纲和论证段落组装成整篇文章。</small></div>
  </div>;
}

export default function PracticeWorkspace({ initialQuestion, paperQuestions, onExit, onSubmitted }: { initialQuestion: Question; paperQuestions: Question[]; onExit: () => void; onSubmitted: (record: TrainingRecord) => void }) {
  const [selectedQuestionId, setSelectedQuestionId] = useState(initialQuestion.id);
  const question = paperQuestions.find(item => item.id === selectedQuestionId) ?? initialQuestion;
  const countdownSeconds = useMemo(
    () => recommendedPracticeSeconds(question.wordLimit, question.type),
    [question.type, question.wordLimit]
  );
  const [answer, setAnswer] = useState("");
  const [review, setReview] = useState<MockReview | null>(null);
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
  const materialScrollRef = useRef<HTMLDivElement>(null);
  const materialRefs = useRef(new Map<string, HTMLElement>());
  const answerPaneRef = useRef<HTMLElement>(null);
  const resultResizeRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const [materialFontSize, setMaterialFontSize] = useState(readMaterialFontSize);
  const [essayView, setEssayView] = useState<"drill" | "full">(question.type === "文章写作" ? "drill" : "full");
  const [resultDockHeight, setResultDockHeight] = useState(readResultDockHeight);
  const [resultDockCollapsed, setResultDockCollapsed] = useState(true);
  const [resultDockResizing, setResultDockResizing] = useState(false);
  const chars = answer.replace(/\s/g, "").length;
  const elapsedSeconds = Math.max(0, countdownSeconds - remainingSeconds);
  const overtimeSeconds = Math.max(0, -remainingSeconds);
  const activeMaterialIndex = Math.max(0, question.materials.findIndex(item => item.id === activeMaterialId));
  const visibleMaterials = question.materials;

  function finishResultDockResize(event: React.PointerEvent<HTMLDivElement>) {
    const session = resultResizeRef.current;
    const paneHeight = answerPaneRef.current?.getBoundingClientRect().height ?? 0;
    const finalHeight = session
      ? resizedResultDockHeight(session.startHeight, session.startY, event.clientY, paneHeight)
      : clampResultDockHeight(resultDockHeight, paneHeight);
    setResultDockHeight(finalHeight);
    localStorage.setItem(RESULT_DOCK_HEIGHT_KEY, String(finalHeight));
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    resultResizeRef.current = null;
    setResultDockResizing(false);
  }

  function startResultDockResize(event: React.PointerEvent<HTMLDivElement>) {
    if (!event.isPrimary) return;
    event.preventDefault();
    const paneHeight = answerPaneRef.current?.getBoundingClientRect().height ?? 0;
    const startingHeight = resultDockCollapsed
      ? clampResultDockHeight(RESULT_DOCK_DEFAULT_HEIGHT, paneHeight)
      : clampResultDockHeight(resultDockHeight, paneHeight);
    setResultDockCollapsed(false);
    setResultDockHeight(startingHeight);
    resultResizeRef.current = { startY: event.clientY, startHeight: startingHeight };
    event.currentTarget.setPointerCapture(event.pointerId);
    setResultDockResizing(true);
  }

  function moveResultDockResize(event: React.PointerEvent<HTMLDivElement>) {
    const session = resultResizeRef.current;
    if (!session) return;
    const paneHeight = answerPaneRef.current?.getBoundingClientRect().height ?? 0;
    setResultDockHeight(resizedResultDockHeight(session.startHeight, session.startY, event.clientY, paneHeight));
  }

  function resizeResultDockWithKeyboard(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const paneHeight = answerPaneRef.current?.getBoundingClientRect().height ?? 0;
    const next = clampResultDockHeight(resultDockHeight + (event.key === "ArrowUp" ? 32 : -32), paneHeight);
    setResultDockCollapsed(false);
    setResultDockHeight(next);
    localStorage.setItem(RESULT_DOCK_HEIGHT_KEY, String(next));
  }

  useEffect(() => {
    setSelectedQuestionId(initialQuestion.id);
  }, [initialQuestion.id]);

  useEffect(() => {
    const root = materialScrollRef.current;
    if (!root) return;
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(entries => {
      const visible = entries
        .filter(entry => entry.isIntersecting)
        .sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top);
      const first = visible[0]?.target as HTMLElement | undefined;
      if (first?.dataset.materialId) setActiveMaterialId(first.dataset.materialId);
    }, { root, rootMargin: "-10% 0px -70% 0px", threshold: 0 });
    for (const block of question.materials) {
      const element = materialRefs.current.get(block.id);
      if (element) observer?.observe(element);
    }
    return () => observer?.disconnect();
  }, [question.id, question.materials]);

  useEffect(() => {
    const root = materialScrollRef.current;
    if (!root || annotationMode !== "highlight") return;
    const handleWheel = (event: WheelEvent) => {
      if (!event.shiftKey || Math.abs(event.deltaY) < 1) return;
      event.preventDefault();
      setHighlightColor(current => cycleHighlightColor(current, event.deltaY > 0 ? 1 : -1));
    };
    root.addEventListener("wheel", handleWheel, { passive: false });
    return () => root.removeEventListener("wheel", handleWheel);
  }, [annotationMode]);

  useEffect(() => {
    if (annotationMode !== "highlight") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || !/^[1-5]$/.test(event.key)) return;
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement || activeElement?.getAttribute("contenteditable") === "true") return;
      event.preventDefault();
      setHighlightColor(HIGHLIGHT_COLORS[Number(event.key) - 1].value);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [annotationMode]);

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
    setEssayView(question.type === "文章写作" ? "drill" : "full");
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
    setResultDockCollapsed(true);
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
      setResultDockCollapsed(false);
      setTimerRunning(false);
      const now = new Date();
      const record: TrainingRecord = { id: crypto.randomUUID(), questionId: question.id, title: question.title, score: result.score, maxScore: result.maxScore, submittedAt: now.toLocaleString("zh-CN"), submittedAtIso: now.toISOString(), answer, review: result };
      await persistence.addHistory(record);
      try {
        await persistence.deleteDraft(question.id);
      } catch (error) {
        console.error("Training record was saved, but completed draft cleanup failed.", error);
      }
      try {
        await saveTrainingPracticeMeta(record.id, elapsedSeconds, annotations.length + inkStrokes.length, now.toISOString());
      } catch (error) {
        console.error("Training record was saved, but practice timing metadata failed.", error);
      }
      onSubmitted(record);
    } catch (error) {
      console.error("Failed to grade or save training record.", error);
      setSubmitError(`批改失败：${errorMessage(error, "未知错误，请重试。")}`);
      setResultDockCollapsed(false);
    } finally {
      setSubmitting(false);
    }
  }

  async function exitPractice() {
    try {
      if (draftLoaded) {
        await persistence.saveDraft({ questionId: question.id, answer, updatedAt: new Date().toISOString() });
      }
    } catch (error) {
      console.error("Failed to save the latest answer before leaving practice.", error);
    } finally {
      onExit();
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
    scrollToMaterial(question.materials[nextIndex].id);
    setSelectedAnnotationId(null);
  }

  function scrollToMaterial(materialId: string) {
    const element = materialRefs.current.get(materialId);
    const root = materialScrollRef.current;
    if (!element || !root) return;
    setActiveMaterialId(materialId);
    const rootRect = root.getBoundingClientRect();
    const elementRect = element.querySelector(".material-label")?.getBoundingClientRect() ?? element.getBoundingClientRect();
    const targetTop = root.scrollTop + elementRect.top - rootRect.top - root.clientTop - 18;
    root.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
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
      <button className="text-button" onClick={() => void exitPractice()}>← 返回题库</button>
      <div className="practice-title-block"><strong>{question.title}</strong><span>{question.type} · {question.score} 分 · ≤ {question.wordLimit} 字</span></div>
      <div className="practice-header-actions">
        <div className={`exam-timer ${timerRunning ? "running" : ""} ${remainingSeconds < 0 ? "overtime" : ""}`}><Clock3 size={16}/><strong>{timerText}</strong><small>{Math.round(countdownSeconds / 60)} 分钟建议</small><button title={timerRunning ? "暂停倒计时" : "继续倒计时"} onClick={() => setTimerRunning(value => !value)}>{timerRunning ? <Pause size={14}/> : <Play size={14}/>}</button><button title="重新开始本题倒计时" onClick={() => { setRemainingSeconds(countdownSeconds); setTimerRunning(true); }}><RotateCcw size={13}/></button></div>
      </div>
    </header>
    {isDemo && <div className="demo-question-notice">当前为内置功能演示题；正式训练将使用完整题干与完整材料。</div>}
    <div className="practice-grid practice-integrated-grid">
      <section className="materials-pane exam-materials-pane">
        <div className="material-navigation">
          <div className="material-tabs" role="tablist">
            {question.materials.map((block, index) => <button key={block.id} className={block.id === activeMaterialId ? "active" : ""} onClick={() => { scrollToMaterial(block.id); setSelectedAnnotationId(null); }}>材料{index + 1}</button>)}
          </div>
          <div className="material-nav-stepper"><button disabled={activeMaterialIndex === 0} onClick={() => changeMaterial(-1)}><ChevronLeft size={15}/></button><span>{question.materials.length ? `${activeMaterialIndex + 1} / ${question.materials.length}` : "无材料"}</span><button disabled={!question.materials.length || activeMaterialIndex >= question.materials.length - 1} onClick={() => changeMaterial(1)}><ChevronRight size={15}/></button></div>
        </div>
        <div className="annotation-toolbar" aria-label="材料标注工具">
          <div className="annotation-tool-group"><BookOpenText size={15}/><strong>给定资料</strong></div>
          <button title="按申论答题要素给材料分类标记" disabled={!annotationsLoaded} className={annotationMode === "highlight" ? "active" : ""} onClick={() => { setInkMode(null); setAnnotationMode(mode => mode === "highlight" ? null : "highlight"); }}><Highlighter size={15}/><span>要素标注</span></button>
          {annotationMode === "highlight" && <div className="highlight-color-palette" aria-label="记号笔颜色">
            {HIGHLIGHT_COLORS.map(item => <button type="button" key={item.value} className={`highlight-color-dot color-${item.value} ${highlightColor === item.value ? "selected" : ""}`} title={`${item.label}：${item.hint}`} aria-label={`${item.label}：${item.hint}`} onClick={() => setHighlightColor(item.value)}><i aria-hidden="true"/><span className="highlight-color-name">{item.label}</span></button>) }
          </div>}
          <button title="标出转折、因果、递进、并列等关联关系" disabled={!annotationsLoaded} className={annotationMode === "underline" ? "active" : ""} onClick={() => { setInkMode(null); setAnnotationMode(mode => mode === "underline" ? null : "underline"); }}><Underline size={15}/><span>逻辑线</span></button>
          <button title="在材料旁记录段落功能、归纳词或自己的提醒" disabled={!inkLoaded} className={inkMode === "pen" ? "active" : ""} onClick={() => { setAnnotationMode(null); setInkMode(mode => mode === "pen" ? null : "pen"); }}><PenLine size={15}/><span>段落批注</span></button>
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
        <div ref={materialScrollRef} className="material-scroll exam-paper-scroll">
          {visibleMaterials.map((block, visibleIndex) => {
            const blockAnnotations = annotations.filter(item => item.materialId === block.id);
            const blockInk = inkStrokes.filter(item => item.materialId === block.id);
            const trueIndex = question.materials.findIndex(item => item.id === block.id);
            return <article className="material exam-material" key={block.id} data-material-id={block.id} ref={element => {
              if (element) materialRefs.current.set(block.id, element);
              else materialRefs.current.delete(block.id);
            }}>
              <div className="material-label"><span>材料{trueIndex + 1}</span>{visibleIndex > 0 ? <i/> : null}</div>
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
        {annotationMode === "highlight" && <div className="material-color-dock" aria-label="滚动中的颜色快捷切换">
          <span>颜色</span>
          {HIGHLIGHT_COLORS.map((item, index) => <button
            type="button"
            key={item.value}
            className={`highlight-color-dot color-${item.value} ${highlightColor === item.value ? "selected" : ""}`}
            title={`${item.label}（Alt+${index + 1}）`}
            aria-label={`${item.label}，快捷键 Alt+${index + 1}`}
            onClick={() => setHighlightColor(item.value)}
          ><i aria-hidden="true"/></button>)}
          <small>Shift+滚轮</small>
        </div>}
      </section>

      <section
        ref={answerPaneRef}
        className={`answer-pane exam-answer-pane integrated-answer-pane ${resultDockResizing ? "is-result-resizing" : ""}`}
        style={{ "--result-dock-height": `${resultDockHeight}px` } as React.CSSProperties}
      >
        <div className="answer-fixed-zone">
          <div className="paper-task-navigation" role="tablist" aria-label="本套卷题目切换">
            {paperQuestions.map((item, index) => <button
              key={item.id}
              className={item.id === question.id ? "active" : ""}
              onClick={() => setSelectedQuestionId(item.id)}
              role="tab"
              aria-selected={item.id === question.id}
            >
              <strong>{taskNumber(item, index)}-{item.type}</strong>
              <small>{item.score}分 · ≤{item.wordLimit}字</small>
            </button>)}
          </div>
          <div className="prompt-box exam-prompt-box"><span>题目要求</span><p>{question.prompt}</p></div>
          {question.type === "文章写作" && essayView === "drill"
            ? <EssayDrillPanel question={question} onOpenFullAnswer={() => setEssayView("full")}/>
            : <FullAnswerGrid question={question} answer={answer} draftLoaded={draftLoaded} onAnswerChange={setAnswer} onBackToDrill={question.type === "文章写作" ? () => setEssayView("drill") : undefined}/>}
        </div>

        <div className="answer-footer exam-answer-footer">
          <span className={chars > question.wordLimit ? "over-limit" : ""}>{chars} / {question.wordLimit} 字</span>
          <span className={remainingSeconds < 0 ? "over-limit" : ""}>{timerText}</span>
          <span className={submitError ? "over-limit" : ""} title={submitError ?? undefined}>{persistenceStatus}</span>
          <span className="answer-footer-spacer"/>
          <div className="answer-action-group">
            <button className="primary" disabled={chars < 10 || !draftLoaded || submitting || (question.type === "文章写作" && essayView === "drill")} onClick={submit}><Sparkles size={16}/>{submitting ? question.type === "文章写作" ? "作文诊断中…" : "批改中…" : question.type === "文章写作" ? "提交五维作文批改" : "提交批改"}</button>
          </div>
        </div>

        <div
          className="practice-result-resizer"
          role="separator"
          aria-label="调整答题区与批改结果区高度"
          aria-orientation="horizontal"
          aria-valuenow={Math.round(resultDockHeight)}
          tabIndex={0}
          onPointerDown={startResultDockResize}
          onPointerMove={moveResultDockResize}
          onPointerUp={finishResultDockResize}
          onPointerCancel={finishResultDockResize}
          onKeyDown={resizeResultDockWithKeyboard}
        ><GripHorizontal size={16}/><span>拖动调整批改区高度</span></div>

        <section className={`practice-result-dock ${resultDockCollapsed ? "is-collapsed" : ""}`}>
          <div className="practice-result-heading"><div><strong>{question.type === "文章写作" ? "大作文五维诊断" : "批改结果"}</strong><span>{review ? question.type === "文章写作" ? "立意、结构、论证、材料、表达已独立评分" : "本题已完成批改，可展开查看全部失分点" : "暂不使用AI时可以收起此区域"}</span></div><button type="button" onClick={() => setResultDockCollapsed(value => !value)} aria-expanded={!resultDockCollapsed}>{resultDockCollapsed ? <><ChevronUp size={14}/>展开</> : <><ChevronDown size={14}/>收起</>}</button></div>
          <div className="practice-result-scroll">
            {review ? <ReviewPanel review={review}/> : submitError ? <div className="practice-result-error">{submitError}</div> : <ResultEmpty/>}
          </div>
        </section>
      </section>
    </div>
  </div>;
}
