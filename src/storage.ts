import type { Draft, LocalQuestionInput, Question, TrainingRecord } from "./types";

const DRAFT_KEY = "shenlun:drafts:v1";
const HISTORY_KEY = "shenlun:history:v1";
const QUESTIONS_KEY = "shenlun:questions:v1";

function readJson<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

export const persistence = {
  getDraft(questionId: string): Draft | null {
    const drafts = readJson<Record<string, Draft>>(DRAFT_KEY, {});
    return drafts[questionId] ?? null;
  },
  saveDraft(draft: Draft) {
    const drafts = readJson<Record<string, Draft>>(DRAFT_KEY, {});
    drafts[draft.questionId] = draft;
    writeJson(DRAFT_KEY, drafts);
  },
  listHistory(): TrainingRecord[] {
    return readJson<TrainingRecord[]>(HISTORY_KEY, []);
  },
  addHistory(record: TrainingRecord) {
    const records = readJson<TrainingRecord[]>(HISTORY_KEY, []);
    writeJson(HISTORY_KEY, [record, ...records].slice(0, 200));
  },
  listImportedQuestions(): Question[] {
    return readJson<Question[]>(QUESTIONS_KEY, []);
  },
  addImportedQuestion(input: LocalQuestionInput): Question {
    const now = new Date().toISOString();
    const question: Question = {
      id: `local-${crypto.randomUUID()}`,
      title: input.title.trim(),
      year: input.year,
      region: input.region.trim() || "本地导入",
      type: input.type,
      difficulty: input.difficulty,
      score: input.score,
      wordLimit: input.wordLimit,
      prompt: input.prompt.trim(),
      tags: input.tags,
      source: "local",
      createdAt: now,
      materials: input.materialText
        .split(/\n\s*\n/)
        .map(block => block.trim())
        .filter(Boolean)
        .map((content, index) => ({ id: `m${index + 1}`, label: `材料 ${index + 1}`, content }))
    };
    const existing = readJson<Question[]>(QUESTIONS_KEY, []);
    writeJson(QUESTIONS_KEY, [question, ...existing]);
    return question;
  }
};

// V0.1 通过统一 persistence 接口跑通本地闭环。
// UI 不直接依赖 localStorage；后续 Tauri SQLite 适配器只需实现同一组方法。
