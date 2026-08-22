import { describe, expect, it } from "vitest";
import type { BenchmarkAlignment, BenchmarkModelRun, GradingBenchmarkCase } from "./types";
import { buildValidationReport } from "./validationReport";

const testCase: GradingBenchmarkCase = {
  schemaVersion: "0.1.0",
  id: "report-case-1",
  tags: ["概括归纳"],
  annotationStatus: "adjudicated",
  split: "calibration",
  question: {
    id: "q-report-1",
    title: "报告测试题",
    type: "概括归纳",
    maxScore: 10,
    wordLimit: 200,
    prompt: "概括做法。",
    materials: [{ id: "m1", label: "材料1", content: "下沉审批，建立专员机制。" }]
  },
  answer: "下沉审批。",
  gold: {
    materialPoints: [
      { id: "mp1", materialId: "m1", canonicalLabel: "审批下沉", elementType: "measure", evidence: "下沉审批", independentDimension: true },
      { id: "mp2", materialId: "m1", canonicalLabel: "专员机制", elementType: "mechanism", evidence: "建立专员机制", independentDimension: true }
    ],
    rubric: [
      { id: "r1", canonicalLabel: "审批下沉", elementType: "measure", materialPointIds: ["mp1"], evidence: ["下沉审批"] },
      { id: "r2", canonicalLabel: "专员机制", elementType: "mechanism", materialPointIds: ["mp2"], evidence: ["建立专员机制"] }
    ],
    mappings: [
      { rubricPointId: "r1", status: "hit", expectedErrorCodes: [] },
      { rubricPointId: "r2", status: "missed", expectedErrorCodes: ["OMISSION"] }
    ],
    humanScores: [{ assessorId: "human-1", score: 6 }]
  },
  provenance: { annotatedAt: "2026-08-22" }
};

const run: BenchmarkModelRun = {
  schemaVersion: "0.1.0",
  caseId: testCase.id,
  runId: "report-run-1",
  predictedScore: 7,
  maxScore: 10,
  rubric: [
    { id: "p1", title: "审批下沉", elementType: "measure", evidence: ["下沉审批"] },
    { id: "p2", title: "专员机制", elementType: "mechanism", evidence: ["建立专员机制"] }
  ],
  mappings: [
    { predictedRubricPointId: "p1", status: "hit", errorCodes: [], diagnosis: "覆盖" },
    { predictedRubricPointId: "p2", status: "missed", errorCodes: ["OMISSION"], diagnosis: "遗漏" }
  ],
  providerId: "remote:test",
  model: "model-x",
  protocol: "openai-responses",
  reasoningEffort: "high",
  rulesetVersion: "shenlun-grading@0.1.0",
  workflowVersion: "shenlun-workflow@0.1.0",
  promptsetVersion: "shenlun-stage-prompts@0.1.0",
  scoringPolicy: "equal-rubric-diagnostic@0.1.0",
  referenceCrossCheckUsed: false
};

const alignment: BenchmarkAlignment = {
  caseId: testCase.id,
  runId: run.runId,
  alignmentStatus: "adjudicated",
  rubricAlignments: [
    { goldRubricPointIds: ["r1"], predictedRubricPointIds: ["p1"], relation: "match" },
    { goldRubricPointIds: ["r2"], predictedRubricPointIds: ["p2"], relation: "match" }
  ],
  mappingLinks: [
    { goldRubricPointId: "r1", predictedRubricPointIds: ["p1"] },
    { goldRubricPointId: "r2", predictedRubricPointIds: ["p2"] }
  ],
  provenance: { alignedBy: "human-aligner-1", alignedAt: "2026-08-22T10:00:00+08:00" }
};

describe("benchmark validation report", () => {
  it("aggregates a reproducible single-experiment report without promoting validation status", () => {
    const report = buildValidationReport([testCase], [run], [alignment], "2026-08-22T10:00:00+08:00");
    expect(report.validationStatus).toBe("evidence-only");
    expect(report.caseCount).toBe(1);
    expect(report.experiment.reasoningEffort).toBe("high");
    expect(report.aggregate.rubric.recall).toBe(1);
    expect(report.aggregate.rubric.precision).toBe(1);
    expect(report.aggregate.mapping.exactStatusAccuracy).toBe(1);
    expect(report.aggregate.taxonomy.microF1).toBe(1);
    expect(report.aggregate.score.meanAbsoluteError).toBe(1);
  });

  it("rejects draft human alignments", () => {
    expect(() => buildValidationReport(
      [testCase],
      [run],
      [{ ...alignment, alignmentStatus: "draft" }]
    )).toThrow("is not adjudicated");
  });

  it("requires alignment provenance for final reports", () => {
    expect(() => buildValidationReport(
      [testCase],
      [run],
      [{ ...alignment, provenance: { alignedAt: "2026-08-22T10:00:00+08:00" } }]
    )).toThrow("missing provenance.alignedBy");
    expect(() => buildValidationReport(
      [testCase],
      [run],
      [{ ...alignment, provenance: { alignedBy: "human-aligner-1" } }]
    )).toThrow("missing provenance.alignedAt");
  });

  it("rejects mixed experiment signatures", () => {
    const secondCase: GradingBenchmarkCase = {
      ...testCase,
      id: "report-case-2",
      question: { ...testCase.question, id: "q-report-2" }
    };
    const secondRun: BenchmarkModelRun = {
      ...run,
      caseId: secondCase.id,
      runId: "report-run-2",
      reasoningEffort: "xhigh"
    };
    const secondAlignment: BenchmarkAlignment = {
      ...alignment,
      caseId: secondCase.id,
      runId: secondRun.runId
    };
    expect(() => buildValidationReport(
      [testCase, secondCase],
      [run, secondRun],
      [alignment, secondAlignment]
    )).toThrow("different experiment signatures");
  });

  it("requires exactly one run and alignment for every case", () => {
    expect(() => buildValidationReport([testCase], [run], [])).toThrow("exactly one model run and one alignment");
  });

  it("rejects mixed benchmark splits", () => {
    const holdoutCase: GradingBenchmarkCase = { ...testCase, id: "holdout-case", split: "holdout" };
    expect(() => buildValidationReport([testCase, holdoutCase], [run], [alignment])).toThrow("cannot mix benchmark splits");
  });

  it("rejects an alignment tied to a different run", () => {
    expect(() => buildValidationReport(
      [testCase],
      [run],
      [{ ...alignment, runId: "other-run" }]
    )).toThrow("alignment runId does not match model run");
  });
});
