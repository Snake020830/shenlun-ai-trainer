import { isTauri } from "@tauri-apps/api/core";
import type Database from "@tauri-apps/plugin-sql";
import type {
  Difficulty,
  Draft,
  LocalQuestionInput,
  MockReview,
  Question,
  QuestionType,
  TrainingRecord
} from "./types";

const DATABASE_URL = "sqlite:shenlun-trainer.db";
const DRAFT_KEY = "shenlun:drafts:v1";
const HISTORY_KEY = "shenlun:history:v1";
const QUESTIONS_KEY = "shenlun:questions:v1";
const LEGACY_MIGRATION_KEY = "legacy_localstorage_migrated_v1";

let databasePromise: Promise<Database> | null = null;
let sqliteUnavailable = false;

interface MetaRow {
  value: string;
}

interface QuestionRow {
  id: string;
  title: string;
  year: number;
  region: string;
  type: string;
  difficulty: string;
  score: number;
  word_limit: number;
  prompt: string;
  tags_json: string;
  source: string;
  created_at: string;
}

interface MaterialRow {
  id: string;
  question_id: string;
  label: string;
  content: string;
  sort_order: number;
}

interface DraftRow {
  question_id: string;
  answer: string;
  updated_at: string;
}

interface TrainingRow {
  id: string;
  question_id: string;
  title_snapshot: string;
  score: number;
  max_score: number;
  answer: string;
  review_json: string | null;
  submitted_at: string;
  submitted_at_display: string;
}

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

function parseReview(value: string | null): MockReview | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as MockReview;
  } catch {
    return undefined;
  }
}

async function getDatabase(): Promise<Database | null> {
  if (!isTauri() || sqliteUnavailable) return null;
  if (!databasePromise) {
    databasePromise = import("@tauri-apps/plugin-sql")
      .then(({ default: DatabaseApi }) => DatabaseApi.load(DATABASE_URL))
      .catch(error => {
        sqliteUnavailable = true;
        databasePromise = null;
        console.error("SQLite initialization failed; falling back to localStorage.", error);
        return null as unknown as Database;
      });
  }
  const database = await databasePromise;
  return sqliteUnavailable ? null : database;
}

async function upsertQuestion(db: Database, question: Question) {
  await db.execute(
    `INSERT INTO questions
      (id, title, year, region, type, difficulty, score, word_limit, prompt, tags_json, source, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT(id) DO UPDATE SET
       title=excluded.title, year=excluded.year, region=excluded.region, type=excluded.type,
       difficulty=excluded.difficulty, score=excluded.score, word_limit=excluded.word_limit,
       prompt=excluded.prompt, tags_json=excluded.tags_json, source=excluded.source`,
    [
      question.id,
      question.title,
      question.year,
      question.region,
      question.type,
      question.difficulty,
      question.score,
      question.wordLimit,
      question.prompt,
      JSON.stringify(question.tags),
      question.source ?? "local",
      question.createdAt ?? new Date().toISOString()
    ]
  );
  await db.execute("DELETE FROM materials WHERE question_id = $1", [question.id]);
  for (const [index, material] of question.materials.entries()) {
    await db.execute(
      `INSERT INTO materials (id, question_id, label, content, sort_order)
       VALUES ($1,$2,$3,$4,$5)`,
      [material.id, question.id, material.label, material.content, index]
    );
  }
}

async function migrateLegacyLocalStorage(db: Database) {
  const migrationRows = await db.select<MetaRow[]>(
    "SELECT value FROM app_meta WHERE key = $1 LIMIT 1",
    [LEGACY_MIGRATION_KEY]
  );
  if (migrationRows[0]?.value === "1") return;

  const localQuestions = readJson<Question[]>(QUESTIONS_KEY, []);
  const localDrafts = readJson<Record<string, Draft>>(DRAFT_KEY, {});
  const localHistory = readJson<TrainingRecord[]>(HISTORY_KEY, []);

  for (const question of localQuestions) await upsertQuestion(db, question);
  for (const draft of Object.values(localDrafts)) {
    await db.execute(
      `INSERT INTO drafts (question_id, answer, updated_at) VALUES ($1,$2,$3)
       ON CONFLICT(question_id) DO UPDATE SET answer=excluded.answer, updated_at=excluded.updated_at`,
      [draft.questionId, draft.answer, draft.updatedAt]
    );
  }
  for (const record of localHistory) {
    await db.execute(
      `INSERT OR IGNORE INTO training_records
       (id, question_id, title_snapshot, score, max_score, answer, review_json, submitted_at, submitted_at_display)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        record.id,
        record.questionId,
        record.title,
        record.score,
        record.maxScore,
        record.answer,
        record.review ? JSON.stringify(record.review) : null,
        record.submittedAtIso ?? record.submittedAt,
        record.submittedAt
      ]
    );
  }

  await db.execute(
    `INSERT INTO app_meta (key, value) VALUES ($1, '1')
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
    [LEGACY_MIGRATION_KEY]
  );
}

function createQuestion(input: LocalQuestionInput): Question {
  const now = new Date().toISOString();
  return {
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
}

export const persistence = {
  async initialize(): Promise<"sqlite" | "localStorage"> {
    const db = await getDatabase();
    if (!db) return "localStorage";
    await migrateLegacyLocalStorage(db);
    return "sqlite";
  },

  async getDraft(questionId: string): Promise<Draft | null> {
    const db = await getDatabase();
    if (!db) {
      const drafts = readJson<Record<string, Draft>>(DRAFT_KEY, {});
      return drafts[questionId] ?? null;
    }
    const rows = await db.select<DraftRow[]>(
      "SELECT question_id, answer, updated_at FROM drafts WHERE question_id = $1 LIMIT 1",
      [questionId]
    );
    const row = rows[0];
    return row ? { questionId: row.question_id, answer: row.answer, updatedAt: row.updated_at } : null;
  },

  async saveDraft(draft: Draft): Promise<void> {
    const db = await getDatabase();
    if (!db) {
      const drafts = readJson<Record<string, Draft>>(DRAFT_KEY, {});
      drafts[draft.questionId] = draft;
      writeJson(DRAFT_KEY, drafts);
      return;
    }
    await db.execute(
      `INSERT INTO drafts (question_id, answer, updated_at) VALUES ($1,$2,$3)
       ON CONFLICT(question_id) DO UPDATE SET answer=excluded.answer, updated_at=excluded.updated_at`,
      [draft.questionId, draft.answer, draft.updatedAt]
    );
  },

  async listHistory(): Promise<TrainingRecord[]> {
    const db = await getDatabase();
    if (!db) return readJson<TrainingRecord[]>(HISTORY_KEY, []);
    const rows = await db.select<TrainingRow[]>(
      `SELECT id, question_id, title_snapshot, score, max_score, answer, review_json,
              submitted_at, submitted_at_display
       FROM training_records ORDER BY submitted_at DESC LIMIT 200`
    );
    return rows.map(row => ({
      id: row.id,
      questionId: row.question_id,
      title: row.title_snapshot,
      score: row.score,
      maxScore: row.max_score,
      answer: row.answer,
      review: parseReview(row.review_json),
      submittedAtIso: row.submitted_at,
      submittedAt: row.submitted_at_display
    }));
  },

  async addHistory(record: TrainingRecord): Promise<void> {
    const db = await getDatabase();
    if (!db) {
      const records = readJson<TrainingRecord[]>(HISTORY_KEY, []);
      writeJson(HISTORY_KEY, [record, ...records].slice(0, 200));
      return;
    }
    await db.execute(
      `INSERT INTO training_records
       (id, question_id, title_snapshot, score, max_score, answer, review_json, submitted_at, submitted_at_display)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        record.id,
        record.questionId,
        record.title,
        record.score,
        record.maxScore,
        record.answer,
        record.review ? JSON.stringify(record.review) : null,
        record.submittedAtIso ?? new Date().toISOString(),
        record.submittedAt
      ]
    );
  },

  async listImportedQuestions(): Promise<Question[]> {
    const db = await getDatabase();
    if (!db) return readJson<Question[]>(QUESTIONS_KEY, []);

    const questionRows = await db.select<QuestionRow[]>(
      `SELECT id, title, year, region, type, difficulty, score, word_limit, prompt,
              tags_json, source, created_at
       FROM questions WHERE source = 'local' ORDER BY created_at DESC`
    );
    const materialRows = await db.select<MaterialRow[]>(
      `SELECT id, question_id, label, content, sort_order
       FROM materials ORDER BY question_id, sort_order`
    );
    const materialsByQuestion = new Map<string, MaterialRow[]>();
    for (const material of materialRows) {
      const group = materialsByQuestion.get(material.question_id) ?? [];
      group.push(material);
      materialsByQuestion.set(material.question_id, group);
    }

    return questionRows.map(row => ({
      id: row.id,
      title: row.title,
      year: row.year,
      region: row.region,
      type: row.type as QuestionType,
      difficulty: row.difficulty as Difficulty,
      score: row.score,
      wordLimit: row.word_limit,
      prompt: row.prompt,
      tags: JSON.parse(row.tags_json) as string[],
      source: row.source === "builtin" ? "builtin" : "local",
      createdAt: row.created_at,
      materials: (materialsByQuestion.get(row.id) ?? []).map(material => ({
        id: material.id,
        label: material.label,
        content: material.content
      }))
    }));
  },

  async addImportedQuestion(input: LocalQuestionInput): Promise<Question> {
    const question = createQuestion(input);
    const db = await getDatabase();
    if (!db) {
      const existing = readJson<Question[]>(QUESTIONS_KEY, []);
      writeJson(QUESTIONS_KEY, [question, ...existing]);
      return question;
    }
    await upsertQuestion(db, question);
    return question;
  }
};

// Desktop runtime uses SQLite through Tauri's SQL plugin. Browser-only Vite development
// falls back to localStorage so UI work remains lightweight and does not require a Rust shell.
