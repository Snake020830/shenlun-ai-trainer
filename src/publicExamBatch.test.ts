import { describe, expect, it } from "vitest";
import {
  getCandidateAudit,
  getCandidateBatchAttempt,
  isAuditedImportableCandidate,
  PUBLIC_EXAM_AUDIT_VERSION,
  PUBLIC_EXAM_BATCH_STATE_VERSION,
  selectPendingPublicExamAuditCandidates,
  selectRetryablePublicExamCandidates,
  summarizePublicExamAudit,
  summarizePublicExamImport
} from "./publicExamBatch";
import type { PublicSourceCandidate } from "./publicSourceStore";

function candidate(overrides: Partial<PublicSourceCandidate> = {}): PublicSourceCandidate {
  return {
    id: "candidate-1",
    providerId: "gkzhenti-public",
    title: "2025年国家公考《申论》题（地市级）",
    sourceUrl: "https://gwy.gkzhenti.cn/paper/1",
    year: 2025,
    region: "国家",
    paperVariant: "地市级",
    sourceKind: "public-web",
    discoveredAt: "2026-08-22T15:00:00+08:00",
    status: "reviewed",
    metadata: {
      parserAudit: {
        version: PUBLIC_EXAM_AUDIT_VERSION,
        auditedAt: "2026-08-22T15:01:00+08:00",
        importable: true,
        materialCount: 5,
        taskCount: 5,
        warningCount: 0,
        warnings: []
      }
    },
    ...overrides
  };
}

function batchAttempt(outcome: "ready" | "blocked" | "error" | "imported") {
  return {
    version: PUBLIC_EXAM_BATCH_STATE_VERSION,
    phase: outcome === "imported" ? "import" as const : "audit" as const,
    outcome,
    attemptedAt: "2026-08-22T15:02:00+08:00"
  };
}

describe("public exam batch audit gates", () => {
  it("recognizes only current-version, parser-clean reviewed candidates as batch importable", () => {
    expect(isAuditedImportableCandidate(candidate())).toBe(true);
    expect(isAuditedImportableCandidate(candidate({ status: "discovered" }))).toBe(false);
    expect(isAuditedImportableCandidate(candidate({ year: 2016 }))).toBe(false);
    expect(isAuditedImportableCandidate(candidate({ metadata: { parserAudit: { version: "old" } } }))).toBe(false);
  });

  it("returns validated audit and batch-attempt metadata while rejecting malformed values", () => {
    expect(getCandidateAudit(candidate())?.taskCount).toBe(5);
    expect(getCandidateBatchAttempt(candidate({
      metadata: {
        batchAttempt: batchAttempt("error")
      }
    }))?.outcome).toBe("error");

    const malformedAudit = candidate({
      metadata: {
        parserAudit: {
          version: PUBLIC_EXAM_AUDIT_VERSION,
          auditedAt: "x",
          importable: true,
          materialCount: 2,
          taskCount: 2,
          warningCount: 0,
          warnings: [1]
        }
      }
    });
    expect(getCandidateAudit(malformedAudit)).toBeNull();
    expect(getCandidateBatchAttempt(candidate({ metadata: { batchAttempt: { version: "old" } } }))).toBeNull();
  });

  it("does not re-audit clean reviewed exams and isolates current-version failures for retry", () => {
    const ready = candidate({ id: "ready", sourceUrl: "https://gwy.gkzhenti.cn/paper/ready", region: "国家" });
    const pending = candidate({
      id: "pending",
      sourceUrl: "https://gwy.gkzhenti.cn/paper/pending",
      title: "2025年广东省考《申论》A卷",
      region: "广东",
      paperVariant: "A卷",
      status: "discovered",
      metadata: {}
    });
    const failed = candidate({
      id: "failed",
      sourceUrl: "https://gwy.gkzhenti.cn/paper/failed",
      title: "2025年江苏省考《申论》A卷",
      region: "江苏",
      paperVariant: "A卷",
      status: "discovered",
      metadata: { batchAttempt: batchAttempt("error") }
    });
    const blocked = candidate({
      id: "blocked",
      sourceUrl: "https://gwy.gkzhenti.cn/paper/blocked",
      title: "2025年浙江省考《申论》A卷",
      region: "浙江",
      paperVariant: "A卷",
      status: "discovered",
      metadata: { batchAttempt: batchAttempt("blocked") }
    });

    expect(selectPendingPublicExamAuditCandidates([ready, pending, failed, blocked]).map(item => item.id)).toEqual(["pending"]);
    expect(selectRetryablePublicExamCandidates([ready, pending, failed, blocked]).map(item => item.id).sort()).toEqual(["blocked", "failed"]);
  });

  it("invalidates stale audit/failure cache after parser contract changes so bootstrap re-audits it", () => {
    const staleBlocked = candidate({
      id: "stale-blocked",
      sourceUrl: "https://gwy.gkzhenti.cn/paper/stale-blocked",
      title: "2025年国家公考《申论》题（副省级）",
      paperVariant: "副省级",
      status: "discovered",
      metadata: {
        parserAudit: {
          version: "public-exam-audit@0.1.0",
          auditedAt: "2026-08-22T12:00:00+08:00",
          importable: false,
          materialCount: 4,
          taskCount: 5,
          warningCount: 1,
          warnings: ["旧 parser 未识别材料引用"]
        },
        batchAttempt: {
          version: "public-exam-batch@0.1.0",
          phase: "audit",
          outcome: "blocked",
          attemptedAt: "2026-08-22T12:00:00+08:00"
        }
      }
    });

    expect(getCandidateAudit(staleBlocked)).toBeNull();
    expect(getCandidateBatchAttempt(staleBlocked)).toBeNull();
    expect(selectRetryablePublicExamCandidates([staleBlocked])).toEqual([]);
    expect(selectPendingPublicExamAuditCandidates([staleBlocked]).map(item => item.id)).toEqual(["stale-blocked"]);
  });

  it("summarizes audit and import batches for UI progress reporting", () => {
    expect(summarizePublicExamAudit([
      { candidateId: "1", title: "a", outcome: "ready" },
      { candidateId: "2", title: "b", outcome: "blocked" },
      { candidateId: "3", title: "c", outcome: "error" }
    ])).toEqual({ total: 3, ready: 1, blocked: 1, error: 1, skipped: 0 });

    expect(summarizePublicExamImport([
      { candidateId: "1", title: "a", outcome: "imported", questionCount: 5 },
      { candidateId: "2", title: "b", outcome: "imported", questionCount: 4 },
      { candidateId: "3", title: "c", outcome: "error" }
    ])).toEqual({ total: 3, imported: 2, error: 1, skipped: 0, questionCount: 9 });
  });
});
