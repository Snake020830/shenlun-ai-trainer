export const STORAGE_SCHEMA_VERSION = 1;

// SQLite 接入时以此 DDL 为起点。当前 localStorage adapter 与这些实体保持同构，
// 因此切换持久化实现时不要求页面重写。
export const SQLITE_SCHEMA_V1 = `
PRAGMA foreign_keys = ON;

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
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS materials (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  content TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS drafts (
  question_id TEXT PRIMARY KEY REFERENCES questions(id) ON DELETE CASCADE,
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
  submitted_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_training_question ON training_records(question_id);
CREATE INDEX IF NOT EXISTS idx_training_submitted ON training_records(submitted_at DESC);
`;
