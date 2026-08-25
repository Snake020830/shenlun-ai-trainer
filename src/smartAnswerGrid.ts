import {
  buildExamGridLayout,
  examGridCellForOffset,
  examGridOffsetForCell,
  EXAM_GRID_COLUMNS
} from "./practiceExamModel";

type EnhancedStage = HTMLElement & { __smartAnswerGridCleanup?: () => void };

function readRows(stage: HTMLElement): number {
  const raw = getComputedStyle(stage).getPropertyValue("--answer-rows").trim();
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

function ensureCellCount(grid: HTMLElement, count: number) {
  while (grid.children.length < count) {
    const cell = document.createElement("span");
    cell.className = "smart-answer-cell";
    cell.dataset.cellIndex = String(grid.children.length);
    grid.appendChild(cell);
  }
  while (grid.children.length > count) grid.lastElementChild?.remove();
}

function enhanceStage(stage: EnhancedStage) {
  if (stage.dataset.smartAnswerGrid === "1") return;
  const textarea = stage.querySelector<HTMLTextAreaElement>(".grid-answer-input");
  if (!textarea) return;
  const input: HTMLTextAreaElement = textarea;

  stage.dataset.smartAnswerGrid = "1";
  stage.classList.add("smart-grid-enhanced");

  const grid = document.createElement("div");
  grid.className = "smart-answer-grid";
  grid.setAttribute("aria-hidden", "true");
  stage.insertBefore(grid, input);

  let lastValue = "";
  let lastSelection = -1;
  let lastRows = -1;

  function render(force = false) {
    const rows = readRows(stage);
    const value = input.value;
    const selection = input.selectionStart ?? value.length;
    if (!force && value === lastValue && selection === lastSelection && rows === lastRows) return;

    lastValue = value;
    lastSelection = selection;
    lastRows = rows;

    const capacity = rows * EXAM_GRID_COLUMNS;
    ensureCellCount(grid, capacity);
    const cells = Array.from(grid.children) as HTMLElement[];
    for (const cell of cells) {
      cell.textContent = "";
      cell.className = "smart-answer-cell";
    }

    const layout = buildExamGridLayout(value, EXAM_GRID_COLUMNS);
    for (const token of layout.tokens) {
      if (token.cellIndex < 0 || token.cellIndex >= capacity) continue;
      const cell = cells[token.cellIndex];
      cell.textContent = token.text === " " ? "\u00a0" : token.text;
      cell.classList.add(`token-${token.kind}`);
      if (token.text.length > 1) cell.classList.add("token-compact");
      if (token.text.length > 2) cell.classList.add("token-very-compact");
      cell.dataset.sourceStart = String(token.start);
      cell.dataset.sourceEnd = String(token.end);
    }

    const caretCell = Math.min(capacity - 1, examGridCellForOffset(value, selection, EXAM_GRID_COLUMNS));
    if (document.activeElement === input && caretCell >= 0 && caretCell < capacity) {
      cells[caretCell]?.classList.add("is-caret-cell");
    }

    stage.classList.toggle("smart-grid-overflow", layout.occupiedCells > capacity);
    stage.dataset.gridOccupied = String(layout.occupiedCells);
  }

  function focusCell(cellIndex: number) {
    const offset = examGridOffsetForCell(input.value, cellIndex, EXAM_GRID_COLUMNS);
    input.focus({ preventScroll: true });
    input.setSelectionRange(offset, offset);
    render(true);
  }

  function onGridPointerDown(event: PointerEvent) {
    const target = (event.target as HTMLElement | null)?.closest<HTMLElement>(".smart-answer-cell");
    if (!target) return;
    event.preventDefault();
    focusCell(Number(target.dataset.cellIndex ?? 0));
  }

  const renderNow = () => render(true);
  grid.addEventListener("pointerdown", onGridPointerDown);
  input.addEventListener("input", renderNow);
  input.addEventListener("select", renderNow);
  input.addEventListener("keyup", renderNow);
  input.addEventListener("click", renderNow);
  input.addEventListener("focus", renderNow);
  input.addEventListener("blur", renderNow);
  input.addEventListener("compositionupdate", renderNow);
  input.addEventListener("compositionend", renderNow);

  const poll = window.setInterval(() => {
    if (!stage.isConnected) {
      stage.__smartAnswerGridCleanup?.();
      return;
    }
    render(false);
  }, 120);
  render(true);

  stage.__smartAnswerGridCleanup = () => {
    window.clearInterval(poll);
    grid.removeEventListener("pointerdown", onGridPointerDown);
    input.removeEventListener("input", renderNow);
    input.removeEventListener("select", renderNow);
    input.removeEventListener("keyup", renderNow);
    input.removeEventListener("click", renderNow);
    input.removeEventListener("focus", renderNow);
    input.removeEventListener("blur", renderNow);
    input.removeEventListener("compositionupdate", renderNow);
    input.removeEventListener("compositionend", renderNow);
    grid.remove();
    stage.removeAttribute("data-smart-answer-grid");
    stage.classList.remove("smart-grid-enhanced", "smart-grid-overflow");
    stage.__smartAnswerGridCleanup = undefined;
  };
}

function scan() {
  document.querySelectorAll<EnhancedStage>(".grid-answer-stage").forEach(enhanceStage);
}

const observer = new MutationObserver(scan);

export function installSmartAnswerGrid() {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      scan();
      observer.observe(document.body, { childList: true, subtree: true });
    }, { once: true });
    return;
  }
  scan();
  observer.observe(document.body, { childList: true, subtree: true });
}

installSmartAnswerGrid();
