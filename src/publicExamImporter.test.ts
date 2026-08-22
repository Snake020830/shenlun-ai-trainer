import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedPublicExam } from "./publicExamParser";
import type { PublicSourceCandidate, PublicSourceQuestionLink } from "./publicSourceStore";
import type { LocalQuestionInput, Question } from "./types";

const state = vi.hoisted(() => ({
  links: [] as PublicSourceQuestionLink[],
  created: [] as Question[],
  questionById: new Map<string, Question>(),
  savedSources: [] as string[],
  markedImported: 0
}));

vi.mock("./storage", () => ({
  persistence: {
    addImportedQuestion: vi.fn(async (input: LocalQuestionInput) => {
      const id = input.id ?? `question-${state.created.length + 1}`;
      const materials = input.materials?.length
        ? input.materials.map((material, index) => ({ id: `m${index + 1}`, label: material.label, content: material.content }))
        : input.materialText.split(/\n\s*\n/).map((content, index) => ({ id: `m${index + 1}`, label: `材料 ${index + 1}`, content }));
      const question: Question = {
        id,
        title: input.title,
        year: input.year,
        region: input.region,
        type: input.type,
        difficulty: input.difficulty,
        score: input.score,
        wordLimit: input.wordLimit,
        prompt: input.prompt,
        materials,
        tags: input.tags,
        source: "local"
      };
      state.questionById.set(id, question);
      state.created.push(question);
      return question;
    })
  }
}));

vi.mock("./publicSourceStore", async importOriginal => {
  const actual = await importOriginal<typeof import("./publicSourceStore")>();
  return {
    ...actual,
    publicSourceStore: {
      listCandidateQuestionLinks: vi.fn(async () => [...state.links].sort((a, b) => a.taskIndex - b.taskIndex)),
      saveQuestionSource: vi.fn(async (source: { questionId: string }) => { state.savedSources.push(source.questionId); }),
      linkCandidateQuestion: vi.fn(async (link: PublicSourceQuestionLink) => {
        const existing = state.links.find(item => item.candidateId === link.candidateId && item.taskIndex === link.taskIndex);
        if (!existing) state.links.push(link);
      }),
      markCandidateImported: vi.fn(async () => { state.markedImported += 1; })
    }
  };
});

import { importPublicExam, publicQuestionId } from "./publicExamImporter";

const candidate: PublicSourceCandidate = {
  id: "candidate-1",
  providerId: "gkzhenti-public",
  title: "2025年国家公考《申论》题（地市级）",
  sourceUrl: "https://gwy.gkzhenti.cn/paper/1",
  year: 2025,
  region: "国家",
  paperVariant: "地市级",
  sourceKind: "public-web",
  discoveredAt: "2026-08-22T13:00:00+08:00",
  status: "reviewed",
  metadata: { recallVersion: false }
};

const exam: ParsedPublicExam = {
  title: candidate.title,
  warnings: [],
  materials: [
    { sourceNumber: 1, label: "材料1", content: "材料一第一段。\n\n材料一第二段。" },
    { sourceNumber: 2, label: "材料2", content: "材料二正文。" }
  ],
  tasks: [
    { taskIndex: 0, ordinal: "一", prompt: "根据给定资料1概括做法。（10分）", requirements: "不超过200字。", score: 10, wordLimit: 200, materialNumbers: [1], questionType: "概括归纳", tags: ["公开真题"], warnings: [] },
    { taskIndex: 1, ordinal: "二", prompt: "根据给定资料2提出建议。（20分）", requirements: "不超过300字。", score: 20, wordLimit: 300, materialNumbers: [2], questionType: "提出对策", tags: ["公开真题"], warnings: [] },
    { taskIndex: 2, ordinal: "三", prompt: "联系实际写一篇文章。（40分）", requirements: "字数1000-1200字。", score: 40, wordLimit: 1200, materialNumbers: [], questionType: "文章写作", tags: ["公开真题"], warnings: [] }
  ]
};

beforeEach(() => {
  state.links.length = 0;
  state.created.length = 0;
  state.questionById.clear();
  state.savedSources.length = 0;
  state.markedImported = 0;
});

describe("publicQuestionId", () => {
  it("is stable for the same source/task and different across tasks", () => {
    expect(publicQuestionId(candidate.id, 0)).toBe("publicq:candidate-1:task:1");
    expect(publicQuestionId(candidate.id, 0)).toBe(publicQuestionId(candidate.id, 0));
    expect(publicQuestionId(candidate.id, 1)).not.toBe(publicQuestionId(candidate.id, 0));
  });
});

describe("importPublicExam", () => {
  it("imports every task as its own deterministic local question while keeping the whole material corpus", async () => {
    const result = await importPublicExam({ candidate, exam, retrievedAt: "2026-08-22T13:30:00+08:00" });
    expect(result.newlyImportedQuestionIds).toEqual([
      "publicq:candidate-1:task:1",
      "publicq:candidate-1:task:2",
      "publicq:candidate-1:task:3"
    ]);
    expect(state.created).toHaveLength(3);
    expect(state.created[0].materials).toHaveLength(2);
    expect(state.created[0].materials[0]).toEqual({ id: "m1", label: "材料1", content: "材料一第一段。\n\n材料一第二段。" });
    expect(state.created[1].materials).toHaveLength(2);
    expect(state.created[2].materials).toHaveLength(2);
    expect(state.links.map(item => item.taskIndex)).toEqual([0, 1, 2]);
    expect(state.savedSources).toHaveLength(3);
    expect(state.markedImported).toBe(1);
  });

  it("resumes a partially imported exam without duplicating already linked tasks", async () => {
    state.links.push(
      { candidateId: candidate.id, questionId: "publicq:candidate-1:task:1", taskIndex: 0, createdAt: "2026-08-22T13:00:00+08:00" },
      { candidateId: candidate.id, questionId: "publicq:candidate-1:task:2", taskIndex: 1, createdAt: "2026-08-22T13:01:00+08:00" }
    );
    const result = await importPublicExam({ candidate, exam, retrievedAt: "2026-08-22T13:30:00+08:00" });
    expect(result.reusedQuestionIds).toEqual(["publicq:candidate-1:task:1", "publicq:candidate-1:task:2"]);
    expect(result.newlyImportedQuestionIds).toEqual(["publicq:candidate-1:task:3"]);
    expect(state.created).toHaveLength(1);
    expect(state.links).toHaveLength(3);
    expect(state.markedImported).toBe(1);
  });

  it("uses the same deterministic question id when a prior question write exists but its source link was lost", async () => {
    const deterministicId = publicQuestionId(candidate.id, 0);
    state.questionById.set(deterministicId, {
      id: deterministicId,
      title: "partial previous write",
      year: 2025,
      region: "国家",
      type: "概括归纳",
      difficulty: "进阶",
      score: 10,
      wordLimit: 200,
      prompt: "old",
      materials: [],
      tags: [],
      source: "local"
    });

    await importPublicExam({ candidate, exam, retrievedAt: "2026-08-22T13:30:00+08:00" });

    expect(state.created[0].id).toBe(deterministicId);
    expect(state.questionById.get(deterministicId)?.prompt).toContain("根据给定资料1");
    expect([...state.questionById.keys()].filter(id => id === deterministicId)).toHaveLength(1);
    expect(state.links.find(item => item.taskIndex === 0)?.questionId).toBe(deterministicId);
  });

  it("rejects cached exams outside the rolling recent-10-year product boundary", async () => {
    const oldCandidate: PublicSourceCandidate = {
      ...candidate,
      id: "candidate-old",
      title: "2016年国家公务员考试《申论》卷",
      sourceUrl: "https://gwy.gkzhenti.cn/paper/old",
      year: 2016
    };
    await expect(importPublicExam({ candidate: oldCandidate, exam, retrievedAt: "2026-08-22T13:30:00+08:00" })).rejects.toThrow("最近10年");
    expect(state.created).toHaveLength(0);
    expect(state.markedImported).toBe(0);
  });

  it("fails closed before writing questions when parsed structure is incomplete", async () => {
    const broken: ParsedPublicExam = {
      ...exam,
      tasks: [{ ...exam.tasks[0], wordLimit: null, warnings: ["未识别字数限制"] }]
    };
    await expect(importPublicExam({ candidate, exam: broken, retrievedAt: "2026-08-22T13:30:00+08:00" })).rejects.toThrow("禁止自动写入正式题库");
    expect(state.created).toHaveLength(0);
    expect(state.markedImported).toBe(0);
  });
});
