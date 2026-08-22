import { describe, expect, it } from "vitest";
import type { AlignedBenchmarkPrediction, GradingBenchmarkCase } from "./types";
import { calculateMappingQuality, calculateScoreCalibration, calculateTaxonomyQuality, hasCompleteAlignment } from "./metrics";
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

const prediction: AlignedBenchmarkPrediction = {
  caseId: "case-1",
  predictedScore: 12,
  mappings: [
    { goldRubricPointId: "r1", predictedStatus: "hit", predictedErrorCodes: [] },
    { goldRubricPointId: "r2", predictedStatus: "partial", predictedErrorCodes: ["PARTIAL_COVERAGE"] }
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

  it("computes status confusion after explicit gold alignment", () => {
    const metrics = calculateMappingQuality(testCase, prediction);
    expect(metrics.alignedPointCount).toBe(2);
    expect(metrics.exactStatusAccuracy).toBe(0.5);
    expect(metrics.confusion.hit.hit).toBe(1);
    expect(metrics.confusion.missed.partial).toBe(1);
    expect(hasCompleteAlignment(testCase, prediction)).toBe(true);
  });

  it("computes taxonomy micro metrics on aligned rubric points", () => {
    const metrics = calculateTaxonomyQuality(testCase, prediction);
    expect(metrics.truePositive).toBe(0);
    expect(metrics.falsePositive).toBe(1);
    expect(metrics.falseNegative).toBe(1);
    expect(metrics.microPrecision).toBe(0);
    expect(metrics.microRecall).toBe(0);
    expect(metrics.microF1).toBe(0);
  });

  it("compares predicted scores with the mean human score", () => {
    const metrics = calculateScoreCalibration([testCase], [prediction]);
    expect(metrics.caseCount).toBe(1);
    expect(metrics.observationCount).toBe(2);
    expect(metrics.meanAbsoluteError).toBe(1);
    expect(metrics.rootMeanSquaredError).toBe(1);
    expect(metrics.meanSignedError).toBe(1);
    expect(metrics.normalizedMeanAbsoluteError).toBe(0.05);
  });

  it("fails closed on draft cases", () => {
    const draft = { ...testCase, annotationStatus: "draft" as const };
    expect(() => calculateMappingQuality(draft, prediction)).toThrow("not adjudicated");
    expect(() => calculateTaxonomyQuality(draft, prediction)).toThrow("not adjudicated");
    expect(() => calculateScoreCalibration([draft], [prediction])).toThrow("not adjudicated");
  });

  it("fails closed when score calibration tries to use debug cases", () => {
    const debug = { ...testCase, split: "debug" as const };
    expect(() => calculateScoreCalibration([debug], [prediction])).toThrow("not in calibration/holdout split");
  });

  it("fails closed on duplicate rubric alignment rows", () => {
    const duplicate: AlignedBenchmarkPrediction = {
      ...prediction,
      mappings: [prediction.mappings[0], prediction.mappings[0]]
    };
    expect(() => calculateMappingQuality(testCase, duplicate)).toThrow("Duplicate aligned prediction");
    expect(() => calculateTaxonomyQuality(testCase, duplicate)).toThrow("Duplicate aligned prediction");
    expect(hasCompleteAlignment(testCase, duplicate)).toBe(false);
  });

  it("fails closed on duplicate score predictions for one case", () => {
    expect(() => calculateScoreCalibration([testCase], [prediction, { ...prediction }]))
      .toThrow("Duplicate score prediction");
  });
});
