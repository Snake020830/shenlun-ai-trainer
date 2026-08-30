import { persistence } from "./storage";
import { MATERIAL_LEARNING_VERSION, validateMaterialDeepReadOutput, type MaterialDeepReadOutput } from "./materialLearning";
import type { Question } from "./types";

const SNAPSHOT_PREFIX = "public:material-deep-read.v1:";

export interface MaterialDeepReadSnapshot {
  questionId: string;
  questionSignature: string;
  version: string;
  generatedAt: string;
  result: MaterialDeepReadOutput;
}

function parseSnapshot(question: Question, stored: unknown): MaterialDeepReadSnapshot | null {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return null;
  const data = stored as Record<string, unknown>;
  if (data.questionId !== question.id || data.questionSignature !== questionSignature(question) || typeof data.generatedAt !== "string") return null;
  try {
    return {
      questionId: question.id,
      questionSignature: data.questionSignature as string,
      version: typeof data.version === "string" ? data.version : MATERIAL_LEARNING_VERSION,
      generatedAt: data.generatedAt,
      result: validateMaterialDeepReadOutput(data.result)
    };
  } catch {
    return null;
  }
}

function questionSnapshotPayload(question: Question) {
  return {
    id: question.id,
    title: question.title,
    type: question.type,
    score: question.score,
    wordLimit: question.wordLimit,
    prompt: question.prompt,
    materials: question.materials.map(material => ({ id: material.id, label: material.label, content: material.content }))
  };
}

export function questionSignature(question: Question): string {
  return JSON.stringify(questionSnapshotPayload(question));
}

function snapshotKey(questionId: string): string {
  return `${SNAPSHOT_PREFIX}${questionId}`;
}

export async function loadMaterialDeepReadSnapshot(question: Question): Promise<MaterialDeepReadSnapshot | null> {
  const stored = await persistence.getPublicSetting<unknown>(snapshotKey(question.id), null);
  return parseSnapshot(question, stored);
}

export async function loadMaterialDeepReadSnapshots(questions: Question[]): Promise<Map<string, MaterialDeepReadSnapshot>> {
  const stored = await persistence.getPublicSettingsByPrefix<unknown>(SNAPSHOT_PREFIX);
  const result = new Map<string, MaterialDeepReadSnapshot>();
  for (const question of questions) {
    const snapshot = parseSnapshot(question, stored.get(snapshotKey(question.id)));
    if (snapshot) result.set(question.id, snapshot);
  }
  return result;
}

export async function saveMaterialDeepReadSnapshot(question: Question, result: MaterialDeepReadOutput, generatedAt = new Date().toISOString()): Promise<MaterialDeepReadSnapshot> {
  const snapshot: MaterialDeepReadSnapshot = {
    questionId: question.id,
    questionSignature: questionSignature(question),
    version: MATERIAL_LEARNING_VERSION,
    generatedAt,
    result: validateMaterialDeepReadOutput(result)
  };
  await persistence.setPublicSetting(snapshotKey(question.id), snapshot);
  return snapshot;
}
