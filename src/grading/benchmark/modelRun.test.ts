import { describe, expect, it } from "vitest";
import type { GradingProviderOutput } from "../contracts";
import { createBenchmarkModelRun } from "./modelRun";
import { GRADING_WORKFLOW_VERSION, STAGE_PROMPTSET_VERSION } from "../versions";

const output: GradingProviderOutput = {
  review: {
    score: 8,
    maxScore: 10,
    coverage: "1 命中 / 0 部分 / 0 遗漏",
    classification: "清晰",
    expression: "较清楚",
    redundancy: "较低",
    summary: "测试输出",
    points: [],
    providerId: "remote:test",
    rulesetVersion: "shenlun-grading@0.1.0",
    scoringPolicy: "equal-rubric-diagnostic@0.1.0",
    generatedAt: "2026-08-22T09:45:00+08:00"
  },
  artifacts: {
    schemaVersion: "0.1.0",
    materialCandidates: [],
    rubric: [
      {
        id: "pred-r1",
        title: "审批事项下沉",
        elementType: "measure",
        candidateIds: ["c1"],
        evidence: ["174 项涉企审批事项下沉"]
      }
    ],
    mappings: [
      {
        rubricPointId: "pred-r1",
        status: "hit",
        errorCodes: [],
        diagnosis: "完整覆盖"
      }
    ],
    wordBudget: {
      charCount: 20,
      wordLimit: 250,
      overLimit: false,
      redundantExcerpts: [],
      lowValueExcerpts: [],
      compressionAdvice: []
    }
  }
};

describe("benchmark model run snapshot", () => {
  it("preserves predicted output and experiment provenance before human alignment", () => {
    const run = createBenchmarkModelRun("case-1", output, {
      runId: "run-1",
      model: "model-x",
      protocol: "openai-responses",
      reasoningEffort: "high"
    });
    expect(run.caseId).toBe("case-1");
    expect(run.runId).toBe("run-1");
    expect(run.predictedScore).toBe(8);
    expect(run.providerId).toBe("remote:test");
    expect(run.model).toBe("model-x");
    expect(run.protocol).toBe("openai-responses");
    expect(run.reasoningEffort).toBe("high");
    expect(run.workflowVersion).toBe(GRADING_WORKFLOW_VERSION);
    expect(run.promptsetVersion).toBe(STAGE_PROMPTSET_VERSION);
    expect(run.referenceCrossCheckUsed).toBe(false);
    expect(run.rubric[0].id).toBe("pred-r1");
    expect(run.mappings[0].predictedRubricPointId).toBe("pred-r1");
  });

  it("records whether Stage 5 reference cross-check actually ran", () => {
    const withReference: GradingProviderOutput = {
      ...output,
      artifacts: output.artifacts ? {
        ...output.artifacts,
        referenceCrossCheck: {
          blindRubricMissingDimensions: [],
          referenceOnlyDimensions: [],
          mergeDifferences: [],
          notes: ["checked"]
        }
      } : undefined
    };
    expect(createBenchmarkModelRun("case-1", withReference, { runId: "run-ref" }).referenceCrossCheckUsed).toBe(true);
  });

  it("requires workflow artifacts rather than reconstructing them from review prose", () => {
    expect(() => createBenchmarkModelRun("case-1", { review: output.review }, { runId: "run-2" }))
      .toThrow("requires grading workflow artifacts");
  });

  it("fails closed if the model run has inconsistent rubric mappings", () => {
    const broken: GradingProviderOutput = {
      ...output,
      artifacts: output.artifacts ? {
        ...output.artifacts,
        mappings: [{
          rubricPointId: "unknown-rubric",
          status: "hit",
          errorCodes: [],
          diagnosis: "bad"
        }]
      } : undefined
    };
    expect(() => createBenchmarkModelRun("case-1", broken, { runId: "run-3" }))
      .toThrow("missing answer mapping");
  });
});
