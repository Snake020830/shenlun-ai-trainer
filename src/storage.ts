import type { Draft, TrainingRecord } from "./types";

const DRAFT_KEY = "shenlun:drafts:v1";
const HISTORY_KEY = "shenlun:history:v1";

function readJson<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

export const persistence = {
  getDraft(questionId: string): Draft | null {
    const drafts = readJson<Record<string, Draft>>(DRAFT_KEY, {});
    return drafts[questionId] ?? null;
  },
  saveDraft(draft: Draft) {
    const drafts = readJson<Record<string, Draft>>(DRAFT_KEY, {});
    drafts[draft.questionId] = draft;
    localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts));
  },
  listHistory(): TrainingRecord[] {
    return readJson<TrainingRecord[]>(HISTORY_KEY, []);
  },
  addHistory(record: TrainingRecord) {
    const records = readJson<TrainingRecord[]>(HISTORY_KEY, []);
    localStorage.setItem(HISTORY_KEY, JSON.stringify([record, ...records].slice(0, 100)));
  }
};

// V0.1 先通过统一 persistence 接口跑通本地闭环。
// Tauri SQLite 适配器将在数据 schema 冻结后替换此实现，UI 不直接依赖 localStorage。
