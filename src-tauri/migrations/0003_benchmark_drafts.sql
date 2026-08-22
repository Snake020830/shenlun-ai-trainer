CREATE TABLE IF NOT EXISTS benchmark_drafts (
  case_id TEXT PRIMARY KEY,
  training_record_id TEXT NOT NULL UNIQUE REFERENCES training_records(id) ON DELETE CASCADE,
  case_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_benchmark_drafts_created
  ON benchmark_drafts(created_at DESC);
