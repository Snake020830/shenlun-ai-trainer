import {
  auditPublicExamCandidates,
  importAuditedPublicExams,
  summarizePublicExamAudit,
  summarizePublicExamImport,
  type PublicExamBatchAuditResult,
  type PublicExamBatchImportResult
} from "./publicExamBatch";
import { groupPublicExamCandidates } from "./publicExamCatalog";
import { discoverProviderCandidates, isRecentPublicExamYear } from "./publicSourceDiscovery";
import { PUBLIC_SOURCE_PROVIDERS } from "./publicSourceProviders";
import { publicSourceStore, type PublicSourceCandidate } from "./publicSourceStore";

export type PublicExamBootstrapPhase = "scan" | "audit" | "import" | "done";

export interface PublicExamBootstrapProgress {
  phase: PublicExamBootstrapPhase;
  done: number;
  total: number;
  title: string;
}

export interface PublicExamBootstrapResult {
  providerId: string;
  /** Unique exam papers after source-version grouping. */
  candidateCount: number;
  /** Source versions discovered during this scan. */
  discoveredThisRun: number;
  audit: ReturnType<typeof summarizePublicExamAudit>;
  import: ReturnType<typeof summarizePublicExamImport>;
  finalImportedPaperCount: number;
}

const BOOTSTRAP_BATCH_SIZE = 500;

function primaryStructuredProvider() {
  const provider = PUBLIC_SOURCE_PROVIDERS.find(item => item.role === "primary-structured");
  if (!provider) throw new Error("没有配置可用于结构化整卷导入的主公开来源。");
  return provider;
}

export function selectBootstrapCandidates(
  candidates: PublicSourceCandidate[],
  providerId: string
): PublicSourceCandidate[] {
  return candidates.filter(item =>
    item.providerId === providerId
    && item.sourceKind === "public-web"
    && isRecentPublicExamYear(item.year)
  );
}

async function auditUntilExhausted(
  providerId: string,
  delayMs: number,
  onProgress?: (progress: PublicExamBootstrapProgress) => void
): Promise<PublicExamBatchAuditResult[]> {
  const results: PublicExamBatchAuditResult[] = [];
  let completedBeforeBatch = 0;

  for (;;) {
    const current = selectBootstrapCandidates(await publicSourceStore.listCandidates(), providerId);
    const batch = await auditPublicExamCandidates(current, {
      delayMs,
      maxCandidates: BOOTSTRAP_BATCH_SIZE,
      onProgress: progress => onProgress?.({
        phase: "audit",
        done: completedBeforeBatch + progress.index,
        total: completedBeforeBatch + progress.total,
        title: progress.current.title
      })
    });
    if (!batch.length) break;
    results.push(...batch);
    completedBeforeBatch += batch.length;
    if (batch.length < BOOTSTRAP_BATCH_SIZE) break;
  }

  return results;
}

async function importUntilExhausted(
  providerId: string,
  delayMs: number,
  onProgress?: (progress: PublicExamBootstrapProgress) => void
): Promise<PublicExamBatchImportResult[]> {
  const results: PublicExamBatchImportResult[] = [];
  let completedBeforeBatch = 0;

  for (;;) {
    const current = selectBootstrapCandidates(await publicSourceStore.listCandidates(), providerId);
    const batch = await importAuditedPublicExams(current, {
      delayMs,
      maxCandidates: BOOTSTRAP_BATCH_SIZE,
      onProgress: progress => onProgress?.({
        phase: "import",
        done: completedBeforeBatch + progress.index,
        total: completedBeforeBatch + progress.total,
        title: progress.current.title
      })
    });
    if (!batch.length) break;
    results.push(...batch);
    completedBeforeBatch += batch.length;
    if (batch.length < BOOTSTRAP_BATCH_SIZE) break;
  }

  return results;
}

/**
 * User-facing, resumable question-bank bootstrap.
 *
 * Existing reviewed/imported state is preserved by the source store. Every safe,
 * warning-free paper is audited and imported automatically. Blocked/error papers
 * remain isolated for later parser maintenance; they never require the learner to
 * manually approve each normal paper before starting practice.
 *
 * Batch helpers intentionally cap a single pass at 500 requests. This coordinator
 * keeps starting another pass until the normal pending queue is exhausted, so a
 * 600+ paper catalog no longer leaves the tail silently unprocessed.
 */
export async function initializeRecentPublicExamLibrary(options: {
  delayMs?: number;
  onProgress?: (progress: PublicExamBootstrapProgress) => void;
} = {}): Promise<PublicExamBootstrapResult> {
  const provider = primaryStructuredProvider();
  const delayMs = Math.max(250, options.delayMs ?? 500);

  options.onProgress?.({ phase: "scan", done: 0, total: 1, title: `扫描 ${provider.name}` });
  const discovered = await discoverProviderCandidates(provider);
  options.onProgress?.({ phase: "scan", done: 1, total: 1, title: `扫描完成：${provider.name}` });

  const auditResults = await auditUntilExhausted(provider.id, delayMs, options.onProgress);
  const importResults = await importUntilExhausted(provider.id, delayMs, options.onProgress);

  const finalCandidates = selectBootstrapCandidates(await publicSourceStore.listCandidates(), provider.id);
  const finalGroups = groupPublicExamCandidates(finalCandidates);
  const finalImportedPaperCount = finalGroups.filter(group => group.hasImportedVersion).length;
  options.onProgress?.({ phase: "done", done: finalImportedPaperCount, total: finalGroups.length, title: "题库自动补全完成" });

  return {
    providerId: provider.id,
    candidateCount: finalGroups.length,
    discoveredThisRun: discovered.length,
    audit: summarizePublicExamAudit(auditResults),
    import: summarizePublicExamImport(importResults),
    finalImportedPaperCount
  };
}
