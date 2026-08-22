import { isKnownErrorCode } from "../errorTaxonomy";
import type { BenchmarkModelRun, GradingBenchmarkCase } from "./types";

export interface ModelRunValidationResult {
  valid: boolean;
  errors: string[];
}

function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicated.add(value);
    seen.add(value);
  }
  return [...duplicated];
}

export function validateBenchmarkModelRun(
  testCase: GradingBenchmarkCase,
  run: BenchmarkModelRun
): ModelRunValidationResult {
  const errors: string[] = [];

  if (testCase.annotationStatus !== "adjudicated") {
    errors.push("benchmark model runs require an adjudicated human-gold case");
  }
  if (run.caseId !== testCase.id) errors.push("model run caseId does not match benchmark case");
  if (!run.runId.trim()) errors.push("model run runId is required");
  if (run.maxScore !== testCase.question.maxScore) errors.push("model run maxScore does not match benchmark case");
  if (!Number.isFinite(run.predictedScore) || run.predictedScore < 0 || run.predictedScore > run.maxScore) {
    errors.push("model run predictedScore is outside 0..maxScore");
  }
  if (!run.workflowVersion.trim()) errors.push("model run workflowVersion is required");
  if (!run.promptsetVersion.trim()) errors.push("model run promptsetVersion is required");

  const rubricIds = run.rubric.map(item => item.id);
  for (const id of duplicates(rubricIds)) errors.push(`duplicate model-run rubric id: ${id}`);
  const rubricIdSet = new Set(rubricIds);
  for (const rubric of run.rubric) {
    if (!rubric.id.trim()) errors.push("model-run rubric id is required");
    if (!rubric.title.trim()) errors.push(`model-run rubric ${rubric.id || "unknown"} has empty title`);
    if (!rubric.evidence.length || rubric.evidence.some(item => !item.trim())) {
      errors.push(`model-run rubric ${rubric.id || "unknown"} must contain non-empty evidence`);
    }
  }

  const mappingIds = run.mappings.map(item => item.predictedRubricPointId);
  for (const id of duplicates(mappingIds)) errors.push(`duplicate model-run mapping for rubric: ${id}`);
  const mappingIdSet = new Set(mappingIds);
  for (const rubricId of rubricIds) {
    if (!mappingIdSet.has(rubricId)) errors.push(`model run is missing answer mapping for ${rubricId}`);
  }
  for (const mapping of run.mappings) {
    if (!rubricIdSet.has(mapping.predictedRubricPointId)) {
      errors.push(`model-run mapping references unknown rubric ${mapping.predictedRubricPointId}`);
    }
    if (!mapping.diagnosis.trim()) errors.push(`model-run mapping ${mapping.predictedRubricPointId} has empty diagnosis`);
    for (const code of mapping.errorCodes) {
      if (!isKnownErrorCode(code)) errors.push(`model-run mapping ${mapping.predictedRubricPointId} uses unknown error code ${code}`);
    }
  }

  return { valid: errors.length === 0, errors };
}
