import { describe, expect, it } from "vitest";
import { inferPublicQuestionType } from "./publicExamParser";

describe("real national-exam task wording", () => {
  it("routes relationship-and-mechanism explanation to comprehensive analysis", () => {
    expect(inferPublicQuestionType(
      "“给定资料1”提到了三条“黄河”，请你谈谈这三条“黄河”分别指的是什么，并说明它们是如何协同发挥作用的。"
    )).toBe("综合分析");
  });

  it("keeps ordinary process-summary prompts as summarization", () => {
    expect(inferPublicQuestionType(
      "请你谈谈在这一事例中，政府与企业是如何通过良性互动实现成功治水的。"
    )).toBe("概括归纳");
  });

  it("routes a drafted work guide to implementation writing", () => {
    expect(inferPublicQuestionType(
      "根据给定资料3，请你草拟该指南中的工作事项及其相应工作内容。"
    )).toBe("贯彻执行");
  });

  it("routes a problem-plus-recommendation task to countermeasures", () => {
    expect(inferPublicQuestionType(
      "请根据给定资料4，梳理企业发展中面临的问题，并提出进一步推动产业发展的建议。"
    )).toBe("提出对策");
  });
});
