import type { GradingProviderOutput } from "../contracts";
import type { BenchmarkModelRun } from "./types";

export interface CreateBenchmarkModelRunOptions {
  runId: string;
  model?: string;
}

export function createBenchmarkModelRun(
  caseId: string,
  output: GradingProviderOutput,
  options: CreateBenchmarkModelRunOptions
): BenchmarkModelRun {
  if (!caseId.trim()) throw new Error("Benchmark model run caseId is required.");
  if (!options.runId.trim()) throw new Error("Benchmark model run runId is required.");
  if (!output.artifacts) throw new Error("Benchmark model run requires grading workflow artifacts.");

  const rubricIds = output.artifacts.rubric.map(item => item.id);
  const uniqueRubricIds = new Set(rubricIds);
  if (uniqueRubricIds.size !== rubricIds.length) {
    throw new Error("Benchmark model run contains duplicate rubric ids.");
  }

  const mappingByRubric = new Map(output.artifacts.mappings.map(item => [item.rubricPointId, item]));
  if (mappingByRubric.size !== output.artifacts.mappings.length) {
    throw new Error("Benchmark model run contains duplicate answer mappings.");
  }
  for (const rubricId of rubricIds) {
    if (!mappingByRubric.has(rubricId)) {
      throw new Error(`Benchmark model run is missing answer mapping for ${rubricId}.`);
    }
  }
  for (const mapping of output.artifacts.mappings) {
    if (!uniqueRubricIds.has(mapping.rubricPointId)) {
      throw new Error(`Benchmark model run mapping references unknown rubric ${mapping.rubricPointId}.`);
    }
  }

  return {
    schemaVersion: "0.1.0",
    caseId: caseId.trim(),
    runId: options.runId.trim(),
    predictedScore: output.review.score,
    maxScore: output.review.maxScore,
    rubric: output.artifacts.rubric.map(item => ({
      id: item.id,
      title: item.title,
      elementType: item.elementType,
      evidence: [...item.evidence]
    })),
    mappings: output.artifacts.mappings.map(item => ({
      predictedRubricPointId: item.rubricPointId,
      status: item.status,
      errorCodes: [...item.errorCodes],
      diagnosis: item.diagnosis,
      suggestion: item.suggestion
    })),
    providerId: output.review.providerId,
    model: options.model,
    rulesetVersion: output.review.rulesetVersion,
    scoringPolicy: output.review.scoringPolicy,
    generatedAt: output.review.generatedAt
  };
}
