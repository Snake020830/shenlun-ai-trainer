import { groupPublicExamCandidates } from "./publicExamCatalog";
import { inferPaperLevel } from "./examPaper";
import { canImportParsedPublicExam } from "./publicExamParser";
import { importPublicExam, previewPublicExam } from "./publicExamImporter";
import { isRecentPublicExamYear } from "./publicSourceDiscovery";
import { publicSourceStore, type PublicSourceCandidate } from "./publicSourceStore";

export const PUBLIC_EXAM_AUDIT_VERSION = "public-exam-audit@0.2.0";
export const PUBLIC_EXAM_BATCH_STATE_VERSION = "public-exam-batch@0.2.0";

function isExcludedTownshipPaper(candidate: PublicSourceCandidate): boolean {
  return inferPaperLevel(candidate.region, candidate.paperVariant, candidate.title) === "省考乡镇级";
}

export interface PublicExamAuditMetadata {
  version: typeof PUBLIC_EXAM_AUDIT_VERSION;
  auditedAt: string;
  importable: boolean;
  materialCount: number;
  taskCount: number;
  warningCount: number;
  warnings: string[];
}

export type PublicExamBatchAttemptOutcome = "ready" | "blocked" | "error" | "imported";

export interface PublicExamBatchAttemptMetadata {
  version: typeof PUBLIC_EXAM_BATCH_STATE_VERSION;
  phase: "audit" | "import";
  outcome: PublicExamBatchAttemptOutcome;
  attemptedAt: string;
  message?: string;
}

export interface PublicExamBatchAuditResult {
  candidateId: string;
  title: string;
  outcome: "ready" | "blocked" | "error" | "skipped";
  audit?: PublicExamAuditMetadata;
  message?: string;
}

export interface PublicExamBatchImportResult {
  candidateId: string;
  title: string;
  outcome: "imported" | "error" | "skipped";
  questionCount?: number;
  message?: string;
}

export interface PublicExamBatchProgress<T> {
  index: number;
  total: number;
  current: PublicSourceCandidate;
  result?: T;
}

type AuditMetadataContainer = Record<string, unknown> & {
  parserAudit?: PublicExamAuditMetadata;
  batchAttempt?: PublicExamBatchAttemptMetadata;
};

function delay(milliseconds: number): Promise<void> {
  if (milliseconds <= 0) return Promise.resolve();
  return new Promise(resolve => globalThis.setTimeout(resolve, milliseconds));
}

function flattenWarnings(exam: Awaited<ReturnType<typeof previewPublicExam>>["exam"]): string[] {
  return [
    ...exam.warnings,
    ...exam.tasks.flatMap((task, index) => task.warnings.map(warning => `第${index + 1}题：${warning}`))
  ];
}

function batchAttempt(
  phase: PublicExamBatchAttemptMetadata["phase"],
  outcome: PublicExamBatchAttemptOutcome,
  message?: string
): PublicExamBatchAttemptMetadata {
  return {
    version: PUBLIC_EXAM_BATCH_STATE_VERSION,
    phase,
    outcome,
    attemptedAt: new Date().toISOString(),
    ...(message?.trim() ? { message: message.trim() } : {})
  };
}

async function persistBatchAttempt(
  candidate: PublicSourceCandidate,
  attempt: PublicExamBatchAttemptMetadata,
  extras: { audit?: PublicExamAuditMetadata; status?: PublicSourceCandidate["status"] } = {}
): Promise<void> {
  await publicSourceStore.upsertCandidate({
    ...candidate,
    status: extras.status ?? candidate.status,
    metadata: {
      ...(candidate.metadata ?? {}),
      ...(extras.audit ? { parserAudit: extras.audit } : {}),
      batchAttempt: attempt
    }
  });
}

export function getCandidateAudit(candidate: PublicSourceCandidate): PublicExamAuditMetadata | null {
  const value = (candidate.metadata as AuditMetadataContainer | undefined)?.parserAudit;
  if (!value || typeof value !== "object") return null;
  if (value.version !== PUBLIC_EXAM_AUDIT_VERSION) return null;
  if (typeof value.auditedAt !== "string" || typeof value.importable !== "boolean") return null;
  if (![value.materialCount, value.taskCount, value.warningCount].every(Number.isInteger)) return null;
  if (!Array.isArray(value.warnings) || !value.warnings.every(item => typeof item === "string")) return null;
  return value;
}

export function getCandidateBatchAttempt(candidate: PublicSourceCandidate): PublicExamBatchAttemptMetadata | null {
  const value = (candidate.metadata as AuditMetadataContainer | undefined)?.batchAttempt;
  if (!value || typeof value !== "object") return null;
  if (value.version !== PUBLIC_EXAM_BATCH_STATE_VERSION) return null;
  if (value.phase !== "audit" && value.phase !== "import") return null;
  if (!["ready", "blocked", "error", "imported"].includes(value.outcome)) return null;
  if (typeof value.attemptedAt !== "string") return null;
  if (value.message !== undefined && typeof value.message !== "string") return null;
  return value;
}

export function isAuditedImportableCandidate(candidate: PublicSourceCandidate): boolean {
  const audit = getCandidateAudit(candidate);
  return Boolean(
    isRecentPublicExamYear(candidate.year)
    && candidate.status === "reviewed"
    && audit?.importable
    && audit.warningCount === 0
  );
}

export function isPublicExamBatchFailure(candidate: PublicSourceCandidate): boolean {
  const attempt = getCandidateBatchAttempt(candidate);
  return attempt?.outcome === "blocked" || attempt?.outcome === "error";
}

export function selectPendingPublicExamAuditCandidates(candidates: PublicSourceCandidate[]): PublicSourceCandidate[] {
  return groupPublicExamCandidates(candidates)
    .filter(group => !group.hasImportedVersion && !isExcludedTownshipPaper(group.preferred))
    .map(group => group.preferred)
    .filter(item =>
      isRecentPublicExamYear(item.year)
      && item.status !== "imported"
      && item.status !== "rejected"
      && !isAuditedImportableCandidate(item)
      && !isPublicExamBatchFailure(item)
    );
}

export function selectRetryablePublicExamCandidates(candidates: PublicSourceCandidate[]): PublicSourceCandidate[] {
  return groupPublicExamCandidates(candidates)
    .filter(group => !group.hasImportedVersion && !isExcludedTownshipPaper(group.preferred))
    .map(group => group.preferred)
    .filter(item =>
      isRecentPublicExamYear(item.year)
      && item.status !== "imported"
      && item.status !== "rejected"
      && isPublicExamBatchFailure(item)
    );
}

function preferredBatchAuditQueue(candidates: PublicSourceCandidate[], retryFailuresOnly: boolean): PublicSourceCandidate[] {
  return retryFailuresOnly
    ? selectRetryablePublicExamCandidates(candidates)
    : selectPendingPublicExamAuditCandidates(candidates);
}

function preferredBatchImportQueue(candidates: PublicSourceCandidate[]): PublicSourceCandidate[] {
  return groupPublicExamCandidates(candidates)
    .filter(group => !group.hasImportedVersion && !isExcludedTownshipPaper(group.preferred))
    .map(group => group.members.find(isAuditedImportableCandidate))
    .filter((item): item is PublicSourceCandidate => Boolean(item));
}

export async function auditPublicExamCandidate(candidate: PublicSourceCandidate): Promise<PublicExamBatchAuditResult> {
  if (!isRecentPublicExamYear(candidate.year)) {
    return { candidateId: candidate.id, title: candidate.title, outcome: "skipped", message: "不在最近10年正式题库范围。" };
  }
  if (candidate.status === "imported") {
    return { candidateId: candidate.id, title: candidate.title, outcome: "skipped", message: "该来源已经导入。" };
  }
  if (candidate.status === "rejected") {
    return { candidateId: candidate.id, title: candidate.title, outcome: "skipped", message: "该来源已被人工拒绝。" };
  }

  try {
    const preview = await previewPublicExam(candidate);
    const warnings = flattenWarnings(preview.exam);
    const importable = canImportParsedPublicExam(preview.exam) && warnings.length === 0;
    const audit: PublicExamAuditMetadata = {
      version: PUBLIC_EXAM_AUDIT_VERSION,
      auditedAt: new Date().toISOString(),
      importable,
      materialCount: preview.exam.materials.length,
      taskCount: preview.exam.tasks.length,
      warningCount: warnings.length,
      warnings
    };
    const outcome: "ready" | "blocked" = importable ? "ready" : "blocked";
    const message = importable ? undefined : warnings[0] ?? "结构校验未通过。";
    await persistBatchAttempt(candidate, batchAttempt("audit", outcome, message), {
      audit,
      status: importable ? "reviewed" : candidate.status
    });
    return {
      candidateId: candidate.id,
      title: candidate.title,
      outcome,
      audit,
      ...(message ? { message } : {})
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "公开整卷校验失败。";
    await persistBatchAttempt(candidate, batchAttempt("audit", "error", message));
    return {
      candidateId: candidate.id,
      title: candidate.title,
      outcome: "error",
      message
    };
  }
}

export async function auditPublicExamCandidates(
  candidates: PublicSourceCandidate[],
  options: {
    delayMs?: number;
    maxCandidates?: number;
    retryFailuresOnly?: boolean;
    onProgress?: (progress: PublicExamBatchProgress<PublicExamBatchAuditResult>) => void;
  } = {}
): Promise<PublicExamBatchAuditResult[]> {
  const delayMs = Math.max(250, options.delayMs ?? 500);
  const maxCandidates = Math.max(1, Math.min(options.maxCandidates ?? 500, 500));
  const queue = preferredBatchAuditQueue(candidates, options.retryFailuresOnly === true).slice(0, maxCandidates);
  const results: PublicExamBatchAuditResult[] = [];

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    options.onProgress?.({ index, total: queue.length, current });
    const result = await auditPublicExamCandidate(current);
    results.push(result);
    options.onProgress?.({ index: index + 1, total: queue.length, current, result });
    if (index < queue.length - 1) await delay(delayMs);
  }
  return results;
}

export async function importAuditedPublicExams(
  candidates: PublicSourceCandidate[],
  options: {
    delayMs?: number;
    maxCandidates?: number;
    onProgress?: (progress: PublicExamBatchProgress<PublicExamBatchImportResult>) => void;
  } = {}
): Promise<PublicExamBatchImportResult[]> {
  const delayMs = Math.max(250, options.delayMs ?? 500);
  const maxCandidates = Math.max(1, Math.min(options.maxCandidates ?? 500, 500));
  const queue = preferredBatchImportQueue(candidates).slice(0, maxCandidates);
  const results: PublicExamBatchImportResult[] = [];

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    options.onProgress?.({ index, total: queue.length, current });
    try {
      const preview = await previewPublicExam(current);
      if (!canImportParsedPublicExam(preview.exam)) {
        throw new Error("网页在批量校验后发生变化或当前解析不再通过，已跳过。");
      }
      const imported = await importPublicExam(preview);
      const questionCount = imported.newlyImportedQuestionIds.length + imported.reusedQuestionIds.length;
      await persistBatchAttempt(current, batchAttempt("import", "imported"), { status: "imported" });
      const result: PublicExamBatchImportResult = {
        candidateId: current.id,
        title: current.title,
        outcome: "imported",
        questionCount
      };
      results.push(result);
      options.onProgress?.({ index: index + 1, total: queue.length, current, result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "批量导入失败。";
      await persistBatchAttempt(current, batchAttempt("import", "error", message));
      const result: PublicExamBatchImportResult = {
        candidateId: current.id,
        title: current.title,
        outcome: "error",
        message
      };
      results.push(result);
      options.onProgress?.({ index: index + 1, total: queue.length, current, result });
    }
    if (index < queue.length - 1) await delay(delayMs);
  }
  return results;
}

export function summarizePublicExamAudit(results: PublicExamBatchAuditResult[]) {
  return results.reduce((summary, result) => {
    summary.total += 1;
    summary[result.outcome] += 1;
    return summary;
  }, { total: 0, ready: 0, blocked: 0, error: 0, skipped: 0 });
}

export function summarizePublicExamImport(results: PublicExamBatchImportResult[]) {
  return results.reduce((summary, result) => {
    summary.total += 1;
    summary[result.outcome] += 1;
    if (result.outcome === "imported") summary.questionCount += result.questionCount ?? 0;
    return summary;
  }, { total: 0, imported: 0, error: 0, skipped: 0, questionCount: 0 });
}
