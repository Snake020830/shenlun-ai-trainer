import { describe, expect, it } from "vitest";
import type { BenchmarkAlignment, BenchmarkModelRun, GradingBenchmarkCase } from "./types";
import {
  calculateMappingQuality,
  calculateRubricQuality,
  calculateScoreCalibration,
  calculateTaxonomyQuality,
  hasCompleteAlignment,
  hasCompleteRubricAlignment
} from "./metrics";
import { validateBenchmarkCase } from "./validateCase";

const testCase: GradingBenchmarkCase = {
  schemaVersion: "0.1.0",
  id: "case-1",
  tags: ["概括归纳", "基层治理"],
  annotationStatus: "adjudicated",
  split: "calibration",
  question: {
    id: "q-1",
    title: "测试题",
    type: "概括归纳",
    maxScore: 20,
    wordLimit: 250,
    prompt: "概括主要做法。",
    materials: [{ id: "m1", label: "材料1", content: "事项下沉，项目专员服务。" }]
  },
  answer: "推动事项下沉。",
  gold: {
    materialPoints: [
      { id: "mp1", materialId: "m1", canonicalLabel: "事项下沉", elementType: "measure", evidence: "事项下沉", independentDimension: true },
      { id: "mp2", materialId: "m1", canonicalLabel: "项目服务", elementType: "measure", evidence: "项目专员服务", independentDimension: true }
    ],
    rubric: [
      { id: "r1", canonicalLabel: "事项下沉", elementType: "measure", materialPointIds: ["mp1"], evidence: ["事项下沉"] },
      { id: "r2", canonicalLabel: "项目服务", elementType: "measure", materialPointIds: ["mp2"], evidence: ["项目专员服务"] }
    ],
    mappings: [
      { rubricPointId: "r1", status: "hit", expectedErrorCodes: [] },
      { rubricPointId: "r2", status: "missed", expectedErrorCodes: ["OMISSION"] }
    ],
    humanScores: [
      { assessorId: "a1", score: 10 },
      { assessorId: "a2", score: 12 }
    ]
  },
  provenance: { annotatedAt: "2026-08-22", source: "unit-test fixture" }
};

const run: BenchmarkModelRun = {
  schemaVersion: "0.1.0",
  caseId: "case-1",
  runId: "run-1",
  predictedScore: 12,
  maxScore: 20,
  rubric: [
    { id: "p1", title: "事项下沉", elementType: "measure", evidence: ["事项下沉"] },
    { id: "p2", title: "项目服务", elementType: "measure", evidence: ["项目专员服务"] }
  ],
  mappings: [
    { predictedRubricPointId: "p1", status: "hit", errorCodes: [], diagnosis: "完整覆盖" },
    { predictedRubricPointId: "p2", status: "partial", errorCodes: ["PARTIAL_COVERAGE"], diagnosis: "覆盖不完整" }
  ],
  workflowVersion: "shenlun-workflow@0.1.0",
  promptsetVersion: "shenlun-stage-prompts@0.1.0",
  referenceCrossCheckUsed: false
};

const alignment: BenchmarkAlignment = {
  caseId: "case-1",
  runId: "run-1",
  rubricAlignments: [
    { goldRubricPointIds: ["r1"], predictedRubricPointIds: ["p1"], relation: "match" },
    { goldRubricPointIds: ["r2"], predictedRubricPointIds: ["p2"], relation: "match" }
  ],
  mappingLinks: [
    { goldRubricPointId: "r1", predictedRubricPointIds: ["p1"] },
    { goldRubricPointId: "r2", predictedRubricPointIds: ["p2"] }
  ]
};

describe("grading benchmark", () => {
  it("validates internally consistent human-gold cases", () => {
    const result = validateBenchmarkCase(testCase);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects broken gold references and taxonomy labels", () => {
    const broken: GradingBenchmarkCase = {
      ...testCase,
      gold: {
        ...testCase.gold,
        rubric: [{ ...testCase.gold.rubric[0], materialPointIds: ["missing-point"] }],
        mappings: [{ rubricPointId: "r1", status: "hit", expectedErrorCodes: ["NOT_A_REAL_CODE"] }]
      }
    };
    const result = validateBenchmarkCase(broken);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("unknown material point");
    expect(result.errors.join(" ")).toContain("unknown error code");
  });

  it("computes rubric recall and precision independently from answer mapping", () => {
    const metrics = calculateRubricQuality(testCase, run, alignment);
    expect(metrics.recall).toBe(1);
    expect(metrics.precision).toBe(1);
    expect(metrics.f1).toBe(1);
    expect(hasCompleteRubricAlignment(testCase, run, alignment)).toBe(true);
  });

  it("detects a gold rubric point omitted by the model without hiding it behind mapping accuracy", () => {
    const incompleteRun: BenchmarkModelRun = {
      ...run,
      runId: "run-incomplete",
      rubric: [run.rubric[0]],
      mappings: [run.mappings[0]]
    };
    const incompleteAlignment: BenchmarkAlignment = {
      caseId: testCase.id,
      runId: incompleteRun.runId,
      rubricAlignments: [
        { goldRubricPointIds: ["r1"], predictedRubricPointIds: ["p1"], relation: "match" }
      ],
      mappingLinks: [{ goldRubricPointId: "r1", predictedRubricPointIds: ["p1"] }]
    };
    const rubric = calculateRubricQuality(testCase, incompleteRun, incompleteAlignment);
    const mapping = calculateMappingQuality(testCase, incompleteRun, incompleteAlignment);
    expect(rubric.recall).toBe(0.5);
    expect(rubric.precision).toBe(1);
    expect(rubric.unmatchedGoldRubricPointIds).toEqual(["r2"]);
    expect(mapping.mappingCoverage).toBe(0.5);
    expect(mapping.exactStatusAccuracy).toBe(1);
    expect(hasCompleteAlignment(testCase, incompleteRun, incompleteAlignment)).toBe(false);
  });

  it("derives split-rubric status from the immutable model run", () => {
    const splitRun: BenchmarkModelRun = {
      ...run,
      runId: "run-split",
      rubric: [
        { id: "p1a", title: "事项权限下沉", elementType: "measure", evidence: ["事项下沉"] },
        { id: "p1b", title: "服务下沉", elementType: "measure", evidence: ["事项下沉"] },
        run.rubric[1]
      ],
      mappings: [
        { predictedRubricPointId: "p1a", status: "hit", errorCodes: [], diagnosis: "覆盖" },
        { predictedRubricPointId: "p1b", status: "missed", errorCodes: ["OMISSION"], diagnosis: "遗漏" },
        run.mappings[1]
      ]
    };
    const splitAlignment: BenchmarkAlignment = {
      caseId: testCase.id,
      runId: splitRun.runId,
      rubricAlignments: [
        { goldRubricPointIds: ["r1"], predictedRubricPointIds: ["p1a", "p1b"], relation: "acceptable-split" },
        { goldRubricPointIds: ["r2"], predictedRubricPointIds: ["p2"], relation: "match" }
      ],
      mappingLinks: [
        { goldRubricPointId: "r1", predictedRubricPointIds: ["p1a", "p1b"] },
        { goldRubricPointId: "r2", predictedRubricPointIds: ["p2"] }
      ]
    };
    const mapping = calculateMappingQuality(testCase, splitRun, splitAlignment);
    expect(calculateRubricQuality(testCase, splitRun, splitAlignment).recall).toBe(1);
    expect(mapping.mappingCoverage).toBe(1);
    expect(mapping.confusion.hit.partial).toBe(1);
  });

  it("computes status confusion from model-run judgments", () => {
    const metrics = calculateMappingQuality(testCase, run, alignment);
    expect(metrics.alignedPointCount).toBe(2);
    expect(metrics.goldPointCount).toBe(2);
    expect(metrics.mappingCoverage).toBe(1);
    expect(metrics.exactStatusAccuracy).toBe(0.5);
    expect(metrics.confusion.hit.hit).toBe(1);
    expect(metrics.confusion.missed.partial).toBe(1);
    expect(hasCompleteAlignment(testCase, run, alignment)).toBe(true);
  });

  it("computes taxonomy micro metrics from model-run error codes", () => {
    const metrics = calculateTaxonomyQuality(testCase, run, alignment);
    expect(metrics.truePositive).toBe(0);
    expect(metrics.falsePositive).toBe(1);
    expect(metrics.falseNegative).toBe(1);
    expect(metrics.microPrecision).toBe(0);
    expect(metrics.microRecall).toBe(0);
    expect(metrics.microF1).toBe(0);
  });

  it("compares immutable model-run score with the mean human score", () => {
    const metrics = calculateScoreCalibration([testCase], [run]);
    expect(metrics.caseCount).toBe(1);
    expect(metrics.observationCount).toBe(2);
    expect(metrics.meanAbsoluteError).toBe(1);
    expect(metrics.rootMeanSquaredError).toBe(1);
    expect(metrics.meanSignedError).toBe(1);
    expect(metrics.normalizedMeanAbsoluteError).toBe(0.05);
  });

  it("fails closed on draft cases", () => {
    const draft = { ...testCase, annotationStatus: "draft" as const };
    expect(() => calculateRubricQuality(draft, run, alignment)).toThrow("not adjudicated");
    expect(() => calculateMappingQuality(draft, run, alignment)).toThrow("not adjudicated");
    expect(() => calculateTaxonomyQuality(draft, run, alignment)).toThrow("not adjudicated");
    expect(() => calculateScoreCalibration([draft], [run])).toThrow("not adjudicated");
  });

  it("fails closed when score calibration tries to use debug cases", () => {
    const debug = { ...testCase, split: "debug" as const };
    expect(() => calculateScoreCalibration([debug], [run])).toThrow("not in calibration/holdout split");
  });

  it("fails closed when alignment points to a different model run", () => {
    expect(() => calculateRubricQuality(testCase, run, { ...alignment, runId: "another-run" }))
      .toThrow("Alignment runId does not match model run");
  });

  it("fails closed when mapping links disagree with rubric alignment", () => {
    const wrongLinks: BenchmarkAlignment = {
      ...alignment,
      mappingLinks: [
        { goldRubricPointId: "r1", predictedRubricPointIds: ["p2"] },
        alignment.mappingLinks[1]
      ]
    };
    expect(() => calculateMappingQuality(testCase, run, wrongLinks)).toThrow("does not match its rubric alignment group");
  });

  it("fails closed on duplicate mapping links", () => {
    const duplicateLinks: BenchmarkAlignment = {
      ...alignment,
      mappingLinks: [alignment.mappingLinks[0], alignment.mappingLinks[0]]
    };
    expect(() => calculateMappingQuality(testCase, run, duplicateLinks)).toThrow("Duplicate answer mapping link");
    expect(hasCompleteAlignment(testCase, run, duplicateLinks)).toBe(false);
  });

  it("fails closed on duplicate score model runs for one case", () => {
    expect(() => calculateScoreCalibration([testCase], [run, { ...run, runId: "run-2" }]))
      .toThrow("Duplicate score model run");
  });
});
