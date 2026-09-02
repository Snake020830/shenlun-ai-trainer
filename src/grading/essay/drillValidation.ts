import type { EssayDrillMode } from "../../essayDrillStore";
import type { EssayDrillOverallLevel, EssayDrillProfessionalReview, EssayDrillStepReview, EssayDrillStepStatus } from "./drillArtifacts";
import { YUAN_DONG_ESSAY_RULES } from "./evidence";

const STEP_IDS: EssayDrillMode[] = ["theme", "outline", "paragraph", "evidence", "closing"];
const RULE_IDS = new Set(YUAN_DONG_ESSAY_RULES.map(rule => rule.ruleId));

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${field} must be an object.`);
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} must be a non-empty string.`);
  return value.trim();
}

function textArray(value: unknown, field: string, min = 0, max = Number.POSITIVE_INFINITY): string[] {
  if (!Array.isArray(value) || value.length < min || value.length > max || !value.every(item => typeof item === "string" && item.trim())) {
    throw new Error(`${field} must contain ${min}-${Number.isFinite(max) ? max : "many"} non-empty strings.`);
  }
  return value.map(item => item.trim());
}

export function validateEssayDrillReview(value: unknown): Omit<EssayDrillProfessionalReview, "schemaVersion" | "providerKind" | "warnings"> {
  const root = record(value, "essay drill review");
  const overallLevel = root.overallLevel as EssayDrillOverallLevel;
  if (!(["ready", "revise", "incomplete"] as EssayDrillOverallLevel[]).includes(overallLevel)) throw new Error("overallLevel is invalid.");
  if (!Array.isArray(root.stepReviews) || root.stepReviews.length !== STEP_IDS.length) throw new Error("stepReviews must contain exactly five steps.");
  const seen = new Set<EssayDrillMode>();
  const stepReviews: EssayDrillStepReview[] = root.stepReviews.map((item, index) => {
    const step = record(item, `stepReviews[${index}]`);
    const id = step.id as EssayDrillMode;
    const status = step.status as EssayDrillStepStatus;
    if (!STEP_IDS.includes(id) || seen.has(id)) throw new Error(`stepReviews[${index}].id is invalid or duplicated.`);
    if (!(["strong", "developing", "missing"] as EssayDrillStepStatus[]).includes(status)) throw new Error(`stepReviews[${index}].status is invalid.`);
    seen.add(id);
    const courseRuleIds = textArray(step.courseRuleIds, `stepReviews[${index}].courseRuleIds`, 1, 5);
    if (courseRuleIds.some(ruleId => !RULE_IDS.has(ruleId))) throw new Error(`stepReviews[${index}].courseRuleIds contains an unknown rule.`);
    return {
      id,
      label: text(step.label, `stepReviews[${index}].label`),
      status,
      finding: text(step.finding, `stepReviews[${index}].finding`),
      answerEvidence: text(step.answerEvidence, `stepReviews[${index}].answerEvidence`),
      courseRuleIds,
      action: text(step.action, `stepReviews[${index}].action`),
      rewriteExample: text(step.rewriteExample, `stepReviews[${index}].rewriteExample`)
    };
  });
  stepReviews.sort((left, right) => STEP_IDS.indexOf(left.id) - STEP_IDS.indexOf(right.id));
  const coherence = record(root.coherence, "coherence");
  return {
    overallLevel,
    summary: text(root.summary, "summary"),
    coherence: {
      finding: text(coherence.finding, "coherence.finding"),
      breakpoints: Array.isArray(coherence.breakpoints) && coherence.breakpoints.length === 0 ? [] : textArray(coherence.breakpoints, "coherence.breakpoints", 1, 8),
      action: text(coherence.action, "coherence.action")
    },
    stepReviews,
    priorityActions: textArray(root.priorityActions, "priorityActions", 1, 5),
    assemblyPlan: textArray(root.assemblyPlan, "assemblyPlan", 4, 7)
  };
}
