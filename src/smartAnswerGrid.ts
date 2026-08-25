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

function setNativeTextareaValue(input: HTMLTextAreaElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
  if (descriptor?.set) descriptor.set.call(input, value);
  else input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function fallbackCopy(text: string): boolean {
  const helper = document.createElement("textarea");
  helper.value = text;
  helper.setAttribute("readonly", "");
  helper.style.position = "fixed";
  helper.style.left = "-9999px";
  helper.style.top = "0";
  document.body.appendChild(helper);
  helper.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  helper.remove();
  return copied;
}

function flashButton(button: HTMLButtonElement, text: string, fallback: string) {
  window.clearTimeout(Number(button.dataset.resetTimer ?? 0));
  button.textContent = text;
  const timer = window.setTimeout(() => {
    button.textContent = fallback;
    delete button.dataset.resetTimer;
  }, 1400);
  button.dataset.resetTimer = String(timer);
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

  const answerWrap = stage.closest<HTMLElement>(".grid-answer-wrap");
  const answerLabel = answerWrap?.querySelector<HTMLElement>(".answer-paper-label") ?? null;
  const clipboardActions = document.createElement("div");
  clipboardActions.className = "answer-clipboard-actions";

  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.className = "answer-clipboard-button";
  copyButton.textContent = "复制全文";
  copyButton.title = "将当前完整答案复制到系统剪贴板";

  const pasteButton = document.createElement("button");
  pasteButton.type = "button";
  pasteButton.className = "answer-clipboard-button";
  pasteButton.textContent = "粘贴答案";
  pasteButton.title = "从系统剪贴板读取整段文字并写入当前答题卡";

  clipboardActions.append(copyButton, pasteButton);
  answerLabel?.appendChild(clipboardActions);

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

  async function onCopyAnswer() {
    const value = input.value;
    if (!value) {
      flashButton(copyButton, "暂无内容", "复制全文");
      return;
    }
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
      else if (!fallbackCopy(value)) throw new Error("copy unavailable");
      flashButton(copyButton, "已复制", "复制全文");
    } catch {
      if (fallbackCopy(value)) flashButton(copyButton, "已复制", "复制全文");
      else flashButton(copyButton, "复制失败", "复制全文");
    }
  }

  async function onPasteAnswer() {
    try {
      if (!navigator.clipboard?.readText) throw new Error("clipboard read unavailable");
      const text = await navigator.clipboard.readText();
      if (!text) {
        flashButton(pasteButton, "剪贴板为空", "粘贴答案");
        return;
      }
      setNativeTextareaValue(input, text);
      input.focus({ preventScroll: true });
      input.setSelectionRange(text.length, text.length);
      render(true);
      flashButton(pasteButton, "已粘贴", "粘贴答案");
    } catch {
      flashButton(pasteButton, "粘贴失败", "粘贴答案");
    }
  }

  const renderNow = () => render(true);
  grid.addEventListener("pointerdown", onGridPointerDown);
  copyButton.addEventListener("click", onCopyAnswer);
  pasteButton.addEventListener("click", onPasteAnswer);
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
    window.clearTimeout(Number(copyButton.dataset.resetTimer ?? 0));
    window.clearTimeout(Number(pasteButton.dataset.resetTimer ?? 0));
    grid.removeEventListener("pointerdown", onGridPointerDown);
    copyButton.removeEventListener("click", onCopyAnswer);
    pasteButton.removeEventListener("click", onPasteAnswer);
    input.removeEventListener("input", renderNow);
    input.removeEventListener("select", renderNow);
    input.removeEventListener("keyup", renderNow);
    input.removeEventListener("click", renderNow);
    input.removeEventListener("focus", renderNow);
    input.removeEventListener("blur", renderNow);
    input.removeEventListener("compositionupdate", renderNow);
    input.removeEventListener("compositionend", renderNow);
    clipboardActions.remove();
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
