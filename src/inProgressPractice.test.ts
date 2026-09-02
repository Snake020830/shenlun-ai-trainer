import { describe, expect, it } from "vitest";
import { createEssayDrillDraft } from "./essayDrillStore";
import { buildInProgressPractices } from "./inProgressPractice";

describe("buildInProgressPractices", () => {
  it("ignores empty drafts and merges full-answer and essay progress", () => {
    const essay = createEssayDrillDraft();
    essay.theme.quickTitle = "以智慧与勇气开创发展新局";
    essay.outline.quickText = "科技赋能；久久为功；成果转化";
    essay.updatedAt = "2026-09-02T10:02:00.000Z";
    const result = buildInProgressPractices(
      [
        { questionId: "q1", answer: "  ", updatedAt: "2026-09-02T10:00:00.000Z" },
        { questionId: "q2", answer: "一段未完成的答案", updatedAt: "2026-09-02T10:01:00.000Z" }
      ],
      [{ questionId: "q2", draft: essay }],
      []
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ questionId: "q2", answerChars: 8, essayStepCount: 2, hasFullAnswer: true, hasEssayDrill: true });
  });

  it("hides work submitted after its latest draft but keeps a later retry", () => {
    const history = [{ id: "r1", questionId: "q1", title: "题目", score: 10, maxScore: 20, submittedAt: "", submittedAtIso: "2026-09-02T10:00:00.000Z", answer: "已提交" }];
    expect(buildInProgressPractices(
      [{ questionId: "q1", answer: "旧草稿", updatedAt: "2026-09-02T09:00:00.000Z" }], [], history
    )).toEqual([]);
    expect(buildInProgressPractices(
      [{ questionId: "q1", answer: "重新作答", updatedAt: "2026-09-02T11:00:00.000Z" }], [], history
    )).toHaveLength(1);
  });
});
