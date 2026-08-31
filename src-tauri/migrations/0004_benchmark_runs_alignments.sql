CREATE TABLE IF NOT EXISTS benchmark_model_runs (
  run_id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES benchmark_drafts(case_id) ON DELETE CASCADE,
  run_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_benchmark_model_runs_case
  ON benchmark_model_runs(case_id, created_at DESC);

CREATE TABLE IF NOT EXISTS benchmark_alignments (
  case_id TEXT NOT NULL REFERENCES benchmark_drafts(case_id) ON DELETE CASCADE,
  run_id TEXT NOT NULL REFERENCES benchmark_model_runs(run_id) ON DELETE CASCADE,
  alignment_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (case_id, run_id)
);

CREATE INDEX IF NOT EXISTS idx_benchmark_alignments_run
  ON benchmark_alignments(run_id);
