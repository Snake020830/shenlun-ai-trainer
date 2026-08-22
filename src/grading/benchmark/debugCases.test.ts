import { describe, expect, it } from "vitest";
import jqhCaseJson from "../../../benchmark/cases/debug/jqh-001.partial-service.json";
import nmyCaseJson from "../../../benchmark/cases/debug/nmy-002.omission-professionalism.json";
import fpCaseJson from "../../../benchmark/cases/debug/fp-003.partial-system-analysis.json";
import type { GradingBenchmarkCase } from "./types";
import { validateBenchmarkCase } from "./validateCase";

const cases = [jqhCaseJson, nmyCaseJson, fpCaseJson] as GradingBenchmarkCase[];

describe("repository debug benchmark fixtures", () => {
  it.each(cases.map(testCase => [testCase.id, testCase] as const))(
    "%s is structurally valid and intentionally excluded from score calibration",
    (_id, testCase) => {
      const result = validateBenchmarkCase(testCase);
      expect(result.errors).toEqual([]);
      expect(result.valid).toBe(true);
      expect(testCase.split).toBe("debug");
      expect(testCase.gold.humanScores).toEqual([]);
      expect(result.warnings).toContain("case has no human score observation; score calibration metrics cannot use it");
    }
  );

  it("covers hit, partial and missed mapping states across the fixture set", () => {
    const statuses = new Set(cases.flatMap(testCase => testCase.gold.mappings.map(item => item.status)));
    expect(statuses).toEqual(new Set(["hit", "partial", "missed"]));
  });

  it("covers omission, partial coverage, over-abstraction and mechanism-loss errors", () => {
    const codes = new Set(cases.flatMap(testCase =>
      testCase.gold.mappings.flatMap(mapping => mapping.expectedErrorCodes)
    ));
    expect(codes.has("OMISSION")).toBe(true);
    expect(codes.has("PARTIAL_COVERAGE")).toBe(true);
    expect(codes.has("OVER_ABSTRACTION")).toBe(true);
    expect(codes.has("MECHANISM_LOSS")).toBe(true);
  });
});
