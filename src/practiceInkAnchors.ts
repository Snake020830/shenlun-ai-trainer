import type { PracticeInkPoint, PracticeInkStroke } from "./practiceSessionStore";

interface TextPosition {
  node: Text;
  offset: number;
}

interface ResolvedInkPoint {
  x: number;
  y: number;
}

type CaretDocument = Document & {
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
};

function selectionOffset(root: HTMLElement, node: Node, offset: number): number {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  return range.toString().length;
}

function textPositionAtOffset(root: HTMLElement, requestedOffset: number): TextPosition | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let total = 0;
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    nodes.push(node);
    const nextTotal = total + node.data.length;
    if (requestedOffset <= nextTotal) {
      return { node, offset: Math.max(0, Math.min(node.data.length, requestedOffset - total)) };
    }
    total = nextTotal;
  }
  const last = nodes.at(-1);
  return last ? { node: last, offset: last.data.length } : null;
}

function caretRect(position: TextPosition): DOMRect | null {
  const range = document.createRange();
  try {
    range.setStart(position.node, position.offset);
    range.collapse(true);
    const collapsed = range.getBoundingClientRect();
    if (collapsed.height > 0) return collapsed;

    if (position.offset > 0) {
      range.setStart(position.node, position.offset - 1);
      range.setEnd(position.node, position.offset);
      const previous = range.getBoundingClientRect();
      if (previous.height > 0) {
        return new DOMRect(previous.right, previous.top, 0, previous.height);
      }
    }
    if (position.offset < position.node.data.length) {
      range.setStart(position.node, position.offset);
      range.setEnd(position.node, position.offset + 1);
      const next = range.getBoundingClientRect();
      if (next.height > 0) {
        return new DOMRect(next.left, next.top, 0, next.height);
      }
    }
  } catch {
    return null;
  }
  return null;
}

function caretHitFromPoint(clientX: number, clientY: number): { node: Node; offset: number } | null {
  const doc = document as CaretDocument;
  const position = doc.caretPositionFromPoint?.(clientX, clientY);
  if (position) return { node: position.offsetNode, offset: position.offset };
  const range = doc.caretRangeFromPoint?.(clientX, clientY);
  return range ? { node: range.startContainer, offset: range.startOffset } : null;
}

export function anchorInkPoint(root: HTMLElement, clientX: number, clientY: number): PracticeInkPoint | null {
  const rootRect = root.getBoundingClientRect();
  if (clientX < rootRect.left - 24 || clientX > rootRect.right + 24 || clientY < rootRect.top - 24 || clientY > rootRect.bottom + 24) {
    return null;
  }

  const hit = caretHitFromPoint(clientX, clientY);
  if (!hit || (!root.contains(hit.node) && hit.node !== root)) return null;

  let offset: number;
  try {
    offset = selectionOffset(root, hit.node, hit.offset);
  } catch {
    return null;
  }
  const position = textPositionAtOffset(root, offset);
  if (!position) return null;
  const rect = caretRect(position);
  if (!rect) return null;
  return {
    offset,
    dx: Math.max(-256, Math.min(256, clientX - rect.left)),
    dy: Math.max(-256, Math.min(256, clientY - rect.top))
  };
}

export function resolveInkPoint(root: HTMLElement, point: PracticeInkPoint): ResolvedInkPoint | null {
  const position = textPositionAtOffset(root, point.offset);
  if (!position) return null;
  const caret = caretRect(position);
  if (!caret) return null;
  const rootRect = root.getBoundingClientRect();
  return {
    x: caret.left - rootRect.left + point.dx,
    y: caret.top - rootRect.top + point.dy
  };
}

export function resolveInkPolyline(root: HTMLElement, stroke: PracticeInkStroke): string {
  return stroke.points
    .map(point => resolveInkPoint(root, point))
    .filter((point): point is ResolvedInkPoint => Boolean(point))
    .map(point => `${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(" ");
}

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const lengthSquared = vx * vx + vy * vy;
  if (lengthSquared === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / lengthSquared));
  const x = ax + t * vx;
  const y = ay + t * vy;
  return Math.hypot(px - x, py - y);
}

export function distanceToInkStroke(root: HTMLElement, stroke: PracticeInkStroke, clientX: number, clientY: number): number {
  const rootRect = root.getBoundingClientRect();
  const targetX = clientX - rootRect.left;
  const targetY = clientY - rootRect.top;
  const points = stroke.points
    .map(point => resolveInkPoint(root, point))
    .filter((point): point is ResolvedInkPoint => Boolean(point));
  if (!points.length) return Number.POSITIVE_INFINITY;
  if (points.length === 1) return Math.hypot(targetX - points[0].x, targetY - points[0].y);
  let nearest = Number.POSITIVE_INFINITY;
  for (let index = 1; index < points.length; index += 1) {
    nearest = Math.min(nearest, distanceToSegment(targetX, targetY, points[index - 1].x, points[index - 1].y));
  }
  return nearest;
}
