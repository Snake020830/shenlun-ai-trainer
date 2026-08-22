import { isTauri } from "@tauri-apps/api/core";
import type Database from "@tauri-apps/plugin-sql";

const DATABASE_URL = "sqlite:shenlun-trainer.db";
const ANNOTATION_KEY_PREFIX = "shenlun:practice-annotations:v1:";
const INK_KEY_PREFIX = "shenlun:practice-ink:v1:";
const META_KEY = "shenlun:training-practice-meta:v1";

export type PracticeHighlightColor = "yellow" | "blue" | "green" | "pink";
export type PracticeInkColor = "graphite" | "blue" | "red";

export interface PracticeTextAnnotation {
  id: string;
  materialId: string;
  start: number;
  end: number;
  type: "highlight" | "underline";
  color?: PracticeHighlightColor;
}

export interface PracticeInkPoint {
  offset: number;
  dx: number;
  dy: number;
}

export interface PracticeInkStroke {
  id: string;
  materialId: string;
  color: PracticeInkColor;
  width: number;
  points: PracticeInkPoint[];
}

export interface TrainingPracticeMeta {
  trainingRecordId: string;
  elapsedSeconds: number;
  annotationCount: number;
  createdAt: string;
}

interface AnnotationRow {
  annotations_json: string;
}

interface InkRow {
  strokes_json: string;
}

let databasePromise: Promise<Database> | null = null;

async function getDatabase(): Promise<Database | null> {
  if (!isTauri()) return null;
  if (!databasePromise) {
    databasePromise = import("@tauri-apps/plugin-sql")
      .then(({ default: DatabaseApi }) => DatabaseApi.load(DATABASE_URL));
  }
  return databasePromise;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function validateAnnotations(annotations: PracticeTextAnnotation[]): void {
  const seen = new Set<string>();
  const highlightColors = new Set<PracticeHighlightColor>(["yellow", "blue", "green", "pink"]);
  for (const item of annotations) {
    if (!item.id.trim()) throw new Error("Practice annotation id is required.");
    if (seen.has(item.id)) throw new Error(`Duplicate practice annotation id: ${item.id}.`);
    seen.add(item.id);
    if (!item.materialId.trim()) throw new Error(`Practice annotation ${item.id} materialId is required.`);
    if (!Number.isInteger(item.start) || !Number.isInteger(item.end) || item.start < 0 || item.end <= item.start) {
      throw new Error(`Practice annotation ${item.id} has an invalid text range.`);
    }
    if (item.type !== "highlight" && item.type !== "underline") {
      throw new Error(`Practice annotation ${item.id} has an unsupported type.`);
    }
    if (item.color !== undefined && !highlightColors.has(item.color)) {
      throw new Error(`Practice annotation ${item.id} has an unsupported highlight color.`);
    }
    if (item.type === "underline" && item.color !== undefined) {
      throw new Error(`Practice annotation ${item.id} cannot attach a highlight color to an underline.`);
    }
  }
}

function validateInkStrokes(strokes: PracticeInkStroke[]): void {
  if (strokes.length > 500) throw new Error("Practice ink stroke count exceeded the safety limit.");
  const seen = new Set<string>();
  const colors = new Set<PracticeInkColor>(["graphite", "blue", "red"]);
  for (const stroke of strokes) {
    if (!stroke.id.trim()) throw new Error("Practice ink stroke id is required.");
    if (seen.has(stroke.id)) throw new Error(`Duplicate practice ink stroke id: ${stroke.id}.`);
    seen.add(stroke.id);
    if (!stroke.materialId.trim()) throw new Error(`Practice ink stroke ${stroke.id} materialId is required.`);
    if (!colors.has(stroke.color)) throw new Error(`Practice ink stroke ${stroke.id} has an unsupported color.`);
    if (!Number.isFinite(stroke.width) || stroke.width < 1 || stroke.width > 12) {
      throw new Error(`Practice ink stroke ${stroke.id} has an invalid width.`);
    }
    if (stroke.points.length < 2 || stroke.points.length > 5000) {
      throw new Error(`Practice ink stroke ${stroke.id} has an invalid point count.`);
    }
    for (const point of stroke.points) {
      if (!Number.isInteger(point.offset) || point.offset < 0) {
        throw new Error(`Practice ink stroke ${stroke.id} contains an invalid character offset.`);
      }
      if (!Number.isFinite(point.dx) || !Number.isFinite(point.dy) || Math.abs(point.dx) > 2048 || Math.abs(point.dy) > 2048) {
        throw new Error(`Practice ink stroke ${stroke.id} contains an invalid relative coordinate.`);
      }
    }
  }
}

export async function getPracticeAnnotations(questionId: string): Promise<PracticeTextAnnotation[]> {
  if (!questionId.trim()) return [];
  const db = await getDatabase();
  if (!db) return readJson<PracticeTextAnnotation[]>(`${ANNOTATION_KEY_PREFIX}${questionId}`, []);
  const rows = await db.select<AnnotationRow[]>(
    "SELECT annotations_json FROM practice_annotations WHERE question_id = $1 LIMIT 1",
    [questionId]
  );
  if (!rows[0]) return [];
  try {
    const parsed = JSON.parse(rows[0].annotations_json) as PracticeTextAnnotation[];
    validateAnnotations(parsed);
    return parsed;
  } catch (error) {
    console.error("Stored practice annotations are invalid.", error);
    return [];
  }
}

export async function savePracticeAnnotations(questionId: string, annotations: PracticeTextAnnotation[]): Promise<void> {
  if (!questionId.trim()) throw new Error("questionId is required when saving practice annotations.");
  validateAnnotations(annotations);
  const db = await getDatabase();
  if (!db) {
    localStorage.setItem(`${ANNOTATION_KEY_PREFIX}${questionId}`, JSON.stringify(annotations));
    return;
  }
  await db.execute(
    `INSERT INTO practice_annotations (question_id, annotations_json, updated_at)
     VALUES ($1,$2,$3)
     ON CONFLICT(question_id) DO UPDATE SET
       annotations_json=excluded.annotations_json,
       updated_at=excluded.updated_at`,
    [questionId, JSON.stringify(annotations), new Date().toISOString()]
  );
}

export async function getPracticeInkStrokes(questionId: string): Promise<PracticeInkStroke[]> {
  if (!questionId.trim()) return [];
  const db = await getDatabase();
  if (!db) {
    const parsed = readJson<PracticeInkStroke[]>(`${INK_KEY_PREFIX}${questionId}`, []);
    try {
      validateInkStrokes(parsed);
      return parsed;
    } catch (error) {
      console.error("Stored practice ink strokes are invalid.", error);
      return [];
    }
  }
  const rows = await db.select<InkRow[]>(
    "SELECT strokes_json FROM practice_ink_strokes WHERE question_id = $1 LIMIT 1",
    [questionId]
  );
  if (!rows[0]) return [];
  try {
    const parsed = JSON.parse(rows[0].strokes_json) as PracticeInkStroke[];
    validateInkStrokes(parsed);
    return parsed;
  } catch (error) {
    console.error("Stored practice ink strokes are invalid.", error);
    return [];
  }
}

export async function savePracticeInkStrokes(questionId: string, strokes: PracticeInkStroke[]): Promise<void> {
  if (!questionId.trim()) throw new Error("questionId is required when saving practice ink strokes.");
  validateInkStrokes(strokes);
  const db = await getDatabase();
  if (!db) {
    localStorage.setItem(`${INK_KEY_PREFIX}${questionId}`, JSON.stringify(strokes));
    return;
  }
  await db.execute(
    `INSERT INTO practice_ink_strokes (question_id, strokes_json, updated_at)
     VALUES ($1,$2,$3)
     ON CONFLICT(question_id) DO UPDATE SET
       strokes_json=excluded.strokes_json,
       updated_at=excluded.updated_at`,
    [questionId, JSON.stringify(strokes), new Date().toISOString()]
  );
}

export async function saveTrainingPracticeMeta(
  trainingRecordId: string,
  elapsedSeconds: number,
  annotationCount: number,
  createdAt = new Date().toISOString()
): Promise<void> {
  if (!trainingRecordId.trim()) throw new Error("trainingRecordId is required.");
  if (!Number.isInteger(elapsedSeconds) || elapsedSeconds < 0) throw new Error("elapsedSeconds must be a non-negative integer.");
  if (!Number.isInteger(annotationCount) || annotationCount < 0) throw new Error("annotationCount must be a non-negative integer.");

  const meta: TrainingPracticeMeta = { trainingRecordId, elapsedSeconds, annotationCount, createdAt };
  const db = await getDatabase();
  if (!db) {
    const existing = readJson<TrainingPracticeMeta[]>(META_KEY, []);
    const next = [meta, ...existing.filter(item => item.trainingRecordId !== trainingRecordId)].slice(0, 500);
    localStorage.setItem(META_KEY, JSON.stringify(next));
    return;
  }
  await db.execute(
    `INSERT INTO training_practice_meta
       (training_record_id, elapsed_seconds, annotation_count, created_at)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT(training_record_id) DO UPDATE SET
       elapsed_seconds=excluded.elapsed_seconds,
       annotation_count=excluded.annotation_count,
       created_at=excluded.created_at`,
    [trainingRecordId, elapsedSeconds, annotationCount, createdAt]
  );
}
