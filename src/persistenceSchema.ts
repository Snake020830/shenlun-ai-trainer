export const STORAGE_SCHEMA_VERSION = 10;

// 运行时数据库的结构镜像。正式迁移文件位于 src-tauri/migrations/0001..0010。
export const SQLITE_SCHEMA_V8 = `
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
  paper_id TEXT,
  paper_title TEXT,
  paper_level TEXT,
  paper_variant TEXT,
  task_index INTEGER,
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

CREATE TABLE IF NOT EXISTS benchmark_model_runs (
  run_id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES benchmark_drafts(case_id) ON DELETE CASCADE,
  run_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS benchmark_alignments (
  case_id TEXT NOT NULL REFERENCES benchmark_drafts(case_id) ON DELETE CASCADE,
  run_id TEXT NOT NULL REFERENCES benchmark_model_runs(run_id) ON DELETE CASCADE,
  alignment_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (case_id, run_id)
);

CREATE TABLE IF NOT EXISTS practice_annotations (
  question_id TEXT PRIMARY KEY,
  annotations_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS practice_ink_strokes (
  question_id TEXT PRIMARY KEY,
  strokes_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS training_practice_meta (
  training_record_id TEXT PRIMARY KEY REFERENCES training_records(id) ON DELETE CASCADE,
  elapsed_seconds INTEGER NOT NULL CHECK (elapsed_seconds >= 0),
  annotation_count INTEGER NOT NULL DEFAULT 0 CHECK (annotation_count >= 0),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public_source_candidates (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  title TEXT NOT NULL,
  source_url TEXT NOT NULL UNIQUE,
  year INTEGER,
  region TEXT,
  paper_variant TEXT,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('public-web', 'public-pdf', 'source-index')),
  access_note TEXT,
  discovered_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'discovered'
    CHECK (status IN ('discovered', 'reviewed', 'imported', 'rejected')),
  imported_question_id TEXT REFERENCES questions(id) ON DELETE SET NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS question_sources (
  question_id TEXT PRIMARY KEY REFERENCES questions(id) ON DELETE CASCADE,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('manual', 'public-web', 'public-pdf')),
  source_name TEXT,
  source_url TEXT,
  source_title TEXT,
  retrieved_at TEXT,
  imported_at TEXT NOT NULL,
  content_hash TEXT,
  rights_note TEXT,
  is_recall_version INTEGER NOT NULL DEFAULT 0 CHECK (is_recall_version IN (0, 1))
);

CREATE TABLE IF NOT EXISTS public_source_question_links (
  candidate_id TEXT NOT NULL REFERENCES public_source_candidates(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  task_index INTEGER NOT NULL CHECK (task_index >= 0),
  created_at TEXT NOT NULL,
  PRIMARY KEY (candidate_id, question_id),
  UNIQUE (candidate_id, task_index)
);

CREATE INDEX IF NOT EXISTS idx_training_question ON training_records(question_id);
CREATE INDEX IF NOT EXISTS idx_training_submitted ON training_records(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_benchmark_drafts_created ON benchmark_drafts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_benchmark_model_runs_case ON benchmark_model_runs(case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_benchmark_alignments_run ON benchmark_alignments(run_id);
CREATE INDEX IF NOT EXISTS idx_training_practice_meta_created ON training_practice_meta(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_public_source_candidates_provider ON public_source_candidates(provider_id, year DESC);
CREATE INDEX IF NOT EXISTS idx_public_source_candidates_status ON public_source_candidates(status, discovered_at DESC);
CREATE INDEX IF NOT EXISTS idx_question_sources_url ON question_sources(source_url);
CREATE INDEX IF NOT EXISTS idx_public_source_question_links_question ON public_source_question_links(question_id);
CREATE INDEX IF NOT EXISTS idx_questions_paper ON questions(paper_id, task_index);
`;
