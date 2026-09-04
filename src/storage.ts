import { invoke, isTauri } from "@tauri-apps/api/core";
import type Database from "@tauri-apps/plugin-sql";
import { createBenchmarkDraft } from "./grading/benchmark/createDraft";
import { validateReview } from "./grading/contracts";
import { questionPaperId, questionPaperLevel, questionPaperTitle } from "./examPaper";
import type { GradingBenchmarkCase } from "./grading/benchmark/types";
import type {
  Difficulty,
  Draft,
  LocalQuestionInput,
  MockReview,
  PaperLevel,
  Question,
  QuestionType,
  TrainingRecord
} from "./types";

const DATABASE_URL = "sqlite:shenlun-trainer.db";
const DRAFT_KEY = "shenlun:drafts:v1";
const HISTORY_KEY = "shenlun:history:v1";
const QUESTIONS_KEY = "shenlun:questions:v1";
const BENCHMARK_DRAFTS_KEY = "shenlun:benchmark-drafts:v1";
const PUBLIC_SETTINGS_KEY = "shenlun:public-settings:v1";
const LEGACY_MIGRATION_KEY = "legacy_localstorage_migrated_v1";
const PUBLIC_PAPER_REPAIR_KEY = "public_paper_materials_repaired_v2";
const PUBLIC_SETTING_PREFIX = "public:";

let databasePromise: Promise<Database> | null = null;
let databaseFailure: Error | null = null;

interface MetaRow {
  value: string;
}

interface SettingRow {
  key: string;
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
  paper_id: string | null;
  paper_title: string | null;
  paper_level: string | null;
  paper_variant: string | null;
  task_index: number | null;
  source: string;
  created_at: string;
  reference_answer_content: string | null;
  reference_answer_source: string | null;
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

interface BenchmarkDraftRow {
  case_id: string;
  training_record_id: string;
  case_json: string;
  created_at: string;
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

function parseReview(value: string | null, expectedMaxScore: number): MockReview | undefined {
  if (!value) return undefined;
  try {
    return validateReview(JSON.parse(value) as MockReview, expectedMaxScore);
  } catch {
    return undefined;
  }
}

function parseBenchmarkCase(value: string): GradingBenchmarkCase | null {
  try {
    return JSON.parse(value) as GradingBenchmarkCase;
  } catch {
    return null;
  }
}

function parseTags(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter(item => typeof item === "string") as string[] : [];
  } catch {
    return [];
  }
}

function questionFromRows(row: QuestionRow, materials: MaterialRow[]): Question {
  return {
    id: row.id,
    title: row.title,
    year: row.year,
    region: row.region,
    type: row.type as QuestionType,
    difficulty: row.difficulty as Difficulty,
    score: row.score,
    wordLimit: row.word_limit,
    prompt: row.prompt,
    tags: parseTags(row.tags_json),
    ...(row.paper_id ? { paperId: row.paper_id } : {}),
    ...(row.paper_title ? { paperTitle: row.paper_title } : {}),
    ...(row.paper_level ? { paperLevel: row.paper_level as PaperLevel } : {}),
    ...(row.paper_variant ? { paperVariant: row.paper_variant } : {}),
    ...(row.task_index === null ? {} : { taskIndex: row.task_index }),
    referenceAnswer: row.reference_answer_content
      ? {
          content: row.reference_answer_content,
          ...(row.reference_answer_source ? { source: row.reference_answer_source } : {})
        }
      : undefined,
    source: row.source === "builtin" ? "builtin" : "local",
    createdAt: row.created_at,
    materials: materials
      .sort((left, right) => left.sort_order - right.sort_order)
      .map(material => ({
        id: material.id,
        label: material.label,
        content: material.content
      }))
  };
}

function trainingRecordFromRow(row: TrainingRow): TrainingRecord {
  return {
    id: row.id,
    questionId: row.question_id,
    title: row.title_snapshot,
    score: row.score,
    maxScore: row.max_score,
    answer: row.answer,
    review: parseReview(row.review_json, row.max_score),
    submittedAtIso: row.submitted_at,
    submittedAt: row.submitted_at_display
  };
}

function assertPublicSettingKey(key: string): void {
  if (!key.startsWith(PUBLIC_SETTING_PREFIX) || !/^public:[A-Za-z0-9._:-]{1,120}$/.test(key)) {
    throw new Error("Invalid public setting key.");
  }
  if (/secret|token|api[_-]?key|password|credential/i.test(key)) {
    throw new Error("Secret-like values must not use public settings storage.");
  }
}

async function getDatabase(): Promise<Database | null> {
  if (!isTauri()) return null;
  if (databaseFailure) throw databaseFailure;
  if (!databasePromise) {
    databasePromise = import("@tauri-apps/plugin-sql")
      .then(({ default: DatabaseApi }) => DatabaseApi.load(DATABASE_URL))
      .catch(error => {
        const detail = error instanceof Error ? error.message : String(error);
        databaseFailure = new Error(
          `本地数据库无法打开（${detail}）。为保护已有题库和训练记录，应用已停止加载，不会切换到空存储。`
        );
        databasePromise = null;
        console.error("SQLite initialization failed; localStorage fallback is disabled in the desktop app.", error);
        throw databaseFailure;
      });
  }
  const database = await databasePromise;
  return database;
}

async function upsertQuestion(db: Database, question: Question) {
  await db.execute(
    `INSERT INTO questions
      (id, title, year, region, type, difficulty, score, word_limit, prompt, tags_json,
       paper_id, paper_title, paper_level, paper_variant, task_index, source, created_at,
       reference_answer_content, reference_answer_source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
     ON CONFLICT(id) DO UPDATE SET
        title=excluded.title, year=excluded.year, region=excluded.region, type=excluded.type,
        difficulty=excluded.difficulty, score=excluded.score, word_limit=excluded.word_limit,
        prompt=excluded.prompt, tags_json=excluded.tags_json,
        paper_id=excluded.paper_id, paper_title=excluded.paper_title,
        paper_level=excluded.paper_level, paper_variant=excluded.paper_variant,
        task_index=excluded.task_index, source=excluded.source,
        reference_answer_content=excluded.reference_answer_content,
       reference_answer_source=excluded.reference_answer_source`,
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
      question.paperId ?? null,
      question.paperTitle ?? null,
      question.paperLevel ?? null,
      question.paperVariant ?? null,
      question.taskIndex ?? null,
      question.source ?? "local",
      question.createdAt ?? new Date().toISOString(),
      question.referenceAnswer?.content ?? null,
      question.referenceAnswer?.source ?? null
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

async function loadQuestionById(db: Database, questionId: string): Promise<Question | null> {
  const questionRows = await db.select<QuestionRow[]>(
    `SELECT id, title, year, region, type, difficulty, score, word_limit, prompt,
            tags_json, paper_id, paper_title, paper_level, paper_variant, task_index,
            source, created_at, reference_answer_content, reference_answer_source
     FROM questions WHERE id = $1 LIMIT 1`,
    [questionId]
  );
  const row = questionRows[0];
  if (!row) return null;
  const materials = await db.select<MaterialRow[]>(
    `SELECT id, question_id, label, content, sort_order
     FROM materials WHERE question_id = $1 ORDER BY sort_order`,
    [questionId]
  );
  return questionFromRows(row, materials);
}

function materialIdentity(material: { label: string; content: string }): string {
  const number = material.label.match(/[0-9０-９一二三四五六七八九十]+/u)?.[0] ?? "";
  return number ? `number:${number}` : `content:${material.content.trim()}`;
}

function materialOrder(label: string, fallback: number): number {
  const value = label.match(/[0-9０-９]+/u)?.[0];
  return value ? Number(value.replace(/[０-９]/gu, digit => String.fromCharCode(digit.charCodeAt(0) - 0xfee0))) : fallback;
}

function taskIndexFromPublicQuestionId(id: string): number | undefined {
  const match = id.match(/^publicq:[^:]+:task:(\d+)$/);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isInteger(value) && value > 0 ? value - 1 : undefined;
}

/**
 * Older imports stored only the materials explicitly cited by each task. The
 * public source links let us identify sibling tasks, so union their local
 * materials before the new paper workspace is opened.
 */
function repairPublicPaperQuestions(questions: Question[]): Question[] {
  const groups = new Map<string, Question[]>();
  for (const question of questions) {
    const paperId = questionPaperId(question);
    if (!paperId || !question.id.startsWith("publicq:")) continue;
    const group = groups.get(paperId) ?? [];
    group.push(question);
    groups.set(paperId, group);
  }

  const repaired = new Map<string, Question>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const materials = new Map<string, { label: string; content: string }>();
    for (const question of group) {
      for (const material of question.materials) {
        const identity = materialIdentity(material);
        if (!materials.has(identity)) materials.set(identity, { label: material.label, content: material.content });
      }
    }
    const fullMaterials = [...materials.values()]
      .sort((left, right) => materialOrder(left.label, 0) - materialOrder(right.label, 0))
      .map((material, index) => ({ id: `m${index + 1}`, ...material }));
    for (const question of group) {
      const paperId = questionPaperId(question)!;
      repaired.set(question.id, {
        ...question,
        paperId,
        paperTitle: questionPaperTitle(question),
        paperLevel: questionPaperLevel(question),
        ...(question.taskIndex === undefined
          ? { taskIndex: taskIndexFromPublicQuestionId(question.id) }
          : {}),
        materials: fullMaterials
      });
    }
  }
  return questions.map(question => repaired.get(question.id) ?? question);
}

function assertPublicSettingPrefix(prefix: string): void {
  if (!prefix.startsWith(PUBLIC_SETTING_PREFIX) || !/^public:[A-Za-z0-9._:-]{1,120}$/.test(prefix)) {
    throw new Error("Invalid public setting prefix.");
  }
  if (/secret|token|api[_-]?key|password|credential/i.test(prefix)) {
    throw new Error("Secret-like values must not use public settings storage.");
  }
}

function isExactSingleMaterialDuplicate(left: Question, right: Question): boolean {
  return left.type === right.type
    && left.prompt.trim() === right.prompt.trim()
    && left.materials.length === 1
    && right.materials.length === 1
    && left.materials[0].content.trim() === right.materials[0].content.trim();
}

async function findExactSingleMaterialDuplicate(db: Database, question: Question): Promise<Question | null> {
  if (question.materials.length !== 1) return null;
  const rows = await db.select<Array<{ id: string }>>(
    `SELECT q.id
     FROM questions q
     INNER JOIN materials m ON m.question_id = q.id
     WHERE q.type = $1
       AND TRIM(q.prompt) = TRIM($2)
       AND TRIM(m.content) = TRIM($3)
       AND (SELECT COUNT(*) FROM materials own WHERE own.question_id = q.id) = 1
     ORDER BY
       CASE WHEN q.reference_answer_content IS NOT NULL AND TRIM(q.reference_answer_content) <> '' THEN 0 ELSE 1 END,
       CASE WHEN q.title LIKE '%回忆%' OR q.title LIKE '%网友%' OR q.title LIKE '%考生%' THEN 1 ELSE 0 END,
       q.created_at DESC
     LIMIT 1`,
    [question.type, question.prompt, question.materials[0].content]
  );
  return rows[0] ? loadQuestionById(db, rows[0].id) : null;
}

function buildTrainingBenchmarkDraft(question: Question, record: TrainingRecord): GradingBenchmarkCase {
  return createBenchmarkDraft(question, record.answer, {
    caseId: `practice-${record.id}`,
    source: `training-record:${record.id}`,
    tags: ["real-practice"],
    createdAt: record.submittedAtIso ?? record.submittedAt
  });
}

async function insertBenchmarkDraftIfMissing(
  db: Database | null,
  question: Question,
  record: TrainingRecord
): Promise<GradingBenchmarkCase> {
  const testCase = buildTrainingBenchmarkDraft(question, record);
  if (!db) {
    const existing = readJson<GradingBenchmarkCase[]>(BENCHMARK_DRAFTS_KEY, []);
    const found = existing.find(item => item.id === testCase.id);
    if (found) return found;
    writeJson(BENCHMARK_DRAFTS_KEY, [testCase, ...existing]);
    return testCase;
  }

  await db.execute(
    `INSERT OR IGNORE INTO benchmark_drafts
       (case_id, training_record_id, case_json, created_at)
     VALUES ($1,$2,$3,$4)`,
    [
      testCase.id,
      record.id,
      JSON.stringify(testCase),
      record.submittedAtIso ?? new Date().toISOString()
    ]
  );
  const rows = await db.select<BenchmarkDraftRow[]>(
    `SELECT case_id, training_record_id, case_json, created_at
     FROM benchmark_drafts WHERE training_record_id = $1 LIMIT 1`,
    [record.id]
  );
  const stored = rows[0] ? parseBenchmarkCase(rows[0].case_json) : null;
  return stored ?? testCase;
}

async function backfillLocalBenchmarkDrafts(): Promise<void> {
  const questions = readJson<Question[]>(QUESTIONS_KEY, []);
  const questionById = new Map(questions.filter(item => item.source !== "builtin").map(item => [item.id, item]));
  const records = readJson<TrainingRecord[]>(HISTORY_KEY, []);
  for (const record of records) {
    const question = questionById.get(record.questionId);
    if (!question) continue;
    await insertBenchmarkDraftIfMissing(null, question, record);
  }
}

async function backfillSqliteBenchmarkDrafts(db: Database): Promise<void> {
  const rows = await db.select<TrainingRow[]>(
    `SELECT tr.id, tr.question_id, tr.title_snapshot, tr.score, tr.max_score, tr.answer,
            tr.review_json, tr.submitted_at, tr.submitted_at_display
     FROM training_records tr
     INNER JOIN questions q ON q.id = tr.question_id
     WHERE q.source = 'local'
     ORDER BY tr.submitted_at DESC`
  );
  for (const row of rows) {
    const question = await loadQuestionById(db, row.question_id);
    if (!question) continue;
    await insertBenchmarkDraftIfMissing(db, question, trainingRecordFromRow(row));
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

function repairLocalStoragePublicPaperQuestions(): void {
  if (localStorage.getItem(PUBLIC_PAPER_REPAIR_KEY) === "1") return;
  const questions = readJson<Question[]>(QUESTIONS_KEY, []);
  const repaired = repairPublicPaperQuestions(questions);
  if (repaired.some((question, index) => question !== questions[index])) writeJson(QUESTIONS_KEY, repaired);
  localStorage.setItem(PUBLIC_PAPER_REPAIR_KEY, "1");
}

async function repairSqlitePublicPaperQuestions(db: Database): Promise<void> {
  const rows = await db.select<MetaRow[]>(
    "SELECT value FROM app_meta WHERE key = $1 LIMIT 1",
    [PUBLIC_PAPER_REPAIR_KEY]
  );
  if (rows[0]?.value === "1") return;

  const questionRows = await db.select<QuestionRow[]>(
    `SELECT id, title, year, region, type, difficulty, score, word_limit, prompt,
            tags_json, paper_id, paper_title, paper_level, paper_variant, task_index,
            source, created_at, reference_answer_content, reference_answer_source
     FROM questions WHERE id LIKE 'publicq:%'`
  );
  const materialRows = await db.select<MaterialRow[]>(
    "SELECT id, question_id, label, content, sort_order FROM materials WHERE question_id LIKE 'publicq:%' ORDER BY question_id, sort_order"
  );
  const byQuestion = new Map<string, MaterialRow[]>();
  for (const material of materialRows) {
    const list = byQuestion.get(material.question_id) ?? [];
    list.push(material);
    byQuestion.set(material.question_id, list);
  }
  const questions = questionRows.map(row => questionFromRows(row, byQuestion.get(row.id) ?? []));
  const repaired = repairPublicPaperQuestions(questions);
  for (const question of repaired) {
    const previous = questions.find(item => item.id === question.id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(question)) await upsertQuestion(db, question);
  }
  await db.execute(
    `INSERT INTO app_meta (key, value) VALUES ($1, '1')
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
    [PUBLIC_PAPER_REPAIR_KEY]
  );
}

function createQuestion(input: LocalQuestionInput): Question {
  const now = new Date().toISOString();
  const requestedId = input.id?.trim();
  if (requestedId && !/^[A-Za-z0-9._:-]{1,220}$/.test(requestedId)) {
    throw new Error("Structured question id contains unsupported characters.");
  }
  const referenceAnswerContent = input.referenceAnswerContent?.trim();
  const referenceAnswerSource = input.referenceAnswerSource?.trim();
  const structuredMaterials = input.materials
    ?.map((material, index) => ({
      id: `m${index + 1}`,
      label: material.label.trim() || `材料 ${index + 1}`,
      content: material.content.trim()
    }))
    .filter(material => material.content.length > 0);
  const materials = structuredMaterials?.length
    ? structuredMaterials
    : input.materialText
        .split(/\n\s*\n/)
        .map(block => block.trim())
        .filter(Boolean)
        .map((content, index) => ({ id: `m${index + 1}`, label: `材料 ${index + 1}`, content }));

  return {
    id: requestedId || `local-${crypto.randomUUID()}`,
    title: input.title.trim(),
    year: input.year,
    region: input.region.trim() || "本地导入",
    type: input.type,
    difficulty: input.difficulty,
    score: input.score,
    wordLimit: input.wordLimit,
    prompt: input.prompt.trim(),
    tags: input.tags,
    ...(input.paperId?.trim() ? { paperId: input.paperId.trim() } : {}),
    ...(input.paperTitle?.trim() ? { paperTitle: input.paperTitle.trim() } : {}),
    ...(input.paperLevel ? { paperLevel: input.paperLevel } : {}),
    ...(input.paperVariant?.trim() ? { paperVariant: input.paperVariant.trim() } : {}),
    ...(typeof input.taskIndex === "number" ? { taskIndex: input.taskIndex } : {}),
    referenceAnswer: referenceAnswerContent
      ? { content: referenceAnswerContent, ...(referenceAnswerSource ? { source: referenceAnswerSource } : {}) }
      : undefined,
    source: "local",
    createdAt: now,
    materials
  };
}

export const persistence = {
  async initialize(): Promise<"sqlite" | "localStorage"> {
    const db = await getDatabase();
    if (!db) {
      repairLocalStoragePublicPaperQuestions();
      await backfillLocalBenchmarkDrafts();
      return "localStorage";
    }
    await migrateLegacyLocalStorage(db);
    await repairSqlitePublicPaperQuestions(db);
    await backfillSqliteBenchmarkDrafts(db);
    return "sqlite";
  },

  /**
   * Retry the desktop database initialization after a transient startup
   * failure. This never enables the empty localStorage fallback in Tauri;
   * it only discards the failed connection promise and reruns idempotent
   * migrations/repairs.
   */
  async retryInitialize(): Promise<"sqlite" | "localStorage"> {
    if (isTauri()) {
      databaseFailure = null;
      databasePromise = null;
    }
    return this.initialize();
  },

  /**
   * Flush the SQLite WAL and copy the current database before an in-place
   * desktop update. The updater must never proceed if the backup fails.
   */
  async backupBeforeUpdate(): Promise<string | null> {
    const db = await getDatabase();
    if (!db) return null;
    await db.execute("PRAGMA wal_checkpoint(FULL)");
    return invoke<string | null>("backup_local_database");
  },

  async getPublicSetting<T>(key: string, fallback: T): Promise<T> {
    assertPublicSettingKey(key);
    const db = await getDatabase();
    if (!db) {
      const settings = readJson<Record<string, unknown>>(PUBLIC_SETTINGS_KEY, {});
      const value = settings[key];
      return value === undefined ? fallback : value as T;
    }
    const rows = await db.select<MetaRow[]>("SELECT value FROM app_meta WHERE key = $1 LIMIT 1", [key]);
    const raw = rows[0]?.value;
    if (!raw) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  },

  async setPublicSetting<T>(key: string, value: T): Promise<void> {
    assertPublicSettingKey(key);
    const serialized = JSON.stringify(value);
    const db = await getDatabase();
    if (!db) {
      const settings = readJson<Record<string, unknown>>(PUBLIC_SETTINGS_KEY, {});
      settings[key] = value;
      writeJson(PUBLIC_SETTINGS_KEY, settings);
      return;
    }
    await db.execute(
      `INSERT INTO app_meta (key, value) VALUES ($1,$2)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
      [key, serialized]
    );
  },

  async getDraft(questionId: string): Promise<Draft | null> {
    const db = await getDatabase();
    if (!db) {
      return readJson<Record<string, Draft>>(DRAFT_KEY, {})[questionId] ?? null;
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
      const all = readJson<Record<string, Draft>>(DRAFT_KEY, {});
      all[draft.questionId] = draft;
      writeJson(DRAFT_KEY, all);
      return;
    }
    await db.execute(
      `INSERT INTO drafts (question_id, answer, updated_at) VALUES ($1,$2,$3)
       ON CONFLICT(question_id) DO UPDATE SET answer=excluded.answer, updated_at=excluded.updated_at`,
      [draft.questionId, draft.answer, draft.updatedAt]
    );
  },

  async listDrafts(): Promise<Draft[]> {
    const db = await getDatabase();
    if (!db) {
      return Object.values(readJson<Record<string, Draft>>(DRAFT_KEY, {}))
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    }
    const rows = await db.select<DraftRow[]>(
      "SELECT question_id, answer, updated_at FROM drafts ORDER BY updated_at DESC"
    );
    return rows.map(row => ({ questionId: row.question_id, answer: row.answer, updatedAt: row.updated_at }));
  },

  async deleteDraft(questionId: string): Promise<void> {
    const db = await getDatabase();
    if (!db) {
      const all = readJson<Record<string, Draft>>(DRAFT_KEY, {});
      if (!(questionId in all)) return;
      delete all[questionId];
      writeJson(DRAFT_KEY, all);
      return;
    }
    await db.execute("DELETE FROM drafts WHERE question_id = $1", [questionId]);
  },

  async listHistory(): Promise<TrainingRecord[]> {
    const db = await getDatabase();
    if (!db) {
      return readJson<TrainingRecord[]>(HISTORY_KEY, []).map(record => {
        if (!record.review) return record;
        try {
          validateReview(record.review, record.maxScore);
          return record;
        } catch {
          return { ...record, review: undefined };
        }
      });
    }
    const rows = await db.select<TrainingRow[]>(
      `SELECT id, question_id, title_snapshot, score, max_score, answer, review_json, submitted_at, submitted_at_display
       FROM training_records ORDER BY submitted_at DESC`
    );
    return rows.map(trainingRecordFromRow);
  },

  async addHistory(record: TrainingRecord): Promise<void> {
    const db = await getDatabase();
    if (!db) {
      const all = readJson<TrainingRecord[]>(HISTORY_KEY, []);
      const next = [record, ...all.filter(item => item.id !== record.id)];
      writeJson(HISTORY_KEY, next);
      const questions = readJson<Question[]>(QUESTIONS_KEY, []);
      const question = questions.find(item => item.id === record.questionId && item.source !== "builtin");
      if (question) await insertBenchmarkDraftIfMissing(null, question, record);
      return;
    }
    await db.execute(
      `INSERT OR REPLACE INTO training_records
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
    const question = await loadQuestionById(db, record.questionId);
    if (question && question.source !== "builtin") await insertBenchmarkDraftIfMissing(db, question, record);
  },

  async captureBenchmarkDraftFromHistory(recordId: string): Promise<GradingBenchmarkCase | null> {
    const normalizedId = recordId.trim();
    if (!normalizedId) return null;
    const db = await getDatabase();
    if (!db) {
      const record = readJson<TrainingRecord[]>(HISTORY_KEY, []).find(item => item.id === normalizedId);
      if (!record) return null;
      const question = readJson<Question[]>(QUESTIONS_KEY, [])
        .find(item => item.id === record.questionId && item.source !== "builtin");
      if (!question) return null;
      return insertBenchmarkDraftIfMissing(null, question, record);
    }

    const rows = await db.select<TrainingRow[]>(
      `SELECT id, question_id, title_snapshot, score, max_score, answer, review_json,
              submitted_at, submitted_at_display
       FROM training_records
       WHERE id = $1
       LIMIT 1`,
      [normalizedId]
    );
    const row = rows[0];
    if (!row) return null;
    const question = await loadQuestionById(db, row.question_id);
    if (!question || question.source === "builtin") return null;
    return insertBenchmarkDraftIfMissing(db, question, trainingRecordFromRow(row));
  },

  async listImportedQuestions(): Promise<Question[]> {
    const db = await getDatabase();
    if (!db) return readJson<Question[]>(QUESTIONS_KEY, []);
    const questionRows = await db.select<QuestionRow[]>(
      `SELECT id, title, year, region, type, difficulty, score, word_limit, prompt,
              tags_json, paper_id, paper_title, paper_level, paper_variant, task_index,
              source, created_at, reference_answer_content, reference_answer_source
       FROM questions ORDER BY created_at DESC`
    );
    const materialRows = await db.select<MaterialRow[]>(
      "SELECT id, question_id, label, content, sort_order FROM materials ORDER BY question_id, sort_order"
    );
    const byQuestion = new Map<string, MaterialRow[]>();
    for (const material of materialRows) {
      const list = byQuestion.get(material.question_id) ?? [];
      list.push(material);
      byQuestion.set(material.question_id, list);
    }
    return questionRows.map(row => questionFromRows(row, byQuestion.get(row.id) ?? []));
  },

  async addImportedQuestion(input: LocalQuestionInput): Promise<Question> {
    const question = createQuestion(input);
    const db = await getDatabase();
    if (!db) {
      const all = readJson<Question[]>(QUESTIONS_KEY, []);
      const existing = all.find(item => isExactSingleMaterialDuplicate(item, question));
      if (existing) return existing;
      writeJson(QUESTIONS_KEY, [question, ...all.filter(item => item.id !== question.id)]);
      return question;
    }
    const existing = await findExactSingleMaterialDuplicate(db, question);
    if (existing) return existing;
    await upsertQuestion(db, question);
    return question;
  },

  async getPublicSettingsByPrefix<T>(prefix: string): Promise<Map<string, T>> {
    assertPublicSettingPrefix(prefix);
    const db = await getDatabase();
    if (!db) {
      const settings = readJson<Record<string, unknown>>(PUBLIC_SETTINGS_KEY, {});
      const result = new Map<string, T>();
      for (const [key, value] of Object.entries(settings)) {
        if (key.startsWith(prefix)) result.set(key, value as T);
      }
      return result;
    }
    const rows = await db.select<SettingRow[]>(
      "SELECT key, value FROM app_meta WHERE key LIKE $1 ORDER BY key",
      [`${prefix}%`]
    );
    const result = new Map<string, T>();
    for (const row of rows) {
      try {
        result.set(row.key, JSON.parse(row.value) as T);
      } catch {
        // Ignore malformed settings just as getPublicSetting does.
      }
    }
    return result;
  },

  async listBenchmarkDrafts(): Promise<GradingBenchmarkCase[]> {
    const db = await getDatabase();
    if (!db) {
      await backfillLocalBenchmarkDrafts();
      return readJson<GradingBenchmarkCase[]>(BENCHMARK_DRAFTS_KEY, []);
    }
    await backfillSqliteBenchmarkDrafts(db);
    const rows = await db.select<BenchmarkDraftRow[]>(
      `SELECT case_id, training_record_id, case_json, created_at
       FROM benchmark_drafts ORDER BY created_at DESC`
    );
    return rows.map(row => parseBenchmarkCase(row.case_json)).filter(Boolean) as GradingBenchmarkCase[];
  },

  async saveBenchmarkDraft(testCase: GradingBenchmarkCase): Promise<void> {
    if (!testCase.id.trim()) throw new Error("Benchmark case id is required.");
    if (!testCase.provenance?.trainingRecordId?.trim()) throw new Error("Benchmark draft must retain its trainingRecordId provenance.");
    const serialized = JSON.stringify(testCase);
    const db = await getDatabase();
    if (!db) {
      const existing = readJson<GradingBenchmarkCase[]>(BENCHMARK_DRAFTS_KEY, []);
      const next = [testCase, ...existing.filter(item => item.id !== testCase.id)];
      writeJson(BENCHMARK_DRAFTS_KEY, next);
      return;
    }
    await db.execute(
      `INSERT INTO benchmark_drafts (case_id, training_record_id, case_json, created_at)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT(case_id) DO UPDATE SET case_json=excluded.case_json`,
      [testCase.id, testCase.provenance.trainingRecordId, serialized, testCase.provenance.createdAt]
    );
  }
};
