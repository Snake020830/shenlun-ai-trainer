import { isKnownErrorCode } from "../errorTaxonomy";
import type { GradingBenchmarkCase, BenchmarkValidationResult } from "./types";

function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) dup.add(value);
    seen.add(value);
  }
  return [...dup];
}

export function validateBenchmarkCase(testCase: GradingBenchmarkCase): BenchmarkValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!testCase.id.trim()) errors.push("case id is required");
  if (!testCase.question.id.trim()) errors.push("question id is required");
  if (!testCase.answer.trim()) errors.push("student answer is required");
  if (!Number.isFinite(testCase.question.maxScore) || testCase.question.maxScore <= 0) {
    errors.push("question maxScore must be a positive finite number");
  }
  if (!Number.isInteger(testCase.question.wordLimit) || testCase.question.wordLimit <= 0) {
    errors.push("question wordLimit must be a positive integer");
  }

  if (testCase.annotationStatus === undefined) {
    warnings.push("annotationStatus is missing; evaluation must treat the case as a draft");
  } else if (testCase.annotationStatus === "draft") {
    warnings.push("case is an annotation draft and must not be used for evaluation metrics");
  }

  const materialIds = testCase.question.materials.map(item => item.id);
  for (const id of duplicates(materialIds)) errors.push(`duplicate material id: ${id}`);
  const materialIdSet = new Set(materialIds);

  const pointIds = testCase.gold.materialPoints.map(item => item.id);
  for (const id of duplicates(pointIds)) errors.push(`duplicate gold material point id: ${id}`);
  const pointIdSet = new Set(pointIds);
  for (const point of testCase.gold.materialPoints) {
    if (!materialIdSet.has(point.materialId)) {
      errors.push(`gold material point ${point.id} references unknown material ${point.materialId}`);
    }
    if (!point.canonicalLabel.trim()) errors.push(`gold material point ${point.id} has empty canonicalLabel`);
    if (!point.evidence.trim()) errors.push(`gold material point ${point.id} has empty evidence`);
  }

  const rubricIds = testCase.gold.rubric.map(item => item.id);
  for (const id of duplicates(rubricIds)) errors.push(`duplicate gold rubric id: ${id}`);
  const rubricIdSet = new Set(rubricIds);
  for (const rubricPoint of testCase.gold.rubric) {
    if (!rubricPoint.canonicalLabel.trim()) errors.push(`gold rubric ${rubricPoint.id} has empty canonicalLabel`);
    if (!rubricPoint.materialPointIds.length) warnings.push(`gold rubric ${rubricPoint.id} has no material point linkage`);
    for (const pointId of rubricPoint.materialPointIds) {
      if (!pointIdSet.has(pointId)) errors.push(`gold rubric ${rubricPoint.id} references unknown material point ${pointId}`);
    }
  }

  const mappingIds = testCase.gold.mappings.map(item => item.rubricPointId);
  for (const id of duplicates(mappingIds)) errors.push(`duplicate gold mapping for rubric ${id}`);
  const mappingIdSet = new Set(mappingIds);
  for (const rubricId of rubricIds) {
    if (!mappingIdSet.has(rubricId)) errors.push(`missing gold mapping for rubric ${rubricId}`);
  }
  for (const mapping of testCase.gold.mappings) {
    if (!rubricIdSet.has(mapping.rubricPointId)) {
      errors.push(`gold mapping references unknown rubric ${mapping.rubricPointId}`);
    }
    for (const code of mapping.expectedErrorCodes) {
      if (!isKnownErrorCode(code)) errors.push(`gold mapping ${mapping.rubricPointId} uses unknown error code ${code}`);
    }
  }

  if (testCase.annotationStatus === "adjudicated") {
    if (!testCase.gold.materialPoints.length) errors.push("adjudicated case must contain gold material points");
    if (!testCase.gold.rubric.length) errors.push("adjudicated case must contain a gold rubric");
    if (!testCase.gold.mappings.length) errors.push("adjudicated case must contain gold mappings");
    if (!testCase.provenance?.annotatedAt?.trim()) {
      warnings.push("adjudicated case should record provenance.annotatedAt");
    }
  }

  const assessorIds = testCase.gold.humanScores.map(item => item.assessorId);
  for (const id of duplicates(assessorIds)) warnings.push(`duplicate human score assessor id: ${id}`);
  if (!testCase.gold.humanScores.length) {
    warnings.push("case has no human score observation; score calibration metrics cannot use it");
  }
  for (const observation of testCase.gold.humanScores) {
    if (!observation.assessorId.trim()) errors.push("human score assessorId is required");
    if (!Number.isFinite(observation.score) || observation.score < 0 || observation.score > testCase.question.maxScore) {
      errors.push(`human score from ${observation.assessorId || "unknown assessor"} is outside 0..maxScore`);
    }
  }

  if (testCase.split === "debug" && testCase.gold.humanScores.length) {
    warnings.push("debug case contains human score observations; score calibration must ignore debug cases");
  }
  if ((testCase.split === "calibration" || testCase.split === "holdout") && !testCase.gold.humanScores.length) {
    warnings.push(`${testCase.split} case has no human score observation`);
  }

  if (testCase.question.referenceAnswer?.content !== undefined && !testCase.question.referenceAnswer.content.trim()) {
    warnings.push("referenceAnswer exists but content is empty");
  }

  return { valid: errors.length === 0, errors, warnings };
}
