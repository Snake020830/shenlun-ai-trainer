import type { EssayDimensionId, EssayReviewDetail, StructuredReview } from "../../types";
import type { EssayGradingArtifacts } from "./artifacts";
import {
  ESSAY_DIAGNOSTIC_DISCLAIMER,
  ESSAY_DIMENSION_LABELS,
  ESSAY_DIMENSION_WEIGHTS,
  ESSAY_METHOD_ID,
  YUAN_DONG_ESSAY_RULES
} from "./evidence";

function scaled(value: number, maxScore: number): number {
  return Number((value / 100 * maxScore).toFixed(1));
}

function status(score: number, max: number): "strong" | "developing" | "weak" {
  const ratio = max ? score / max : 0;
  return ratio >= 0.75 ? "strong" : ratio >= 0.5 ? "developing" : "weak";
}

function pointStatus(value: "strong" | "developing" | "weak"): "hit" | "partial" | "missed" {
  return value === "strong" ? "hit" : value === "developing" ? "partial" : "missed";
}

export function assembleEssayReview(maxScore: number, artifacts: EssayGradingArtifacts): StructuredReview {
  const rawTotal = artifacts.evaluation.dimensions.reduce((sum, dimension) => sum + dimension.score, 0);
  const dimensions = artifacts.evaluation.dimensions.map(dimension => {
    const max = ESSAY_DIMENSION_WEIGHTS[dimension.id];
    return {
      ...dimension,
      label: ESSAY_DIMENSION_LABELS[dimension.id],
      score: scaled(dimension.score, maxScore),
      maxScore: scaled(max, maxScore),
      status: status(dimension.score, max)
    };
  });
  const weakCount = dimensions.filter(item => item.status === "weak").length;
  const strongCount = dimensions.filter(item => item.status === "strong").length;
  const overLimit = artifacts.answerCharCount > artifacts.wordLimit;
  const dimensionById = new Map(dimensions.map(item => [item.id, item]));
  const weakest = [...dimensions].sort((a, b) => a.score / a.maxScore - b.score / b.maxScore)[0];

  const essayReview: EssayReviewDetail = {
    schemaVersion: "1.0.0",
    methodId: ESSAY_METHOD_ID,
    diagnosticDisclaimer: ESSAY_DIAGNOSTIC_DISCLAIMER,
    taskFrame: {
      themeType: artifacts.taskAnalysis.themeType,
      topicKeywords: artifacts.taskAnalysis.topicKeywords,
      proposedThesis: artifacts.taskAnalysis.proposedThesis,
      subpointCandidates: artifacts.taskAnalysis.subpointCandidates
    },
    dimensions,
    structureTrace: artifacts.evaluation.structureTrace,
    revisedOutline: artifacts.evaluation.revisedOutline,
    evidenceRefs: YUAN_DONG_ESSAY_RULES.map(({ dimensions: _dimensions, instruction: _instruction, ...ref }) => ref)
  };

  return {
    score: scaled(rawTotal, maxScore),
    maxScore,
    coverage: `${strongCount}/5 维稳定`,
    classification: dimensionById.get("structure")?.status === "strong" ? "结构稳定" : "结构待修",
    expression: dimensionById.get("expression")?.status === "weak" ? "需调整" : "基本可用",
    redundancy: overLimit ? `超出 ${artifacts.answerCharCount - artifacts.wordLimit} 字` : "字数合规",
    summary: `${artifacts.evaluation.summary}${weakest ? ` 下一轮优先修正“${weakest.label}”：${weakest.action}` : ""}`,
    points: dimensions.map(dimension => ({
      title: dimension.label,
      status: pointStatus(dimension.status),
      diagnosis: dimension.finding,
      evidence: dimension.answerEvidence,
      suggestion: dimension.action,
      errorCodes: dimension.evidenceRuleIds
    })),
    scoringPolicy: "yuan-dong-course-diagnostic-weights@1.0.0",
    calibrationStatus: "uncalibrated",
    essayReview
  };
}
