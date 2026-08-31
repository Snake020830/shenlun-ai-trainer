import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicSourceCandidate } from "./publicSourceStore";

const state = vi.hoisted(() => ({
  candidates: [] as PublicSourceCandidate[],
  discovered: [] as PublicSourceCandidate[],
  auditCalls: 0,
  importCalls: 0
}));

vi.mock("./publicSourceDiscovery", () => ({
  discoverProviderCandidates: vi.fn(async () => {
    state.candidates = [...state.discovered, ...state.candidates.filter(existing => !state.discovered.some(item => item.id === existing.id))];
    return state.discovered;
  }),
  isRecentPublicExamYear: (year: number | undefined) => typeof year === "number" && year >= 2017 && year <= 2026
}));

vi.mock("./publicSourceStore", () => ({
  publicSourceStore: {
    listCandidates: vi.fn(async () => state.candidates)
  }
}));

vi.mock("./publicExamBatch", () => ({
  auditPublicExamCandidates: vi.fn(async (candidates: PublicSourceCandidate[], options: { maxCandidates?: number; onProgress?: (progress: { index: number; total: number; current: PublicSourceCandidate }) => void }) => {
    state.auditCalls += 1;
    const pending = candidates.filter(item => item.status === "discovered").slice(0, options.maxCandidates ?? 500);
    pending.forEach((item, index) => {
      options.onProgress?.({ index, total: pending.length, current: item });
      item.status = "reviewed";
      options.onProgress?.({ index: index + 1, total: pending.length, current: item });
    });
    return pending.map(item => ({ candidateId: item.id, title: item.title, outcome: "ready" as const }));
  }),
  importAuditedPublicExams: vi.fn(async (candidates: PublicSourceCandidate[], options: { maxCandidates?: number; onProgress?: (progress: { index: number; total: number; current: PublicSourceCandidate }) => void }) => {
    state.importCalls += 1;
    const ready = candidates.filter(item => item.status === "reviewed").slice(0, options.maxCandidates ?? 500);
    ready.forEach((item, index) => {
      options.onProgress?.({ index, total: ready.length, current: item });
      item.status = "imported";
      options.onProgress?.({ index: index + 1, total: ready.length, current: item });
    });
    return ready.map(item => ({ candidateId: item.id, title: item.title, outcome: "imported" as const, questionCount: 3 }));
  }),
  summarizePublicExamAudit: (results: Array<{ outcome: "ready" | "blocked" | "error" | "skipped" }>) => results.reduce((summary, result) => {
    summary.total += 1;
    summary[result.outcome] += 1;
    return summary;
  }, { total: 0, ready: 0, blocked: 0, error: 0, skipped: 0 }),
  summarizePublicExamImport: (results: Array<{ outcome: "imported" | "error" | "skipped"; questionCount?: number }>) => results.reduce((summary, result) => {
    summary.total += 1;
    summary[result.outcome] += 1;
    if (result.outcome === "imported") summary.questionCount += result.questionCount ?? 0;
    return summary;
  }, { total: 0, imported: 0, error: 0, skipped: 0, questionCount: 0 })
}));

import { initializeRecentPublicExamLibrary, selectBootstrapCandidates } from "./publicExamBootstrap";

function candidate(id: string, overrides: Partial<PublicSourceCandidate> = {}): PublicSourceCandidate {
  return {
    id,
    providerId: "gkzhenti-public",
    title: `2025年申论真题 ${id}`,
    sourceUrl: `https://gwy.gkzhenti.cn/paper/${id}`,
    year: 2025,
    region: "国家",
    sourceKind: "public-web",
    discoveredAt: "2026-08-22T12:00:00+08:00",
    status: "discovered",
    ...overrides
  };
}

beforeEach(() => {
  state.candidates = [];
  state.discovered = [];
  state.auditCalls = 0;
  state.importCalls = 0;
});

describe("selectBootstrapCandidates", () => {
  it("keeps only recent structured-provider HTML candidates", () => {
    const selected = selectBootstrapCandidates([
      candidate("ok"),
      candidate("other-provider", { providerId: "other" }),
      candidate("pdf", { sourceKind: "public-pdf" }),
      candidate("old", { year: 2016 })
    ], "gkzhenti-public");
    expect(selected.map(item => item.id)).toEqual(["ok"]);
  });
});

describe("initializeRecentPublicExamLibrary", () => {
  it("scans, audits pending papers, imports reviewed papers, and reports progress", async () => {
    state.discovered = [candidate("new")];
    state.candidates = [candidate("existing-reviewed", { status: "reviewed" })];
    const phases: string[] = [];

    const result = await initializeRecentPublicExamLibrary({
      delayMs: 250,
      onProgress: progress => phases.push(progress.phase)
    });

    expect(state.auditCalls).toBe(1);
    expect(state.importCalls).toBe(1);
    expect(result.discoveredThisRun).toBe(1);
    expect(result.audit.ready).toBe(1);
    expect(result.import.imported).toBe(2);
    expect(result.import.questionCount).toBe(6);
    expect(result.finalImportedPaperCount).toBe(2);
    expect(phases).toContain("scan");
    expect(phases).toContain("audit");
    expect(phases).toContain("import");
    expect(phases.at(-1)).toBe("done");
  });

  it("continues with additional batches when the catalog exceeds the 500-paper helper limit", async () => {
    state.discovered = Array.from({ length: 501 }, (_, index) => candidate(`paper-${index + 1}`));

    const result = await initializeRecentPublicExamLibrary({ delayMs: 250 });

    expect(state.auditCalls).toBe(2);
    expect(state.importCalls).toBe(2);
    expect(result.audit.ready).toBe(501);
    expect(result.import.imported).toBe(501);
    expect(result.finalImportedPaperCount).toBe(501);
  });

  it("is resumable: already imported papers are not re-audited or re-imported by batch queues", async () => {
    state.discovered = [candidate("already", { status: "imported" })];

    const result = await initializeRecentPublicExamLibrary({ delayMs: 250 });

    expect(result.finalImportedPaperCount).toBe(1);
    expect(result.audit.total).toBe(0);
    expect(result.import.total).toBe(0);
  });
});
