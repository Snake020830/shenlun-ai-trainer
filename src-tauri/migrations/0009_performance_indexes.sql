-- Keep the two list queries used during app startup and library rendering
-- index-backed as the local question bank grows.
CREATE INDEX IF NOT EXISTS idx_questions_created_at
  ON questions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_materials_question_sort
  ON materials(question_id, sort_order);
