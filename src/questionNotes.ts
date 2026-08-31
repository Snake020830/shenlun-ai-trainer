import { persistence } from "./storage";

const QUESTION_NOTES_KEY = "public:question-notes:v1";
const MAX_NOTE_CHARS = 20000;

export interface QuestionNote {
  questionId: string;
  content: string;
  updatedAt: string;
}

type QuestionNoteMap = Record<string, QuestionNote>;

async function readNotes(): Promise<QuestionNoteMap> {
  const value = await persistence.getPublicSetting<QuestionNoteMap>(QUESTION_NOTES_KEY, {});
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

export async function getQuestionNote(questionId: string): Promise<QuestionNote | null> {
  const notes = await readNotes();
  const note = notes[questionId];
  if (!note || typeof note.content !== "string") return null;
  return note;
}

export async function saveQuestionNote(questionId: string, content: string): Promise<QuestionNote> {
  const normalized = content.replace(/\r\n/g, "\n").slice(0, MAX_NOTE_CHARS);
  const notes = await readNotes();
  const note: QuestionNote = {
    questionId,
    content: normalized,
    updatedAt: new Date().toISOString()
  };
  notes[questionId] = note;
  await persistence.setPublicSetting(QUESTION_NOTES_KEY, notes);
  return note;
}

export async function getQuestionNoteIds(): Promise<Set<string>> {
  const notes = await readNotes();
  return new Set(Object.values(notes).filter(note => note.content.trim().length > 0).map(note => note.questionId));
}
