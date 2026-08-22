import { describe, expect, it } from "vitest";
import {
  getCandidateAudit,
  isAuditedImportableCandidate,
  PUBLIC_EXAM_AUDIT_VERSION,
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

describe("public exam batch audit gates", () => {
  it("recognizes only current-version, parser-clean reviewed candidates as batch importable", () => {
    expect(isAuditedImportableCandidate(candidate())).toBe(true);
    expect(isAuditedImportableCandidate(candidate({ status: "discovered" }))).toBe(false);
    expect(isAuditedImportableCandidate(candidate({ year: 2016 }))).toBe(false);
    expect(isAuditedImportableCandidate(candidate({ metadata: { parserAudit: { version: "old" } } }))).toBe(false);
  });

  it("returns validated audit metadata and rejects malformed metadata", () => {
    expect(getCandidateAudit(candidate())?.taskCount).toBe(5);
    const malformed = candidate({
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
    expect(getCandidateAudit(malformed)).toBeNull();
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
