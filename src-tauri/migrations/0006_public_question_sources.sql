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

CREATE INDEX IF NOT EXISTS idx_public_source_candidates_provider
  ON public_source_candidates(provider_id, year DESC);
CREATE INDEX IF NOT EXISTS idx_public_source_candidates_status
  ON public_source_candidates(status, discovered_at DESC);
CREATE INDEX IF NOT EXISTS idx_question_sources_url
  ON question_sources(source_url);
