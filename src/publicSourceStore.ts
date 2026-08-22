import { isTauri } from "@tauri-apps/api/core";
import type Database from "@tauri-apps/plugin-sql";

const DATABASE_URL = "sqlite:shenlun-trainer.db";
const CANDIDATES_KEY = "shenlun:public-source-candidates:v1";
const QUESTION_SOURCES_KEY = "shenlun:question-sources:v1";
const SOURCE_QUESTION_LINKS_KEY = "shenlun:public-source-question-links:v1";

export type PublicSourceKind = "public-web" | "public-pdf" | "source-index";
export type PublicSourceStatus = "discovered" | "reviewed" | "imported" | "rejected";
export type QuestionSourceKind = "manual" | "public-web" | "public-pdf";

export interface PublicSourceCandidate {
  id: string;
  providerId: string;
  title: string;
  sourceUrl: string;
  year?: number;
  region?: string;
  paperVariant?: string;
  sourceKind: PublicSourceKind;
  accessNote?: string;
  discoveredAt: string;
  status: PublicSourceStatus;
  importedQuestionId?: string;
  metadata?: Record<string, unknown>;
}

export interface QuestionSourceProvenance {
  questionId: string;
  sourceKind: QuestionSourceKind;
  sourceName?: string;
  sourceUrl?: string;
  sourceTitle?: string;
  retrievedAt?: string;
  importedAt: string;
  contentHash?: string;
  rightsNote?: string;
  isRecallVersion: boolean;
}

export interface PublicSourceQuestionLink {
  candidateId: string;
  questionId: string;
  taskIndex: number;
  createdAt: string;
}

interface CandidateRow {
  id: string;
  provider_id: string;
  title: string;
  source_url: string;
  year: number | null;
  region: string | null;
  paper_variant: string | null;
  source_kind: PublicSourceKind;
  access_note: string | null;
  discovered_at: string;
  status: PublicSourceStatus;
  imported_question_id: string | null;
  metadata_json: string;
}

interface QuestionSourceRow {
  question_id: string;
  source_kind: QuestionSourceKind;
  source_name: string | null;
  source_url: string | null;
  source_title: string | null;
  retrieved_at: string | null;
  imported_at: string;
  content_hash: string | null;
  rights_note: string | null;
  is_recall_version: number;
}

interface PublicSourceQuestionLinkRow {
  candidate_id: string;
  question_id: string;
  task_index: number;
  created_at: string;
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

function writeJson<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

function validateHttpUrl(value: string): URL {
  const url = new URL(value);
  if (!/^https?:$/.test(url.protocol)) throw new Error("Public source URL must use HTTP or HTTPS.");
  if (url.username || url.password) throw new Error("Public source URL must not contain embedded credentials.");
  return url;
}

function validateCandidate(candidate: PublicSourceCandidate): void {
  if (!candidate.id.trim()) throw new Error("Public source candidate id is required.");
  if (!candidate.providerId.trim()) throw new Error("Public source providerId is required.");
  if (!candidate.title.trim()) throw new Error("Public source title is required.");
  validateHttpUrl(candidate.sourceUrl);
  if (!(["public-web", "public-pdf", "source-index"] as const).includes(candidate.sourceKind)) {
    throw new Error("Unsupported public source kind.");
  }
  if (!(["discovered", "reviewed", "imported", "rejected"] as const).includes(candidate.status)) {
    throw new Error("Unsupported public source status.");
  }
  if (candidate.year !== undefined && (!Number.isInteger(candidate.year) || candidate.year < 2000 || candidate.year > 2100)) {
    throw new Error("Public source year is invalid.");
  }
}

function validateQuestionSource(source: QuestionSourceProvenance): void {
  if (!source.questionId.trim()) throw new Error("questionId is required for question provenance.");
  if (!(["manual", "public-web", "public-pdf"] as const).includes(source.sourceKind)) {
    throw new Error("Unsupported question source kind.");
  }
  if (source.sourceKind !== "manual" && !source.sourceUrl) {
    throw new Error("Public question provenance requires a source URL.");
  }
  if (source.sourceUrl) validateHttpUrl(source.sourceUrl);
}

function validateQuestionLink(link: PublicSourceQuestionLink): void {
  if (!link.candidateId.trim()) throw new Error("candidateId is required for a public source question link.");
  if (!link.questionId.trim()) throw new Error("questionId is required for a public source question link.");
  if (!Number.isInteger(link.taskIndex) || link.taskIndex < 0) throw new Error("taskIndex must be a non-negative integer.");
  if (!link.createdAt.trim()) throw new Error("createdAt is required for a public source question link.");
}

function candidateFromRow(row: CandidateRow): PublicSourceCandidate {
  let metadata: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(row.metadata_json) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) metadata = parsed as Record<string, unknown>;
  } catch {
    metadata = {};
  }
  return {
    id: row.id,
    providerId: row.provider_id,
    title: row.title,
    sourceUrl: row.source_url,
    ...(row.year === null ? {} : { year: row.year }),
    ...(row.region ? { region: row.region } : {}),
    ...(row.paper_variant ? { paperVariant: row.paper_variant } : {}),
    sourceKind: row.source_kind,
    ...(row.access_note ? { accessNote: row.access_note } : {}),
    discoveredAt: row.discovered_at,
    status: row.status,
    ...(row.imported_question_id ? { importedQuestionId: row.imported_question_id } : {}),
    metadata
  };
}

function questionSourceFromRow(row: QuestionSourceRow): QuestionSourceProvenance {
  return {
    questionId: row.question_id,
    sourceKind: row.source_kind,
    ...(row.source_name ? { sourceName: row.source_name } : {}),
    ...(row.source_url ? { sourceUrl: row.source_url } : {}),
    ...(row.source_title ? { sourceTitle: row.source_title } : {}),
    ...(row.retrieved_at ? { retrievedAt: row.retrieved_at } : {}),
    importedAt: row.imported_at,
    ...(row.content_hash ? { contentHash: row.content_hash } : {}),
    ...(row.rights_note ? { rightsNote: row.rights_note } : {}),
    isRecallVersion: row.is_recall_version === 1
  };
}

function questionLinkFromRow(row: PublicSourceQuestionLinkRow): PublicSourceQuestionLink {
  return {
    candidateId: row.candidate_id,
    questionId: row.question_id,
    taskIndex: row.task_index,
    createdAt: row.created_at
  };
}

function preserveWorkflowState(existing: PublicSourceCandidate, incoming: PublicSourceCandidate): PublicSourceCandidate {
  const preserveStatus = existing.status !== "discovered";
  return {
    ...incoming,
    id: existing.id,
    discoveredAt: existing.discoveredAt,
    status: preserveStatus ? existing.status : incoming.status,
    ...(existing.importedQuestionId
      ? { importedQuestionId: existing.importedQuestionId }
      : incoming.importedQuestionId
        ? { importedQuestionId: incoming.importedQuestionId }
        : {}),
    metadata: { ...(existing.metadata ?? {}), ...(incoming.metadata ?? {}) }
  };
}

export const publicSourceStore = {
  async listCandidates(): Promise<PublicSourceCandidate[]> {
    const db = await getDatabase();
    if (!db) {
      return readJson<PublicSourceCandidate[]>(CANDIDATES_KEY, [])
        .sort((left, right) => right.discoveredAt.localeCompare(left.discoveredAt));
    }
    const rows = await db.select<CandidateRow[]>(
      `SELECT id, provider_id, title, source_url, year, region, paper_variant, source_kind,
              access_note, discovered_at, status, imported_question_id, metadata_json
       FROM public_source_candidates
       ORDER BY COALESCE(year, 0) DESC, discovered_at DESC`
    );
    return rows.map(candidateFromRow);
  },

  async upsertCandidate(candidate: PublicSourceCandidate): Promise<void> {
    validateCandidate(candidate);
    const db = await getDatabase();
    if (!db) {
      const existing = readJson<PublicSourceCandidate[]>(CANDIDATES_KEY, []);
      const previous = existing.find(item => item.id === candidate.id || item.sourceUrl === candidate.sourceUrl);
      const nextCandidate = previous ? preserveWorkflowState(previous, candidate) : candidate;
      const next = [nextCandidate, ...existing.filter(item => item.id !== nextCandidate.id && item.sourceUrl !== nextCandidate.sourceUrl)];
      writeJson(CANDIDATES_KEY, next);
      return;
    }
    await db.execute(
      `INSERT INTO public_source_candidates
        (id, provider_id, title, source_url, year, region, paper_variant, source_kind,
         access_note, discovered_at, status, imported_question_id, metadata_json)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT(source_url) DO UPDATE SET
         provider_id=excluded.provider_id,
         title=excluded.title,
         year=excluded.year,
         region=excluded.region,
         paper_variant=excluded.paper_variant,
         source_kind=excluded.source_kind,
         access_note=excluded.access_note,
         status=CASE
           WHEN public_source_candidates.status IN ('reviewed','imported','rejected')
             THEN public_source_candidates.status
           ELSE excluded.status
         END,
         imported_question_id=COALESCE(public_source_candidates.imported_question_id, excluded.imported_question_id),
         metadata_json=excluded.metadata_json`,
      [
        candidate.id,
        candidate.providerId,
        candidate.title,
        candidate.sourceUrl,
        candidate.year ?? null,
        candidate.region ?? null,
        candidate.paperVariant ?? null,
        candidate.sourceKind,
        candidate.accessNote ?? null,
        candidate.discoveredAt,
        candidate.status,
        candidate.importedQuestionId ?? null,
        JSON.stringify(candidate.metadata ?? {})
      ]
    );
  },

  async markCandidateImported(candidateId: string, questionId?: string): Promise<void> {
    const db = await getDatabase();
    if (!db) {
      const existing = readJson<PublicSourceCandidate[]>(CANDIDATES_KEY, []);
      writeJson(CANDIDATES_KEY, existing.map(item => item.id === candidateId
        ? { ...item, status: "imported", ...(questionId ? { importedQuestionId: questionId } : {}) }
        : item));
      return;
    }
    await db.execute(
      `UPDATE public_source_candidates
       SET status='imported', imported_question_id=COALESCE(imported_question_id, $2)
       WHERE id=$1`,
      [candidateId, questionId ?? null]
    );
  },

  async linkCandidateQuestion(link: PublicSourceQuestionLink): Promise<void> {
    validateQuestionLink(link);
    const db = await getDatabase();
    if (!db) {
      const existing = readJson<PublicSourceQuestionLink[]>(SOURCE_QUESTION_LINKS_KEY, []);
      const conflictingTask = existing.find(item => item.candidateId === link.candidateId && item.taskIndex === link.taskIndex && item.questionId !== link.questionId);
      if (conflictingTask) throw new Error(`Public source task ${link.taskIndex} is already linked to another question.`);
      const next = [link, ...existing.filter(item => !(item.candidateId === link.candidateId && item.questionId === link.questionId))];
      writeJson(SOURCE_QUESTION_LINKS_KEY, next);
      return;
    }
    await db.execute(
      `INSERT INTO public_source_question_links (candidate_id, question_id, task_index, created_at)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT(candidate_id, question_id) DO UPDATE SET
         task_index=excluded.task_index,
         created_at=excluded.created_at`,
      [link.candidateId, link.questionId, link.taskIndex, link.createdAt]
    );
  },

  async listCandidateQuestionLinks(candidateId: string): Promise<PublicSourceQuestionLink[]> {
    if (!candidateId.trim()) return [];
    const db = await getDatabase();
    if (!db) {
      return readJson<PublicSourceQuestionLink[]>(SOURCE_QUESTION_LINKS_KEY, [])
        .filter(item => item.candidateId === candidateId)
        .sort((left, right) => left.taskIndex - right.taskIndex);
    }
    const rows = await db.select<PublicSourceQuestionLinkRow[]>(
      `SELECT candidate_id, question_id, task_index, created_at
       FROM public_source_question_links
       WHERE candidate_id=$1
       ORDER BY task_index`,
      [candidateId]
    );
    return rows.map(questionLinkFromRow);
  },

  async listQuestionSourceLinks(questionId: string): Promise<PublicSourceQuestionLink[]> {
    if (!questionId.trim()) return [];
    const db = await getDatabase();
    if (!db) {
      return readJson<PublicSourceQuestionLink[]>(SOURCE_QUESTION_LINKS_KEY, [])
        .filter(item => item.questionId === questionId)
        .sort((left, right) => left.taskIndex - right.taskIndex);
    }
    const rows = await db.select<PublicSourceQuestionLinkRow[]>(
      `SELECT candidate_id, question_id, task_index, created_at
       FROM public_source_question_links
       WHERE question_id=$1
       ORDER BY task_index`,
      [questionId]
    );
    return rows.map(questionLinkFromRow);
  },

  async saveQuestionSource(source: QuestionSourceProvenance): Promise<void> {
    validateQuestionSource(source);
    const db = await getDatabase();
    if (!db) {
      const existing = readJson<Record<string, QuestionSourceProvenance>>(QUESTION_SOURCES_KEY, {});
      existing[source.questionId] = source;
      writeJson(QUESTION_SOURCES_KEY, existing);
      return;
    }
    await db.execute(
      `INSERT INTO question_sources
        (question_id, source_kind, source_name, source_url, source_title, retrieved_at,
         imported_at, content_hash, rights_note, is_recall_version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT(question_id) DO UPDATE SET
         source_kind=excluded.source_kind,
         source_name=excluded.source_name,
         source_url=excluded.source_url,
         source_title=excluded.source_title,
         retrieved_at=excluded.retrieved_at,
         imported_at=excluded.imported_at,
         content_hash=excluded.content_hash,
         rights_note=excluded.rights_note,
         is_recall_version=excluded.is_recall_version`,
      [
        source.questionId,
        source.sourceKind,
        source.sourceName ?? null,
        source.sourceUrl ?? null,
        source.sourceTitle ?? null,
        source.retrievedAt ?? null,
        source.importedAt,
        source.contentHash ?? null,
        source.rightsNote ?? null,
        source.isRecallVersion ? 1 : 0
      ]
    );
  },

  async getQuestionSource(questionId: string): Promise<QuestionSourceProvenance | null> {
    const db = await getDatabase();
    if (!db) {
      const existing = readJson<Record<string, QuestionSourceProvenance>>(QUESTION_SOURCES_KEY, {});
      return existing[questionId] ?? null;
    }
    const rows = await db.select<QuestionSourceRow[]>(
      `SELECT question_id, source_kind, source_name, source_url, source_title, retrieved_at,
              imported_at, content_hash, rights_note, is_recall_version
       FROM question_sources WHERE question_id=$1 LIMIT 1`,
      [questionId]
    );
    return rows[0] ? questionSourceFromRow(rows[0]) : null;
  }
};
