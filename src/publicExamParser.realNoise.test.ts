import { describe, expect, it } from "vitest";
import { canImportParsedPublicExam, parseGkzhentiExamText } from "./publicExamParser";
import type { PublicSourceCandidate } from "./publicSourceStore";

const candidate: PublicSourceCandidate = {
  id: "acceptance-2025-guokao-subprovincial",
  providerId: "gkzhenti-public",
  title: "2025年国家公考《申论》题（副省级）",
  sourceUrl: "https://gwy.gkzhenti.cn/paper/1743902341589",
  year: 2025,
  region: "国家",
  paperVariant: "副省级",
  sourceKind: "public-web",
  discoveredAt: "2026-08-22T18:00:00+08:00",
  status: "reviewed",
  metadata: { recallVersion: false }
};

const spacedReferenceFixture = `
2025年国家公考《申论》题（副省级）
二、给定材料
材料1(10001)
第一则材料正文。
材料4(10004)
第四则材料正文。
三、作答要求
一、
请根据“给定资料 1”，概括主要做法。（15分）
要求：全面、准确、有条理。不超过350字。
二、
如果你是工作人员，请根据“给定 资 料 4”，梳理企业发展中面临的问题，并提出进一步发展的建议。（20分）
要求：问题全面，建议具体。不超过400字。
三、
参考给定资料，联系实际，自拟题目，写一篇文章。（35分）
要求：观点明确，字数1000-1200字。
欢迎使用公开真题库（https://gwy.gkzhenti.cn）
`;

describe("real public-exam spacing noise", () => {
  it("recognizes material references even when source typography inserts spaces inside 资料", () => {
    const exam = parseGkzhentiExamText(spacedReferenceFixture, candidate);

    expect(exam.tasks).toHaveLength(3);
    expect(exam.tasks[0].materialNumbers).toEqual([1]);
    expect(exam.tasks[1].materialNumbers).toEqual([4]);
    expect(exam.tasks[1].questionType).toBe("提出对策");
    expect(exam.tasks[1].warnings).toEqual([]);
    expect(canImportParsedPublicExam(exam)).toBe(true);
  });

  it("also tolerates full-width spaces and spaced 给 定 材 料 typography", () => {
    const text = spacedReferenceFixture.replace("给定 资 料 4", "给　定　材　料 4");
    const exam = parseGkzhentiExamText(text, candidate);

    expect(exam.tasks[1].materialNumbers).toEqual([4]);
    expect(exam.tasks[1].warnings).toEqual([]);
    expect(canImportParsedPublicExam(exam)).toBe(true);
  });
});
