import type { EssayDimensionId, EssayReviewDetail } from "../../types";
import type { EssayEvaluationOutput, EssayTaskAnalysisOutput } from "./artifacts";
import { ESSAY_DIMENSION_WEIGHTS, YUAN_DONG_ESSAY_RULES } from "./evidence";

const DIMENSION_IDS = Object.keys(ESSAY_DIMENSION_WEIGHTS) as EssayDimensionId[];
const RULE_IDS = new Set(YUAN_DONG_ESSAY_RULES.map(rule => rule.ruleId));

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${field} must be an object.`);
  return value as Record<string, unknown>;
}

function string(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} must be a non-empty string.`);
  return value.trim();
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || !value.every(item => typeof item === "string" && item.trim())) {
    throw new Error(`${field} must contain non-empty strings.`);
  }
  return value.map(item => item.trim());
}

export function validateEssayTaskAnalysis(value: unknown): EssayTaskAnalysisOutput {
  const root = record(value, "essay task analysis");
  const type = root.themeType;
  if (type !== "single" && type !== "double" && type !== "multi") throw new Error("themeType is unsupported.");
  if (!Array.isArray(root.subpointCandidates) || root.subpointCandidates.length < 2 || root.subpointCandidates.length > 4) {
    throw new Error("subpointCandidates must contain 2 to 4 items.");
  }
  const candidates = root.subpointCandidates.map((item, index) => {
    const candidate = record(item, `subpointCandidates[${index}]`);
    const source = candidate.source;
    if (source !== "prompt" && source !== "prompt-material" && source !== "full-material") {
      throw new Error(`subpointCandidates[${index}].source is unsupported.`);
    }
    return {
      claim: string(candidate.claim, `subpointCandidates[${index}].claim`),
      source: source as "prompt" | "prompt-material" | "full-material",
      sourceEvidence: string(candidate.sourceEvidence, `subpointCandidates[${index}].sourceEvidence`)
    };
  });
  return {
    themeType: type,
    topicKeywords: stringArray(root.topicKeywords, "topicKeywords").slice(0, 6),
    proposedThesis: string(root.proposedThesis, "proposedThesis"),
    subpointCandidates: candidates,
    taskEvidence: string(root.taskEvidence, "taskEvidence")
  };
}

export function validateEssayEvaluation(value: unknown): EssayEvaluationOutput {
  const root = record(value, "essay evaluation");
  if (!Array.isArray(root.dimensions) || root.dimensions.length !== DIMENSION_IDS.length) {
    throw new Error(`dimensions must contain exactly ${DIMENSION_IDS.length} items.`);
  }
  const seen = new Set<EssayDimensionId>();
  const dimensions = root.dimensions.map((item, index) => {
    const dimension = record(item, `dimensions[${index}]`);
    const id = dimension.id as EssayDimensionId;
    if (!DIMENSION_IDS.includes(id) || seen.has(id)) throw new Error(`dimensions[${index}].id is invalid or duplicated.`);
    seen.add(id);
    if (typeof dimension.score !== "number" || !Number.isFinite(dimension.score) || dimension.score < 0 || dimension.score > ESSAY_DIMENSION_WEIGHTS[id]) {
      throw new Error(`dimensions[${index}].score must be between 0 and ${ESSAY_DIMENSION_WEIGHTS[id]}.`);
    }
    const evidenceRuleIds = stringArray(dimension.evidenceRuleIds, `dimensions[${index}].evidenceRuleIds`);
    if (!evidenceRuleIds.length || evidenceRuleIds.some(ruleId => !RULE_IDS.has(ruleId))) {
      throw new Error(`dimensions[${index}].evidenceRuleIds contains an unknown rule.`);
    }
    return {
      id,
      score: dimension.score,
      finding: string(dimension.finding, `dimensions[${index}].finding`),
      answerEvidence: string(dimension.answerEvidence, `dimensions[${index}].answerEvidence`),
      action: string(dimension.action, `dimensions[${index}].action`),
      evidenceRuleIds
    };
  });

  const trace = record(root.structureTrace, "structureTrace");
  const paragraphCount = trace.paragraphCount;
  if (typeof paragraphCount !== "number" || !Number.isInteger(paragraphCount) || paragraphCount < 1) {
    throw new Error("structureTrace.paragraphCount must be a positive integer.");
  }
  const outline = record(root.revisedOutline, "revisedOutline");
  return {
    summary: string(root.summary, "summary"),
    dimensions,
    structureTrace: {
      title: string(trace.title, "structureTrace.title"),
      centralThesis: string(trace.centralThesis, "structureTrace.centralThesis"),
      subpoints: stringArray(trace.subpoints, "structureTrace.subpoints"),
      paragraphCount,
      introductionAssessment: string(trace.introductionAssessment, "structureTrace.introductionAssessment"),
      conclusionAssessment: string(trace.conclusionAssessment, "structureTrace.conclusionAssessment")
    },
    revisedOutline: {
      title: string(outline.title, "revisedOutline.title"),
      thesis: string(outline.thesis, "revisedOutline.thesis"),
      subpoints: stringArray(outline.subpoints, "revisedOutline.subpoints"),
      paragraphPlan: stringArray(outline.paragraphPlan, "revisedOutline.paragraphPlan")
    }
  };
}

export function validateEssayReviewDetail(value: unknown, expectedMaxScore: number): EssayReviewDetail {
  const root = record(value, "essayReview");
  if (root.schemaVersion !== "1.0.0") throw new Error("essayReview.schemaVersion is unsupported.");
  string(root.methodId, "essayReview.methodId");
  string(root.diagnosticDisclaimer, "essayReview.diagnosticDisclaimer");
  const taskFrame = record(root.taskFrame, "essayReview.taskFrame");
  const taskType = taskFrame.themeType;
  if (taskType !== "single" && taskType !== "double" && taskType !== "multi") throw new Error("essayReview.taskFrame.themeType is unsupported.");
  stringArray(taskFrame.topicKeywords, "essayReview.taskFrame.topicKeywords");
  string(taskFrame.proposedThesis, "essayReview.taskFrame.proposedThesis");

  if (!Array.isArray(root.dimensions) || root.dimensions.length !== DIMENSION_IDS.length) throw new Error("essayReview.dimensions must contain five dimensions.");
  const ids = new Set<EssayDimensionId>();
  let maxTotal = 0;
  for (const [index, item] of root.dimensions.entries()) {
    const dimension = record(item, `essayReview.dimensions[${index}]`);
    const id = dimension.id as EssayDimensionId;
    if (!DIMENSION_IDS.includes(id) || ids.has(id)) throw new Error(`essayReview.dimensions[${index}].id is invalid or duplicated.`);
    ids.add(id);
    if (typeof dimension.score !== "number" || typeof dimension.maxScore !== "number" || dimension.score < 0 || dimension.score > dimension.maxScore) {
      throw new Error(`essayReview.dimensions[${index}] has invalid score fields.`);
    }
    maxTotal += dimension.maxScore;
    string(dimension.finding, `essayReview.dimensions[${index}].finding`);
    string(dimension.answerEvidence, `essayReview.dimensions[${index}].answerEvidence`);
    string(dimension.action, `essayReview.dimensions[${index}].action`);
    const refs = stringArray(dimension.evidenceRuleIds, `essayReview.dimensions[${index}].evidenceRuleIds`);
    if (refs.some(ruleId => !RULE_IDS.has(ruleId))) throw new Error(`essayReview.dimensions[${index}] contains an unknown evidence rule.`);
  }
  if (Math.abs(maxTotal - expectedMaxScore) > 0.2) throw new Error("essayReview dimension maximums do not match question score.");
  if (!Array.isArray(root.evidenceRefs) || !root.evidenceRefs.length) throw new Error("essayReview.evidenceRefs must not be empty.");
  return value as EssayReviewDetail;
}
