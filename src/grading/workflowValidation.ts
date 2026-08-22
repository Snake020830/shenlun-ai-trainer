import type {
  AnswerMappingOutput,
  MaterialExtractionOutput,
  ReferenceCrossCheckOutput,
  RubricConstructionOutput,
  WordBudgetOutput
} from "./artifacts";
import { isKnownErrorCode } from "./errorTaxonomy";

const ELEMENT_TYPES = new Set([
  "problem",
  "cause",
  "measure",
  "outcome",
  "impact",
  "significance",
  "viewpoint",
  "mechanism",
  "other"
]);
const REVIEW_STATUSES = new Set(["hit", "partial", "missed"]);

function assertObject(value: unknown, field: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid grading artifact: ${field} must be an object.`);
  }
}

function assertString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Invalid grading artifact: ${field} must be a non-empty string.`);
  }
}

function assertBoolean(value: unknown, field: string): asserts value is boolean {
  if (typeof value !== "boolean") {
    throw new Error(`Invalid grading artifact: ${field} must be a boolean.`);
  }
}

function assertNumber(value: unknown, field: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid grading artifact: ${field} must be a finite number.`);
  }
}

function assertStringArray(value: unknown, field: string): asserts value is string[] {
  if (!Array.isArray(value) || !value.every(item => typeof item === "string")) {
    throw new Error(`Invalid grading artifact: ${field} must be a string array.`);
  }
}

function assertOptionalString(value: unknown, field: string): void {
  if (value !== undefined && value !== null && typeof value !== "string") {
    throw new Error(`Invalid grading artifact: ${field} must be a string when present.`);
  }
}

function assertUnique(ids: string[], field: string): void {
  if (new Set(ids).size !== ids.length) {
    throw new Error(`Invalid grading artifact: ${field} contains duplicate ids.`);
  }
}

export function validateMaterialExtraction(value: unknown, materialIds: Set<string>): MaterialExtractionOutput {
  assertObject(value, "material extraction");
  const items = value.materialCandidates;
  if (!Array.isArray(items)) throw new Error("Invalid grading artifact: materialCandidates must be an array.");

  const ids: string[] = [];
  for (const [index, raw] of items.entries()) {
    assertObject(raw, `materialCandidates[${index}]`);
    assertString(raw.id, `materialCandidates[${index}].id`);
    assertString(raw.materialId, `materialCandidates[${index}].materialId`);
    assertString(raw.elementType, `materialCandidates[${index}].elementType`);
    assertString(raw.claim, `materialCandidates[${index}].claim`);
    assertString(raw.evidence, `materialCandidates[${index}].evidence`);
    assertBoolean(raw.independentDimension, `materialCandidates[${index}].independentDimension`);
    assertOptionalString(raw.subject, `materialCandidates[${index}].subject`);
    assertOptionalString(raw.actionOrState, `materialCandidates[${index}].actionOrState`);
    assertOptionalString(raw.object, `materialCandidates[${index}].object`);
    assertOptionalString(raw.mechanismOrQualifier, `materialCandidates[${index}].mechanismOrQualifier`);

    if (!materialIds.has(raw.materialId)) {
      throw new Error(`Invalid grading artifact: material candidate references unknown material ${raw.materialId}.`);
    }
    if (!ELEMENT_TYPES.has(raw.elementType)) {
      throw new Error(`Invalid grading artifact: unsupported element type ${raw.elementType}.`);
    }
    ids.push(raw.id);
  }
  assertUnique(ids, "materialCandidates");
  return value as unknown as MaterialExtractionOutput;
}

export function validateRubricConstruction(value: unknown, candidateIds: Set<string>): RubricConstructionOutput {
  assertObject(value, "rubric construction");
  const rubric = value.rubric;
  if (!Array.isArray(rubric)) throw new Error("Invalid grading artifact: rubric must be an array.");

  const ids: string[] = [];
  for (const [index, raw] of rubric.entries()) {
    assertObject(raw, `rubric[${index}]`);
    assertString(raw.id, `rubric[${index}].id`);
    assertString(raw.title, `rubric[${index}].title`);
    assertString(raw.elementType, `rubric[${index}].elementType`);
    assertStringArray(raw.candidateIds, `rubric[${index}].candidateIds`);
    assertStringArray(raw.evidence, `rubric[${index}].evidence`);
    assertOptionalString(raw.objectGroup, `rubric[${index}].objectGroup`);
    assertOptionalString(raw.mechanism, `rubric[${index}].mechanism`);

    if (!ELEMENT_TYPES.has(raw.elementType)) {
      throw new Error(`Invalid grading artifact: unsupported rubric element type ${raw.elementType}.`);
    }
    if (!raw.candidateIds.length) {
      throw new Error(`Invalid grading artifact: rubric[${index}] must reference at least one candidate.`);
    }
    for (const candidateId of raw.candidateIds) {
      if (!candidateIds.has(candidateId)) {
        throw new Error(`Invalid grading artifact: rubric references unknown candidate ${candidateId}.`);
      }
    }
    ids.push(raw.id);
  }
  assertUnique(ids, "rubric");
  return value as unknown as RubricConstructionOutput;
}

export function validateAnswerMapping(value: unknown, rubricIds: Set<string>): AnswerMappingOutput {
  assertObject(value, "answer mapping");
  const mappings = value.mappings;
  if (!Array.isArray(mappings)) throw new Error("Invalid grading artifact: mappings must be an array.");

  const mappedIds: string[] = [];
  for (const [index, raw] of mappings.entries()) {
    assertObject(raw, `mappings[${index}]`);
    assertString(raw.rubricPointId, `mappings[${index}].rubricPointId`);
    assertString(raw.status, `mappings[${index}].status`);
    assertStringArray(raw.errorCodes, `mappings[${index}].errorCodes`);
    assertString(raw.diagnosis, `mappings[${index}].diagnosis`);
    assertOptionalString(raw.answerExcerpt, `mappings[${index}].answerExcerpt`);
    assertOptionalString(raw.suggestion, `mappings[${index}].suggestion`);

    if (!rubricIds.has(raw.rubricPointId)) {
      throw new Error(`Invalid grading artifact: mapping references unknown rubric point ${raw.rubricPointId}.`);
    }
    if (!REVIEW_STATUSES.has(raw.status)) {
      throw new Error(`Invalid grading artifact: unsupported mapping status ${raw.status}.`);
    }
    for (const code of raw.errorCodes) {
      if (!isKnownErrorCode(code)) {
        throw new Error(`Invalid grading artifact: unknown error taxonomy code ${code}.`);
      }
    }
    mappedIds.push(raw.rubricPointId);
  }
  assertUnique(mappedIds, "mappings.rubricPointId");

  if (mappedIds.length !== rubricIds.size) {
    throw new Error("Invalid grading artifact: every rubric point must have exactly one answer mapping.");
  }
  return value as unknown as AnswerMappingOutput;
}

export function validateWordBudget(value: unknown, expectedWordLimit: number): WordBudgetOutput {
  assertObject(value, "word budget output");
  const budget = value.wordBudget;
  assertObject(budget, "wordBudget");
  assertNumber(budget.charCount, "wordBudget.charCount");
  assertNumber(budget.wordLimit, "wordBudget.wordLimit");
  assertBoolean(budget.overLimit, "wordBudget.overLimit");
  assertStringArray(budget.redundantExcerpts, "wordBudget.redundantExcerpts");
  assertStringArray(budget.lowValueExcerpts, "wordBudget.lowValueExcerpts");
  assertStringArray(budget.compressionAdvice, "wordBudget.compressionAdvice");

  if (budget.charCount < 0 || budget.wordLimit <= 0) {
    throw new Error("Invalid grading artifact: word budget counts must be non-negative and wordLimit positive.");
  }
  if (budget.wordLimit !== expectedWordLimit) {
    throw new Error("Invalid grading artifact: model changed the question word limit.");
  }
  if (budget.overLimit !== (budget.charCount > budget.wordLimit)) {
    throw new Error("Invalid grading artifact: overLimit does not match charCount/wordLimit.");
  }
  return value as unknown as WordBudgetOutput;
}

export function validateReferenceCrossCheck(value: unknown): ReferenceCrossCheckOutput {
  assertObject(value, "reference cross-check output");
  const cross = value.referenceCrossCheck;
  assertObject(cross, "referenceCrossCheck");
  assertOptionalString(cross.source, "referenceCrossCheck.source");
  assertStringArray(cross.blindRubricMissingDimensions, "referenceCrossCheck.blindRubricMissingDimensions");
  assertStringArray(cross.referenceOnlyDimensions, "referenceCrossCheck.referenceOnlyDimensions");
  assertStringArray(cross.mergeDifferences, "referenceCrossCheck.mergeDifferences");
  assertStringArray(cross.notes, "referenceCrossCheck.notes");
  return value as unknown as ReferenceCrossCheckOutput;
}
