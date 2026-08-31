import { describe, expect, it, vi } from "vitest";
import type { GradingProviderOutput, GradingRequest } from "../contracts";
import type { RemoteProviderPublicConfig } from "../remote/config";
import { createBenchmarkExperimentRunner, questionFromBenchmarkCase } from "./benchmarkRunner";
import type { GradingBenchmarkCase } from "./types";

const testCase: GradingBenchmarkCase = {
  schemaVersion: "0.1.0",
  id: "benchmark-runner-case",
  tags: ["real-practice", "概括归纳"],
  annotationStatus: "adjudicated",
  split: "calibration",
  question: {
    id: "q-runner",
    title: "运行器测试题",
    type: "概括归纳",
    maxScore: 10,
    wordLimit: 200,
    prompt: "概括主要做法。",
    materials: [{ id: "m1", label: "材料1", content: "下沉审批事项。" }],
    referenceAnswer: { content: "推动审批事项下沉。", source: "老师答案" }
  },
  answer: "下沉审批。",
  gold: {
    materialPoints: [{ id: "mp1", materialId: "m1", canonicalLabel: "审批下沉", elementType: "measure", evidence: "下沉审批事项", independentDimension: true }],
    rubric: [{ id: "r1", canonicalLabel: "审批下沉", elementType: "measure", materialPointIds: ["mp1"], evidence: ["下沉审批事项"] }],
    mappings: [{ rubricPointId: "r1", status: "hit", expectedErrorCodes: [] }],
    humanScores: [{ assessorId: "human-1", score: 8 }]
  },
  provenance: { annotatedAt: "2026-08-22", goldAnnotatorId: "gold-1" }
};

const config: RemoteProviderPublicConfig = {
  id: "remote-test",
  label: "Test",
  enabled: true,
  protocol: "openai-responses",
  baseUrl: "https://example.invalid/v1/",
  model: "model-x",
  secretRef: "test-secret",
  timeoutMs: 120000,
  reasoningEffort: "high"
};

function output(withReference = false): GradingProviderOutput {
  return {
    review: {
      score: 8,
      maxScore: 10,
      coverage: "1/1",
      classification: "清晰",
      expression: "清晰",
      redundancy: "低",
      summary: "测试",
      points: [],
      providerId: "remote:test",
      rulesetVersion: "shenlun-grading@0.1.0",
      scoringPolicy: "equal-rubric-diagnostic@0.1.0",
      generatedAt: "2026-08-22T10:40:00+08:00"
    },
    artifacts: {
      schemaVersion: "0.1.0",
      materialCandidates: [],
      rubric: [{ id: "p1", title: "审批下沉", elementType: "measure", candidateIds: [], evidence: ["下沉审批事项"] }],
      mappings: [{ rubricPointId: "p1", status: "hit", errorCodes: [], diagnosis: "完整覆盖" }],
      wordBudget: {
        charCount: testCase.answer.length,
        wordLimit: 200,
        overLimit: false,
        redundantExcerpts: [],
        lowValueExcerpts: [],
        compressionAdvice: []
      },
      ...(withReference ? {
        referenceCrossCheck: {
          blindRubricMissingDimensions: [],
          referenceOnlyDimensions: [],
          mergeDifferences: [],
          notes: ["checked"]
        }
      } : {})
    }
  };
}

describe("benchmark experiment runner", () => {
  it("reconstructs only the frozen benchmark question content needed by stage prompts", () => {
    const question = questionFromBenchmarkCase(testCase);
    expect(question.id).toBe(testCase.question.id);
    expect(question.type).toBe(testCase.question.type);
    expect(question.score).toBe(testCase.question.maxScore);
    expect(question.wordLimit).toBe(testCase.question.wordLimit);
    expect(question.prompt).toBe(testCase.question.prompt);
    expect(question.materials).toEqual(testCase.question.materials);
  });

  it("runs without reference-answer injection by default and persists one immutable run", async () => {
    const gradeDetailed = vi.fn(async (_request: GradingRequest) => output(false));
    const saveRun = vi.fn(async () => undefined);
    const runner = createBenchmarkExperimentRunner({
      loadConfig: async () => config,
      gradeDetailed,
      saveRun,
      createRunId: () => "run-fixed"
    });

    const run = await runner(testCase);
    expect(gradeDetailed).toHaveBeenCalledTimes(1);
    expect(gradeDetailed.mock.calls[0][0].referenceAnswer).toBeUndefined();
    expect(run.runId).toBe("run-fixed");
    expect(run.model).toBe("model-x");
    expect(run.protocol).toBe("openai-responses");
    expect(run.reasoningEffort).toBe("high");
    expect(run.referenceCrossCheckUsed).toBe(false);
    expect(saveRun).toHaveBeenCalledWith(run);
  });

  it("injects the saved reference answer only when the experiment condition explicitly requests Stage 5", async () => {
    const gradeDetailed = vi.fn(async (_request: GradingRequest) => output(true));
    const runner = createBenchmarkExperimentRunner({
      loadConfig: async () => config,
      gradeDetailed,
      saveRun: async () => undefined,
      createRunId: () => "run-reference"
    });
    const run = await runner(testCase, { useReferenceCrossCheck: true });
    expect(gradeDetailed.mock.calls[0][0].referenceAnswer).toEqual(testCase.question.referenceAnswer);
    expect(run.referenceCrossCheckUsed).toBe(true);
  });

  it("refuses to run before human gold adjudication or while remote grading is disabled", async () => {
    const runner = createBenchmarkExperimentRunner({
      loadConfig: async () => config,
      gradeDetailed: async () => output(false),
      saveRun: async () => undefined,
      createRunId: () => "never"
    });
    await expect(runner({ ...testCase, annotationStatus: "draft" })).rejects.toThrow("require an adjudicated human-gold case");

    const disabledRunner = createBenchmarkExperimentRunner({
      loadConfig: async () => ({ ...config, enabled: false }),
      gradeDetailed: async () => output(false),
      saveRun: async () => undefined,
      createRunId: () => "never-2"
    });
    await expect(disabledRunner(testCase)).rejects.toThrow("must be explicitly enabled");
  });

  it("fails closed if a review-only provider output lacks workflow artifacts", async () => {
    const runner = createBenchmarkExperimentRunner({
      loadConfig: async () => config,
      gradeDetailed: async () => ({ review: output(false).review }),
      saveRun: async () => undefined,
      createRunId: () => "never-3"
    });
    await expect(runner(testCase)).rejects.toThrow("require full workflow artifacts");
  });
});
