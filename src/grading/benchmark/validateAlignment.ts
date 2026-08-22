import type { BenchmarkAlignment, BenchmarkModelRun, GradingBenchmarkCase } from "./types";
import { validateBenchmarkModelRun } from "./validateModelRun";

export interface AlignmentValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
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

function sameSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every(item => rightSet.has(item));
}

export function validateBenchmarkAlignment(
  testCase: GradingBenchmarkCase,
  run: BenchmarkModelRun,
  alignment: BenchmarkAlignment
): AlignmentValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const adjudicated = alignment.alignmentStatus === "adjudicated";

  const runValidation = validateBenchmarkModelRun(testCase, run);
  errors.push(...runValidation.errors);

  if (alignment.caseId !== testCase.id) errors.push("alignment caseId does not match benchmark case");
  if (alignment.runId !== run.runId) errors.push("alignment runId does not match model run");
  if (!alignment.alignmentStatus) warnings.push("alignmentStatus is missing; treat alignment as draft");

  const goldIds = new Set(testCase.gold.rubric.map(item => item.id));
  const predictedIds = new Set(run.rubric.map(item => item.id));
  const alignedGold = new Set<string>();
  const alignedPredicted = new Set<string>();
  const predictedByGold = new Map<string, string[]>();

  for (const [index, group] of alignment.rubricAlignments.entries()) {
    if (!group.goldRubricPointIds.length || !group.predictedRubricPointIds.length) {
      errors.push(`rubric alignment group ${index} must contain gold and predicted ids`);
      continue;
    }
    for (const id of duplicates(group.goldRubricPointIds)) errors.push(`duplicate gold rubric id inside alignment group ${index}: ${id}`);
    for (const id of duplicates(group.predictedRubricPointIds)) errors.push(`duplicate predicted rubric id inside alignment group ${index}: ${id}`);

    if (group.relation === "match" && (group.goldRubricPointIds.length !== 1 || group.predictedRubricPointIds.length !== 1)) {
      errors.push(`rubric alignment group ${index} relation=match must be 1:1`);
    }
    if (group.relation === "acceptable-merge" && (group.goldRubricPointIds.length < 2 || group.predictedRubricPointIds.length !== 1)) {
      errors.push(`rubric alignment group ${index} acceptable-merge must be many gold to one predicted`);
    }
    if (group.relation === "acceptable-split" && (group.goldRubricPointIds.length !== 1 || group.predictedRubricPointIds.length < 2)) {
      errors.push(`rubric alignment group ${index} acceptable-split must be one gold to many predicted`);
    }

    for (const goldId of group.goldRubricPointIds) {
      if (!goldIds.has(goldId)) errors.push(`rubric alignment references unknown gold rubric ${goldId}`);
      if (alignedGold.has(goldId)) errors.push(`gold rubric ${goldId} appears in multiple alignment groups`);
      alignedGold.add(goldId);
      predictedByGold.set(goldId, [...group.predictedRubricPointIds]);
    }
    for (const predictedId of group.predictedRubricPointIds) {
      if (!predictedIds.has(predictedId)) errors.push(`rubric alignment references unknown predicted rubric ${predictedId}`);
      if (alignedPredicted.has(predictedId)) errors.push(`predicted rubric ${predictedId} appears in multiple alignment groups`);
      alignedPredicted.add(predictedId);
    }
  }

  const mappingGoldIds = alignment.mappingLinks.map(item => item.goldRubricPointId);
  for (const id of duplicates(mappingGoldIds)) errors.push(`duplicate answer mapping link for gold rubric ${id}`);
  for (const link of alignment.mappingLinks) {
    if (!goldIds.has(link.goldRubricPointId)) errors.push(`answer mapping link references unknown gold rubric ${link.goldRubricPointId}`);
    const expectedPredicted = predictedByGold.get(link.goldRubricPointId);
    if (!expectedPredicted) {
      errors.push(`answer mapping link references gold rubric ${link.goldRubricPointId} without rubric alignment`);
      continue;
    }
    for (const id of duplicates(link.predictedRubricPointIds)) errors.push(`duplicate predicted id in mapping link for ${link.goldRubricPointId}: ${id}`);
    if (!sameSet(link.predictedRubricPointIds, expectedPredicted)) {
      errors.push(`answer mapping link for ${link.goldRubricPointId} does not match its rubric alignment group`);
    }
  }
  for (const goldId of alignedGold) {
    if (!mappingGoldIds.includes(goldId)) {
      (adjudicated ? errors : warnings).push(`aligned gold rubric ${goldId} is missing an answer mapping link`);
    }
  }

  const unmatchedGold = alignment.unmatchedGoldRubricPointIds ?? [];
  const unmatchedPredicted = alignment.unmatchedPredictedRubricPointIds ?? [];
  for (const id of duplicates(unmatchedGold)) errors.push(`duplicate unmatched gold rubric id: ${id}`);
  for (const id of duplicates(unmatchedPredicted)) errors.push(`duplicate unmatched predicted rubric id: ${id}`);
  for (const id of unmatchedGold) {
    if (!goldIds.has(id)) errors.push(`unmatched gold list references unknown rubric ${id}`);
    if (alignedGold.has(id)) errors.push(`gold rubric ${id} cannot be both aligned and unmatched`);
  }
  for (const id of unmatchedPredicted) {
    if (!predictedIds.has(id)) errors.push(`unmatched predicted list references unknown rubric ${id}`);
    if (alignedPredicted.has(id)) errors.push(`predicted rubric ${id} cannot be both aligned and unmatched`);
  }

  if (adjudicated) {
    if (!alignment.provenance?.alignedBy?.trim()) errors.push("adjudicated alignment requires provenance.alignedBy");
    if (!alignment.provenance?.alignedAt?.trim()) errors.push("adjudicated alignment requires provenance.alignedAt");

    for (const id of goldIds) {
      if (!alignedGold.has(id) && !unmatchedGold.includes(id)) {
        errors.push(`adjudicated alignment has not reviewed gold rubric ${id}`);
      }
    }
    for (const id of predictedIds) {
      if (!alignedPredicted.has(id) && !unmatchedPredicted.includes(id)) {
        errors.push(`adjudicated alignment has not reviewed predicted rubric ${id}`);
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
