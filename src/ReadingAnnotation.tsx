import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { anchorInkPoint, distanceToInkStroke, resolveInkPolyline } from "./practiceInkAnchors";
import type { PracticeHighlightColor, PracticeInkStroke, PracticeTextAnnotation } from "./practiceSessionStore";

export type ReadingAnnotationMode = PracticeTextAnnotation["type"] | null;
export type ReadingInkMode = "pen" | "eraser" | null;

export const READING_HIGHLIGHT_COLORS: Array<{ value: PracticeHighlightColor; label: string; hint: string }> = [
  { value: "yellow", label: "核心", hint: "主题、主体、分类、总括句" },
  { value: "red", label: "问题", hint: "问题表现、短板、矛盾、隐患" },
  { value: "blue", label: "原因", hint: "原因、条件、影响路径、制约因素" },
  { value: "green", label: "做法", hint: "措施、制度、执行动作、解决方案" },
  { value: "purple", label: "成效", hint: "结果、意义、作用、经验启示" }
];

export interface ReadingAiMark {
  start: number;
  end: number;
  type: "problem" | "practice" | "effect" | "insight";
  keyPoint: string;
  index: number;
}

export function cycleReadingHighlightColor(current: PracticeHighlightColor, direction: 1 | -1): PracticeHighlightColor {
  const currentIndex = READING_HIGHLIGHT_COLORS.findIndex(item => item.value === current);
  const nextIndex = (currentIndex + direction + READING_HIGHLIGHT_COLORS.length) % READING_HIGHLIGHT_COLORS.length;
  return READING_HIGHLIGHT_COLORS[nextIndex].value;
}

function selectionOffset(root: HTMLElement, node: Node, offset: number): number {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  return range.toString().length;
}

export function getReadingSelectionRange(root: HTMLElement, event: MouseEvent<HTMLElement>): { start: number; end: number } | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const start = selectionOffset(root, range.startContainer, range.startOffset);
  const end = selectionOffset(root, range.endContainer, range.endOffset);
  if (end <= start) return null;
  event.preventDefault();
  selection.removeAllRanges();
  return { start, end };
}

function renderReadingText(
  content: string,
  annotations: PracticeTextAnnotation[],
  aiMarks: ReadingAiMark[],
  selectedAnnotationId: string | null,
  onSelectAnnotation: (id: string) => void
): ReactNode {
  if (!annotations.length && !aiMarks.length) return content;
  const boundaries = new Set<number>([0, content.length]);
  for (const item of annotations) {
    boundaries.add(Math.max(0, Math.min(content.length, item.start)));
    boundaries.add(Math.max(0, Math.min(content.length, item.end)));
  }
  for (const item of aiMarks) {
    boundaries.add(Math.max(0, Math.min(content.length, item.start)));
    boundaries.add(Math.max(0, Math.min(content.length, item.end)));
  }
  const points = [...boundaries].sort((a, b) => a - b);
  return points.slice(0, -1).map((start, index) => {
    const end = points[index + 1];
    const text = content.slice(start, end);
    const active = annotations.filter(item => item.start < end && item.end > start);
    const ai = aiMarks.filter(item => item.start < end && item.end > start);
    if (!active.length && !ai.length) return text;
    const activeHighlight = [...active].reverse().find(item => item.type === "highlight");
    const className = [
      activeHighlight ? `material-highlight material-highlight-${activeHighlight.color ?? "blue"}` : "",
      active.some(item => item.type === "underline") ? "material-underline" : "",
      active.some(item => item.id === selectedAnnotationId) ? "material-mark-selected" : "",
      ai.length ? `material-mark mark-${ai[0].type}` : ""
    ].filter(Boolean).join(" ");
    const aiAtStart = ai.find(item => item.start === start);
    return <span
      key={`${start}-${end}`}
      className={className}
      role={active.length ? "button" : undefined}
      tabIndex={active.length ? 0 : undefined}
      title={active.length ? "点击选中此标记，可单独删除" : ai[0]?.keyPoint}
      onClick={active.length ? event => { event.stopPropagation(); onSelectAnnotation(active[active.length - 1].id); } : undefined}
    >{text}{aiAtStart && <sup>{aiAtStart.index + 1}</sup>}</span>;
  });
}

function AnchoredInkLayer({ textRef, strokes, layoutKey }: {
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

export function ReadingTextStage({
  materialId,
  content,
  fontSize,
  annotations,
  aiMarks,
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
  aiMarks: ReadingAiMark[];
  selectedAnnotationId: string | null;
  annotationMode: ReadingAnnotationMode;
  inkMode: ReadingInkMode;
  strokes: PracticeInkStroke[];
  onAnnotateSelection: (materialId: string, event: MouseEvent<HTMLElement>) => void;
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

  function beginInk(event: PointerEvent<HTMLDivElement>) {
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
    const stroke: PracticeInkStroke = { id: crypto.randomUUID(), materialId, color: "graphite", width: 2.2, points: [point] };
    draftRef.current = stroke;
    lastClientPoint.current = { x: event.clientX, y: event.clientY };
    setDraftStroke(stroke);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveInk(event: PointerEvent<HTMLDivElement>) {
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

  function finishInk(event: PointerEvent<HTMLDivElement>) {
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
      className="exam-material-text daily-source-text"
      style={{ fontSize: `${fontSize}px` }}
      onMouseUp={event => onAnnotateSelection(materialId, event)}
      onClick={() => { if (!inkMode) onClearAnnotationSelection(); }}
    >{renderReadingText(content, annotations, aiMarks, selectedAnnotationId, onSelectAnnotation)}</p>
    <AnchoredInkLayer textRef={textRef} strokes={visibleStrokes} layoutKey={`${fontSize}:${content.length}:${annotationLayoutKey}`}/>
  </div>;
}
