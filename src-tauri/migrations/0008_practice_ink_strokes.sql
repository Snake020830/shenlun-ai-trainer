CREATE TABLE IF NOT EXISTS practice_ink_strokes (
  question_id TEXT PRIMARY KEY,
  strokes_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
