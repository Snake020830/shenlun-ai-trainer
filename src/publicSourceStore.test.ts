import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => false }));

import {
  publicSourceStore,
  type PublicSourceCandidate,
  type QuestionSourceProvenance
} from "./publicSourceStore";

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(key: string) { return this.data.get(key) ?? null; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string) { this.data.delete(key); }
  setItem(key: string, value: string) { this.data.set(key, String(value)); }
}

beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: new MemoryStorage()
  });
});

const candidate: PublicSourceCandidate = {
  id: "source-2025-guokao-dishi",
  providerId: "gkzhenti-public",
  title: "2025年国家公考《申论》题（地市级）",
  sourceUrl: "https://example.com/2025-guokao-dishi",
  year: 2025,
  region: "国家",
  paperVariant: "地市级",
  sourceKind: "public-web",
  discoveredAt: "2026-08-22T13:00:00+08:00",
  status: "discovered",
  metadata: { recallVersion: false }
};

describe("publicSourceStore", () => {
  it("upserts candidates by id or source URL without duplicating the catalog", async () => {
    await publicSourceStore.upsertCandidate(candidate);
    await publicSourceStore.upsertCandidate({ ...candidate, title: "更新后的标题", status: "reviewed" });
    const rows = await publicSourceStore.listCandidates();
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("更新后的标题");
    expect(rows[0].status).toBe("reviewed");
  });

  it("does not demote reviewed workflow state when the same source is rediscovered", async () => {
    await publicSourceStore.upsertCandidate({ ...candidate, status: "reviewed" });
    await publicSourceStore.upsertCandidate({
      ...candidate,
      title: "重新扫描得到的新标题",
      status: "discovered",
      discoveredAt: "2026-08-23T09:00:00+08:00"
    });
    const rows = await publicSourceStore.listCandidates();
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("重新扫描得到的新标题");
    expect(rows[0].status).toBe("reviewed");
    expect(rows[0].discoveredAt).toBe(candidate.discoveredAt);
  });

  it("does not demote imported sources or lose their legacy question pointer during rescans", async () => {
    await publicSourceStore.upsertCandidate(candidate);
    await publicSourceStore.markCandidateImported(candidate.id, "question-1");
    await publicSourceStore.upsertCandidate({ ...candidate, status: "discovered" });
    const rows = await publicSourceStore.listCandidates();
    expect(rows[0].status).toBe("imported");
    expect(rows[0].importedQuestionId).toBe("question-1");
  });

  it("links one exam source to multiple local questions by task index", async () => {
    await publicSourceStore.linkCandidateQuestion({
      candidateId: candidate.id,
      questionId: "question-1",
      taskIndex: 0,
      createdAt: "2026-08-22T13:20:00+08:00"
    });
    await publicSourceStore.linkCandidateQuestion({
      candidateId: candidate.id,
      questionId: "question-2",
      taskIndex: 1,
      createdAt: "2026-08-22T13:21:00+08:00"
    });
    const links = await publicSourceStore.listCandidateQuestionLinks(candidate.id);
    expect(links.map(item => [item.taskIndex, item.questionId])).toEqual([
      [0, "question-1"],
      [1, "question-2"]
    ]);
    expect(await publicSourceStore.listQuestionSourceLinks("question-2")).toHaveLength(1);
  });

  it("refuses to map two questions onto the same source task index", async () => {
    await publicSourceStore.linkCandidateQuestion({
      candidateId: candidate.id,
      questionId: "question-1",
      taskIndex: 0,
      createdAt: "2026-08-22T13:20:00+08:00"
    });
    await expect(publicSourceStore.linkCandidateQuestion({
      candidateId: candidate.id,
      questionId: "question-other",
      taskIndex: 0,
      createdAt: "2026-08-22T13:22:00+08:00"
    })).rejects.toThrow("already linked to another question");
  });

  it("marks an imported source without losing source metadata", async () => {
    await publicSourceStore.upsertCandidate(candidate);
    await publicSourceStore.markCandidateImported(candidate.id, "question-1");
    const rows = await publicSourceStore.listCandidates();
    expect(rows[0].status).toBe("imported");
    expect(rows[0].importedQuestionId).toBe("question-1");
    expect(rows[0].sourceUrl).toBe(candidate.sourceUrl);
  });

  it("persists question provenance separately from the question body", async () => {
    const source: QuestionSourceProvenance = {
      questionId: "question-1",
      sourceKind: "public-web",
      sourceName: "公开真题来源",
      sourceUrl: candidate.sourceUrl,
      sourceTitle: candidate.title,
      retrievedAt: "2026-08-22T13:10:00+08:00",
      importedAt: "2026-08-22T13:11:00+08:00",
      contentHash: "sha256:test",
      rightsNote: "公开可访问来源；仅本机训练使用。",
      isRecallVersion: false
    };
    await publicSourceStore.saveQuestionSource(source);
    expect(await publicSourceStore.getQuestionSource("question-1")).toEqual(source);
  });

  it("requires a source URL for public provenance", async () => {
    await expect(publicSourceStore.saveQuestionSource({
      questionId: "question-1",
      sourceKind: "public-web",
      importedAt: "2026-08-22T13:11:00+08:00",
      isRecallVersion: true
    })).rejects.toThrow("requires a source URL");
  });

  it("rejects non-http source URLs", async () => {
    await expect(publicSourceStore.upsertCandidate({
      ...candidate,
      sourceUrl: "file:///C:/exam.html"
    })).rejects.toThrow("HTTP or HTTPS");
  });
});
