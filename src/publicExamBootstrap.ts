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

/**
 * User-facing, resumable question-bank bootstrap.
 *
 * Existing reviewed/imported state is preserved by the source store. The audit/import
 * helpers only process their pending queues, so rerunning this function continues from
 * the last successful phase instead of duplicating questions. Known blocked/error
 * candidates are deliberately left for the explicit "retry failures" action.
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

  const afterScan = selectBootstrapCandidates(await publicSourceStore.listCandidates(), provider.id);
  let auditResults: PublicExamBatchAuditResult[] = [];
  if (afterScan.length) {
    auditResults = await auditPublicExamCandidates(afterScan, {
      delayMs,
      onProgress: progress => options.onProgress?.({
        phase: "audit",
        done: progress.index,
        total: progress.total,
        title: progress.current.title
      })
    });
  }

  // Re-read after audit because status/audit metadata is persisted by the batch layer.
  const afterAudit = selectBootstrapCandidates(await publicSourceStore.listCandidates(), provider.id);
  let importResults: PublicExamBatchImportResult[] = [];
  if (afterAudit.length) {
    importResults = await importAuditedPublicExams(afterAudit, {
      delayMs,
      onProgress: progress => options.onProgress?.({
        phase: "import",
        done: progress.index,
        total: progress.total,
        title: progress.current.title
      })
    });
  }

  const finalCandidates = selectBootstrapCandidates(await publicSourceStore.listCandidates(), provider.id);
  const finalGroups = groupPublicExamCandidates(finalCandidates);
  const finalImportedPaperCount = finalGroups.filter(group => group.hasImportedVersion).length;
  options.onProgress?.({ phase: "done", done: finalImportedPaperCount, total: finalGroups.length, title: "题库初始化完成" });

  return {
    providerId: provider.id,
    candidateCount: finalGroups.length,
    discoveredThisRun: discovered.length,
    audit: summarizePublicExamAudit(auditResults),
    import: summarizePublicExamImport(importResults),
    finalImportedPaperCount
  };
}
