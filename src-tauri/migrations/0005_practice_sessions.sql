CREATE TABLE IF NOT EXISTS practice_annotations (
  question_id TEXT PRIMARY KEY,
  annotations_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS training_practice_meta (
  training_record_id TEXT PRIMARY KEY REFERENCES training_records(id) ON DELETE CASCADE,
  elapsed_seconds INTEGER NOT NULL CHECK (elapsed_seconds >= 0),
  annotation_count INTEGER NOT NULL DEFAULT 0 CHECK (annotation_count >= 0),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_training_practice_meta_created
  ON training_practice_meta(created_at DESC);
