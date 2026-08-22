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
欢迎使用公开真题库（https://gwy.gkzhenti.cn）
备案编号：浙ICP备00000000号
网站版本：v20260406
`;

const realStyleFixture = `
2024年国家公务员考试《申论》卷（副省级）站友提供版
给定资料
材料1：
第一则材料。
材料2：
第二则材料。
作答要求
第一题：
请根据“给定材料1”，简要总结某企业成功的经验。（10分）
要求：全面、准确、有条理，不超过200字。
第二题：
请根据“给定材料2”，分析问题并提出对策。（20分）
要求：分析全面、对策得当，不超过400字。
第三题：
参考给定材料，联系实际，自选角度，自拟题目，写一篇文章。（40分）
要求：观点明确，结构完整，篇幅1000字左右。
欢迎使用公开真题库（https://gwy.gkzhenti.cn）
网站版本：v20260406
`;

const missingSectionHeadingsFixture = `
2024年某省公务员考试《申论》题（A卷）
材料1(10001)
第一则材料正文。
材料2(10002)
第二则材料正文。
第一题：
请根据材料1概括主要做法。（15分）
要求：全面准确，不超过250字。
第二题：
请根据材料2分析问题并提出对策。（25分）
要求：分析全面，对策具体，不超过500字。
第三题：
参考给定材料，自选角度，自拟题目，写一篇文章。（60分）
要求：观点明确，字数1000-1200字。
`;

const jiangsuHeadinglessFixture = `
2018年江苏省公考《申论》真题（A类）
二、给定材料
材料1
材料一正文。
材料2
材料二正文。
材料3
材料三正文。
材料4
材料四正文。
材料5
材料五正文。
三、作答要求
“给定资料3～5”列举的事例体现了心系他人的一些优良品质，请分别概括这些优良品质的具体表现。（15分）
要求：紧扣给定资料，准确全面，条理清楚。篇幅不超过200字。
“给定资料4”中展示了不同观点。对此，请谈谈你的看法。（20分）
要求：准确全面，分析透彻，观点正确。篇幅250字左右。
请以“给定资料5”中李阿姨女儿的名义，给刘医生所在医院写一封感谢信。（25分）
要求：（1）内容完整，条理清晰；（2）情感真挚，有感染力；（3）篇幅400字左右。
请结合对材料中一句话的理解，联系实际，自拟标题，写一篇议论文。（40分）
要求：（1）观点明确；（2）结构完整；（3）篇幅1000字左右。
`;

const multilineRequirementsFixture = `
2026年国家公考《申论》题（副省级）
给定材料
材料1
材料一正文。
材料2
材料二正文。
作答要求
一、
请根据“给定资料1”，概括主要做法。（10分）
要求：全面准确，有条理，不超过250字。
二、
“给定资料2”是一篇新闻报道，请围绕这篇报道写一则短评。（20分）
要求：
（1）观点明确，重点突出；
（2）语言流畅，逻辑清晰；
（3）不超过450字。
三、
参考给定资料，联系实际，自选角度，自拟题目，写一篇文章。（70分）
要求：
（1）观点明确，见解深刻；
（2）思路清晰，语言流畅；
（3）字数1000-1200字。
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

  it("supports real-source headings like 材料1： and 第一题：", () => {
    const exam = parseGkzhentiExamText(realStyleFixture, candidate);
    expect(exam.warnings).toEqual([]);
    expect(exam.materials.map(item => item.label)).toEqual(["材料1", "材料2"]);
    expect(exam.tasks).toHaveLength(3);
    expect(exam.tasks[0].ordinal).toBe("一");
    expect(exam.tasks[0].materialNumbers).toEqual([1]);
    expect(exam.tasks[1].questionType).toBe("提出对策");
    expect(exam.tasks[1].tags).toContain("复合题");
    expect(exam.tasks[2].questionType).toBe("文章写作");
    expect(exam.tasks[2].wordLimit).toBe(1000);
    expect(canImportParsedPublicExam(exam)).toBe(true);
  });

  it("supports recent Jiangsu papers whose task section has no explicit task ordinals", () => {
    const exam = parseGkzhentiExamText(jiangsuHeadinglessFixture, candidate);
    expect(exam.warnings).toEqual([]);
    expect(exam.tasks).toHaveLength(4);
    expect(exam.tasks[0].score).toBe(15);
    expect(exam.tasks[0].wordLimit).toBe(200);
    expect(exam.tasks[0].materialNumbers).toEqual([3, 4, 5]);
    expect(exam.tasks[1].questionType).toBe("综合分析");
    expect(exam.tasks[2].questionType).toBe("贯彻执行");
    expect(exam.tasks[2].wordLimit).toBe(400);
    expect(exam.tasks[3].questionType).toBe("文章写作");
    expect(canImportParsedPublicExam(exam)).toBe(true);
  });

  it("keeps multiline requirement lists attached to the correct recent-paper task", () => {
    const exam = parseGkzhentiExamText(multilineRequirementsFixture, candidate);
    expect(exam.warnings).toEqual([]);
    expect(exam.tasks).toHaveLength(3);
    expect(exam.tasks[1].questionType).toBe("贯彻执行");
    expect(exam.tasks[1].wordLimit).toBe(450);
    expect(exam.tasks[1].requirements).toContain("（1）观点明确");
    expect(exam.tasks[1].requirements).toContain("（3）不超过450字");
    expect(exam.tasks[2].wordLimit).toBe(1200);
    expect(canImportParsedPublicExam(exam)).toBe(true);
  });

  it("conservatively infers boundaries when section headings are omitted but clear material/task sequences remain", () => {
    const exam = parseGkzhentiExamText(missingSectionHeadingsFixture, candidate);
    expect(exam.warnings).toEqual([]);
    expect(exam.materials).toHaveLength(2);
    expect(exam.materials[0].content).toBe("第一则材料正文。");
    expect(exam.materials[1].content).toBe("第二则材料正文。");
    expect(exam.tasks).toHaveLength(3);
    expect(exam.tasks[0].materialNumbers).toEqual([1]);
    expect(exam.tasks[1].materialNumbers).toEqual([2]);
    expect(canImportParsedPublicExam(exam)).toBe(true);
  });

  it("does not infer a task section from one ambiguous standalone numbered line", () => {
    const ambiguous = parseGkzhentiExamText(`材料1：\n正文。\n材料2：\n正文中出现编号。\n一、\n只是材料里的一个孤立编号。`, candidate);
    expect(canImportParsedPublicExam(ambiguous)).toBe(false);
    expect(ambiguous.warnings.some(item => item.includes("无法可靠推断连续题号边界"))).toBe(true);
  });

  it("keeps requirements separate from the substantive prompt", () => {
    const exam = parseGkzhentiExamText(fixture, candidate);
    expect(exam.tasks[0].prompt).toContain("生态实践智慧");
    expect(exam.tasks[0].prompt).not.toContain("全面、准确");
    expect(exam.tasks[0].requirements).toContain("全面、准确、有条理");
  });

  it("removes website footer text from the final essay requirement", () => {
    const exam = parseGkzhentiExamText(fixture, candidate);
    expect(exam.tasks[4].requirements).toContain("1000-1200字");
    expect(exam.tasks[4].requirements).not.toContain("欢迎使用公开真题库");
    expect(exam.tasks[4].requirements).not.toContain("备案编号");
  });

  it("is importable only when the page structure and every task-level warning is resolved", () => {
    expect(canImportParsedPublicExam(parseGkzhentiExamText(fixture, candidate))).toBe(true);

    const broken = parseGkzhentiExamText(`二、给定材料\n材料1\n正文。\n三、作答要求\n第一题：\n概括材料内容。（10分）\n要求：不超过200字。`, candidate);
    expect(canImportParsedPublicExam(broken)).toBe(false);
    expect(broken.tasks[0].warnings).toContain("未识别明确材料编号；默认导入整卷材料，需人工核验。");
  });
});

describe("inferPublicQuestionType", () => {
  it("uses conservative rule-based task classification", () => {
    expect(inferPublicQuestionType("请概括主要做法。")).toBe("概括归纳");
    expect(inferPublicQuestionType("分析这一现象产生的原因。")).toBe("综合分析");
    expect(inferPublicQuestionType("对此，请谈谈你的看法。")).toBe("综合分析");
    expect(inferPublicQuestionType("针对问题提出进一步改进建议。")).toBe("提出对策");
    expect(inferPublicQuestionType("拟写一份工作简报。")).toBe("贯彻执行");
    expect(inferPublicQuestionType("围绕新闻报道写一则短评。")).toBe("贯彻执行");
    expect(inferPublicQuestionType("给医院写一封感谢信。")).toBe("贯彻执行");
    expect(inferPublicQuestionType("自选角度，自拟题目，写一篇文章。")).toBe("文章写作");
  });
});
