export const STORAGE_SCHEMA_VERSION = 3;

// 运行时数据库的结构镜像。正式迁移文件位于 src-tauri/migrations/0001..0003。
export const SQLITE_SCHEMA_V3 = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  year INTEGER NOT NULL,
  region TEXT NOT NULL,
  type TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  score REAL NOT NULL,
  word_limit INTEGER NOT NULL,
  prompt TEXT NOT NULL,
  tags_json TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'local',
  created_at TEXT NOT NULL,
  reference_answer_content TEXT,
  reference_answer_source TEXT
);

CREATE TABLE IF NOT EXISTS materials (
  id TEXT NOT NULL,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  content TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  PRIMARY KEY (question_id, id)
);

CREATE TABLE IF NOT EXISTS drafts (
  question_id TEXT PRIMARY KEY,
  answer TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS training_records (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL,
  title_snapshot TEXT NOT NULL,
  score REAL NOT NULL,
  max_score REAL NOT NULL,
  answer TEXT NOT NULL,
  review_json TEXT,
  submitted_at TEXT NOT NULL,
  submitted_at_display TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS benchmark_drafts (
  case_id TEXT PRIMARY KEY,
  training_record_id TEXT NOT NULL UNIQUE REFERENCES training_records(id) ON DELETE CASCADE,
  case_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_training_question ON training_records(question_id);
CREATE INDEX IF NOT EXISTS idx_training_submitted ON training_records(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_benchmark_drafts_created ON benchmark_drafts(created_at DESC);
`;
