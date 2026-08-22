CREATE TABLE IF NOT EXISTS public_source_question_links (
  candidate_id TEXT NOT NULL REFERENCES public_source_candidates(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  task_index INTEGER NOT NULL CHECK (task_index >= 0),
  created_at TEXT NOT NULL,
  PRIMARY KEY (candidate_id, question_id),
  UNIQUE (candidate_id, task_index)
);

CREATE INDEX IF NOT EXISTS idx_public_source_question_links_question
  ON public_source_question_links(question_id);
