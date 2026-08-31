import type { QuestionType } from "./types";

export const EXAM_GRID_COLUMNS = 25;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Practice pacing heuristic, not an official exam time rule.
 * It deliberately follows the question's writing budget so a newly opened task
 * starts with a useful countdown without manual setup.
 */
export function recommendedPracticeMinutes(wordLimit: number, type?: QuestionType): number {
  const normalizedLimit = Number.isFinite(wordLimit) && wordLimit > 0 ? wordLimit : 300;
  const stepped = Math.ceil((10 + normalizedLimit / 20) / 5) * 5;
  const minimum = type === "文章写作" ? 60 : 15;
  return clamp(stepped, minimum, 70);
}

export function recommendedPracticeSeconds(wordLimit: number, type?: QuestionType): number {
  return recommendedPracticeMinutes(wordLimit, type) * 60;
}

/**
 * Visual answer-sheet paper size. The actual grading word limit is never changed.
 * Paper capacity rounds upward to a clean hundred so common exam limits render as:
 * 300 -> 300, 350 -> 400, 550 -> 600.
 */
export function answerSheetDisplayLimit(wordLimit: number): number {
  const safeLimit = Math.max(1, Math.floor(wordLimit));
  return Math.ceil(safeLimit / 100) * 100;
}

export function answerSheetRows(wordLimit: number, columns = EXAM_GRID_COLUMNS): number {
  const safeColumns = Math.max(1, Math.floor(columns));
  return Math.ceil(answerSheetDisplayLimit(wordLimit) / safeColumns);
}

export function answerSheetCapacity(wordLimit: number, columns = EXAM_GRID_COLUMNS): number {
  return answerSheetRows(wordLimit, columns) * Math.max(1, Math.floor(columns));
}

/**
 * Sparse answer-sheet side markers. Keep the writing area clean and show only
 * 200-character milestones (200 / 400 / 600 ...), never overlaying the text grid.
 */
export function answerSheetMarkers(wordLimit: number): number[] {
  const capacity = answerSheetCapacity(wordLimit);
  const markers: number[] = [];
  for (let value = 200; value <= capacity; value += 200) markers.push(value);
  return markers;
}

export type ExamGridTokenKind = "text" | "enumerator" | "ascii" | "tab";

export interface ExamGridToken {
  text: string;
  start: number;
  end: number;
  cellIndex: number;
  kind: ExamGridTokenKind;
}

export interface ExamGridLayout {
  tokens: ExamGridToken[];
  occupiedCells: number;
}

function pushToken(
  tokens: ExamGridToken[],
  text: string,
  start: number,
  end: number,
  cellIndex: number,
  kind: ExamGridTokenKind
) {
  tokens.push({ text, start, end, cellIndex, kind });
}

/**
 * Convert submitted text into the cells a handwritten answer-sheet simulation
 * would occupy. This is the single source of truth for both the visual grid and
 * the occupancy counter.
 *
 * Rules intentionally remain conservative and are visual-only:
 * - Han characters and ordinary punctuation: one cell each;
 * - list enumerators such as `1.` / `1、` / `(1)` / `（1）`: one cell;
 * - consecutive ASCII letters or digits: two characters per cell;
 * - a newline advances to the next row;
 * - a tab reserves two cells.
 */
export function buildExamGridLayout(text: string, columns = EXAM_GRID_COLUMNS): ExamGridLayout {
  const safeColumns = Math.max(1, Math.floor(columns));
  const tokens: ExamGridToken[] = [];
  let cellIndex = 0;
  let index = 0;
  let rowHasContent = false;

  while (index < text.length) {
    const current = text[index];
    if (current === "\r") {
      index += 1;
      continue;
    }

    if (current === "\n") {
      const remainder = cellIndex % safeColumns;
      if (remainder > 0) {
        cellIndex += safeColumns - remainder;
      } else if (!rowHasContent) {
        cellIndex += safeColumns;
      }
      rowHasContent = false;
      index += 1;
      continue;
    }

    if (current === "\t") {
      pushToken(tokens, "", index, index + 1, cellIndex, "tab");
      cellIndex += 2;
      rowHasContent = true;
      index += 1;
      continue;
    }

    const remainder = text.slice(index);
    const enumerator = remainder.match(/^(?:\d{1,2}[.．、]|[（(]\d{1,2}[）)])/u)?.[0];
    if (enumerator) {
      pushToken(tokens, enumerator, index, index + enumerator.length, cellIndex, "enumerator");
      cellIndex += 1;
      rowHasContent = true;
      index += enumerator.length;
      continue;
    }

    const asciiRun = remainder.match(/^[A-Za-z0-9]+/u)?.[0];
    if (asciiRun) {
      for (let offset = 0; offset < asciiRun.length; offset += 2) {
        const piece = asciiRun.slice(offset, offset + 2);
        pushToken(tokens, piece, index + offset, index + offset + piece.length, cellIndex, "ascii");
        cellIndex += 1;
      }
      rowHasContent = true;
      index += asciiRun.length;
      continue;
    }

    pushToken(tokens, current, index, index + 1, cellIndex, "text");
    cellIndex += 1;
    rowHasContent = true;
    index += 1;
  }

  return { tokens, occupiedCells: cellIndex };
}

export function countExamGridCells(text: string, columns = EXAM_GRID_COLUMNS): number {
  return buildExamGridLayout(text, columns).occupiedCells;
}

/** Resolve a text selection offset to the visual answer-sheet cell containing it. */
export function examGridCellForOffset(text: string, offset: number, columns = EXAM_GRID_COLUMNS): number {
  const safeOffset = Math.max(0, Math.min(text.length, Math.floor(offset)));
  const layout = buildExamGridLayout(text, columns);
  for (const token of layout.tokens) {
    if (safeOffset <= token.start) return token.cellIndex;
    if (safeOffset < token.end) return token.cellIndex;
    if (safeOffset === token.end) return token.cellIndex + 1;
  }
  return layout.occupiedCells;
}

/** Resolve a clicked visual cell back to a stable insertion offset in the source text. */
export function examGridOffsetForCell(text: string, cellIndex: number, columns = EXAM_GRID_COLUMNS): number {
  const safeCell = Math.max(0, Math.floor(cellIndex));
  const layout = buildExamGridLayout(text, columns);
  const exact = layout.tokens.find(token => token.cellIndex === safeCell);
  if (exact) return exact.start;
  const next = layout.tokens.find(token => token.cellIndex > safeCell);
  return next?.start ?? text.length;
}
