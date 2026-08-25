import { describe, expect, it } from "vitest";
import type { ShenlunGraderResult } from "./shenlunGraderSkill";
import { validateProviderSmokeResult } from "./providerSmokeTest";
import type { RemoteProviderPublicConfig } from "./remote/config";

const config: RemoteProviderPublicConfig = {
  id: "test-provider",
  label: "Test provider",
  enabled: true,
  protocol: "openai-responses",
  baseUrl: "https://api.example.com/v1/",
  model: "test-model",
  secretRef: "grading-provider-api-key",
  timeoutMs: 120000,
  reasoningEffort: "high"
};

function result(kind: "remote" | "mock" = "remote"): ShenlunGraderResult {
  return {
    review: {
      score: 8,
      maxScore: 10,
      coverage: "2 完整 / 0 表述损失 / 0 真正遗漏",
      classification: "清晰",
      expression: "到位",
      redundancy: "控制较好",
      summary: "自检",
      points: [],
      calibrationStatus: "uncalibrated"
    },
    artifacts: {
      schemaVersion: "0.1.0",
      materialCandidates: [{
        id: "c1",
        materialId: "m1",
        elementType: "measure",
        claim: "整合窗口",
        evidence: "整合到综合服务专区",
        independentDimension: true
      }],
      rubric: [{
        id: "r1",
        title: "整合窗口",
        elementType: "measure",
        candidateIds: ["c1"],
        evidence: ["整合到综合服务专区"]
      }],
      mappings: [{
        rubricPointId: "r1",
        status: "hit",
        errorCodes: [],
        diagnosis: "完整覆盖"
      }],
      wordBudget: {
        charCount: 42,
        wordLimit: 100,
        overLimit: false,
        redundantExcerpts: [],
        lowValueExcerpts: [],
        compressionAdvice: []
      }
    },
    meta: {
      skillVersion: "shenlun-grader-skill@0.5.0",
      rulesetVersion: "shenlun-grading@0.1.0",
      providerId: kind === "remote" ? "remote:test-provider" : "mock-v01",
      providerKind: kind,
      scoreInterpretation: kind === "remote" ? "ai-diagnostic-uncalibrated" : "mock-diagnostic",
      preflight: {
        questionId: "debug-provider-smoke-001",
        materialCount: 1,
        materialCharCount: 60,
        answerCharCount: 42,
        wordLimit: 100,
        overLimit: false,
        hasReferenceAnswer: false
      },
      warnings: []
    }
  };
}

describe("provider smoke test gates", () => {
  it("returns a compact report only for a complete remote workflow", () => {
    const report = validateProviderSmokeResult(result(), config);
    expect(report.model).toBe("test-model");
    expect(report.materialCandidateCount).toBe(1);
    expect(report.rubricCount).toBe(1);
    expect(report.mappingCount).toBe(1);
    expect(report.scoreInterpretation).toBe("ai-diagnostic-uncalibrated");
  });

  it("rejects mock execution and incomplete artifacts", () => {
    expect(() => validateProviderSmokeResult(result("mock"), config)).toThrow("没有使用远程 AI provider");
    const incomplete = result();
    if (incomplete.artifacts) incomplete.artifacts.rubric = [];
    expect(() => validateProviderSmokeResult(incomplete, config)).toThrow("rubric 为空");
  });
});