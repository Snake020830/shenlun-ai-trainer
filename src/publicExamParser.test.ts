import { describe, expect, it } from "vitest";
import { canImportParsedPublicExam, inferPublicQuestionType, parseGkzhentiExamText } from "./publicExamParser";
import type { PublicSourceCandidate } from "./publicSourceStore";

const candidate: PublicSourceCandidate = {
  id: "candidate-2025-guokao",
  providerId: "gkzhenti-public",
  title: "2025年国家公考《申论》题（地市级）（网友回忆版）",
  sourceUrl: "https://gwy.gkzhenti.cn/paper/1739531136525",
  year: 2025,
  region: "国家",
  paperVariant: "地市级",
  sourceKind: "public-web",
  discoveredAt: "2026-08-22T13:00:00+08:00",
  status: "reviewed",
  metadata: { recallVersion: true }
};

const fixture = `
2025年国家公考《申论》题（地市级）（网友回忆版）
一、注意事项
略。
二、给定材料
材料1(4107573)
第一则材料第一段。

第一则材料第二段。
材料2(7536851)
第二则材料。
材料3(7791804)
第三则材料。
材料4(6015602)
第四则材料。
三、作答要求
一、
请根据“给定资料 1”，谈谈某地的“生态实践智慧”体现在哪些方面。（10分）
要求：全面、准确、有条理。不超过200字。
二、
“给定资料 2”介绍了企业与政府合力治水的事例。请谈谈双方如何通过良性互动实现成功治水。（15分）
要求：理解准确，内容全面，逻辑清晰。不超过300字。
三、
假如你是改革工作组成员，请根据“给定资料 3”，梳理改革已取得的成效并提出进一步深化改革的建议。（20分）
要求：紧扣资料；层次分明；不超过450字。
四、
假如你是政协委员，请根据“给定资料 4”，拟写“提案案由”和“建议”两部分的内容。（20分）
要求：理由充分，建议明确可行，条理清晰。不超过500字。
五、
给定资料反映了事物间的“互补”关系。请联系实际，自选角度，自拟题目，写一篇文章。（35分）
要求：观点明确；参考给定资料但不拘泥；字数1000-1200字。
`;

describe("parseGkzhentiExamText", () => {
  it("extracts the full material corpus without losing natural paragraph breaks", () => {
    const exam = parseGkzhentiExamText(fixture, candidate);
    expect(exam.materials).toHaveLength(4);
    expect(exam.materials[0]).toEqual({
      sourceNumber: 1,
      label: "材料1",
      content: "第一则材料第一段。\n\n第一则材料第二段。"
    });
    expect(exam.materials[3].label).toBe("材料4");
  });

  it("extracts score, word limit, referenced material and task type", () => {
    const exam = parseGkzhentiExamText(fixture, candidate);
    expect(exam.tasks).toHaveLength(5);
    expect(exam.tasks[0].score).toBe(10);
    expect(exam.tasks[0].wordLimit).toBe(200);
    expect(exam.tasks[0].materialNumbers).toEqual([1]);
    expect(exam.tasks[0].questionType).toBe("概括归纳");

    expect(exam.tasks[2].score).toBe(20);
    expect(exam.tasks[2].wordLimit).toBe(450);
    expect(exam.tasks[2].materialNumbers).toEqual([3]);
    expect(exam.tasks[2].questionType).toBe("提出对策");
    expect(exam.tasks[2].tags).toContain("复合题");

    expect(exam.tasks[3].questionType).toBe("贯彻执行");
    expect(exam.tasks[4].questionType).toBe("文章写作");
    expect(exam.tasks[4].wordLimit).toBe(1200);
  });

  it("keeps requirements separate from the substantive prompt", () => {
    const exam = parseGkzhentiExamText(fixture, candidate);
    expect(exam.tasks[0].prompt).toContain("生态实践智慧");
    expect(exam.tasks[0].prompt).not.toContain("全面、准确");
    expect(exam.tasks[0].requirements).toContain("全面、准确、有条理");
  });

  it("is importable only when the page structure and every required numeric field are complete", () => {
    expect(canImportParsedPublicExam(parseGkzhentiExamText(fixture, candidate))).toBe(true);

    const broken = parseGkzhentiExamText(`二、给定材料\n材料1\n正文。\n三、作答要求\n一、\n概括材料内容。`, candidate);
    expect(canImportParsedPublicExam(broken)).toBe(false);
    expect(broken.tasks[0].warnings.length).toBeGreaterThan(0);
  });
});

describe("inferPublicQuestionType", () => {
  it("uses conservative rule-based task classification", () => {
    expect(inferPublicQuestionType("请概括主要做法。")) .toBe("概括归纳");
    expect(inferPublicQuestionType("分析这一现象产生的原因。")) .toBe("综合分析");
    expect(inferPublicQuestionType("针对问题提出进一步改进建议。")) .toBe("提出对策");
    expect(inferPublicQuestionType("拟写一份工作简报。")) .toBe("贯彻执行");
    expect(inferPublicQuestionType("自选角度，自拟题目，写一篇文章。")) .toBe("文章写作");
  });
});
