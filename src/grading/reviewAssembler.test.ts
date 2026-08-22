import { describe, expect, it } from "vitest";
import type { GradingWorkflowArtifacts } from "./artifacts";
import { assembleReview } from "./reviewAssembler";
import { equalRubricDiagnosticPolicy } from "./scorePolicy";

const artifacts: GradingWorkflowArtifacts = {
  schemaVersion: "0.1.0",
  materialCandidates: [],
  rubric: [
    { id: "r1", title: "机构整合", elementType: "measure", candidateIds: ["c1"], evidence: ["一个班子、一套人员"] },
    { id: "r2", title: "审批下沉", elementType: "measure", candidateIds: ["c2"], evidence: ["174项审批事项下沉"] },
    { id: "r3", title: "项目服务", elementType: "measure", candidateIds: ["c3"], evidence: ["首席服务员+项目专员"] }
  ],
  mappings: [
    { rubricPointId: "r1", status: "hit", errorCodes: [], diagnosis: "完整覆盖" },
    { rubricPointId: "r2", status: "partial", errorCodes: ["PARTIAL_COVERAGE"], diagnosis: "对象不完整", suggestion: "补出涉企审批事项" },
    { rubricPointId: "r3", status: "missed", errorCodes: ["OMISSION"], diagnosis: "未覆盖", suggestion: "补充项目服务机制" }
  ],
  wordBudget: {
    charCount: 180,
    wordLimit: 250,
    overLimit: false,
    redundantExcerpts: [],
    lowValueExcerpts: [],
    compressionAdvice: []
  }
};

describe("review assembler", () => {
  it("uses the explicit uncalibrated policy and preserves point evidence", () => {
    const review = assembleReview(20, artifacts, equalRubricDiagnosticPolicy);
    expect(review.score).toBe(10);
    expect(review.coverage).toBe("1 命中 / 1 部分 / 1 遗漏");
    expect(review.calibrationStatus).toBe("uncalibrated");
    expect(review.scoringPolicy).toBe("equal-rubric-diagnostic@0.1.0");
    expect(review.summary).toContain("不代表正式阅卷分");
    expect(review.points[1].evidence).toContain("174项审批事项下沉");
    expect(review.points[1].errorCodes).toEqual(["PARTIAL_COVERAGE"]);
  });

  it("attaches reference cross-check findings without changing the diagnostic score", () => {
    const withReference: GradingWorkflowArtifacts = {
      ...artifacts,
      referenceCrossCheck: {
        source: "老师批改稿",
        blindRubricMissingDimensions: ["老师答案提示还应关注协同机制"],
        referenceOnlyDimensions: [],
        mergeDifferences: ["老师答案将机构整合与审批下沉合并"],
        notes: ["差异仅用于复核"]
      }
    };

    const baseline = assembleReview(20, artifacts, equalRubricDiagnosticPolicy);
    const reviewed = assembleReview(20, withReference, equalRubricDiagnosticPolicy);
    expect(reviewed.score).toBe(baseline.score);
    expect(reviewed.referenceCrossCheck?.source).toBe("老师批改稿");
    expect(reviewed.summary).toContain("不自动改变本次得分");
  });
});