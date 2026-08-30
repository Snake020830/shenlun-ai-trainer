ALTER TABLE questions ADD COLUMN paper_id TEXT;
ALTER TABLE questions ADD COLUMN paper_title TEXT;
ALTER TABLE questions ADD COLUMN paper_level TEXT;
ALTER TABLE questions ADD COLUMN paper_variant TEXT;
ALTER TABLE questions ADD COLUMN task_index INTEGER;

CREATE INDEX IF NOT EXISTS idx_questions_paper
  ON questions(paper_id, task_index);
