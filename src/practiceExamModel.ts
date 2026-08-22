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

export function answerSheetRows(wordLimit: number, columns = EXAM_GRID_COLUMNS): number {
  const safeColumns = Math.max(1, Math.floor(columns));
  const safeLimit = Math.max(1, Math.floor(wordLimit));
  return Math.ceil(safeLimit / safeColumns);
}

export function answerSheetCapacity(wordLimit: number, columns = EXAM_GRID_COLUMNS): number {
  return answerSheetRows(wordLimit, columns) * Math.max(1, Math.floor(columns));
}

export function answerSheetMarkers(wordLimit: number): number[] {
  const safeLimit = Math.max(1, Math.floor(wordLimit));
  const markers: number[] = [];
  for (let value = 100; value < safeLimit; value += 100) markers.push(value);
  if (!markers.includes(safeLimit)) markers.push(safeLimit);
  return markers;
}

function isAsciiAlphaNumeric(value: string): boolean {
  return /^[A-Za-z0-9]+$/.test(value);
}

/**
 * Visual answer-sheet occupancy only. It must not be used as the grader's word
 * count. Common handwriting conventions are simulated conservatively:
 * - Han characters / punctuation: one cell each;
 * - short numeric enumerators such as `1.` / `1、`: one cell;
 * - consecutive ASCII letters or digits: two characters per cell;
 * - an explicit newline advances to the next answer-sheet row.
 */
export function countExamGridCells(text: string, columns = EXAM_GRID_COLUMNS): number {
  const safeColumns = Math.max(1, Math.floor(columns));
  let cells = 0;
  let index = 0;

  while (index < text.length) {
    const current = text[index];
    if (current === "\r") {
      index += 1;
      continue;
    }
    if (current === "\n") {
      const remainder = cells % safeColumns;
      cells += remainder === 0 ? safeColumns : safeColumns - remainder;
      index += 1;
      continue;
    }
    if (current === "\t") {
      cells += 2;
      index += 1;
      continue;
    }

    const remainder = text.slice(index);
    const enumerator = remainder.match(/^\d{1,2}[.．、]/u);
    if (enumerator) {
      cells += 1;
      index += enumerator[0].length;
      continue;
    }

    const asciiRun = remainder.match(/^[A-Za-z0-9]+/u)?.[0];
    if (asciiRun && isAsciiAlphaNumeric(asciiRun)) {
      cells += Math.ceil(asciiRun.length / 2);
      index += asciiRun.length;
      continue;
    }

    cells += 1;
    index += 1;
  }

  return cells;
}
