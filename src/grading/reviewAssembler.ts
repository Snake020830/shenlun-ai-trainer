import type { StructuredReview } from "../types";
import type { GradingWorkflowArtifacts } from "./artifacts";
import type { ScorePolicy } from "./scorePolicy";

const CLASSIFICATION_ERRORS = new Set(["CATEGORY_CONFUSION", "OBJECT_CONFUSION", "OVER_MERGE"]);
const EXPRESSION_ERRORS = new Set(["EXPRESSION_AMBIGUITY", "OVER_ABSTRACTION", "MODALITY_SHIFT"]);

function countErrors(artifacts: GradingWorkflowArtifacts, target: Set<string>): number {
  return artifacts.mappings.reduce(
    (count, mapping) => count + mapping.errorCodes.filter(code => target.has(code)).length,
    0
  );
}

export function assembleReview(
  maxScore: number,
  artifacts: GradingWorkflowArtifacts,
  scorePolicy: ScorePolicy
): StructuredReview {
  const scoreResult = scorePolicy.score({ maxScore, rubric: artifacts.rubric, mappings: artifacts.mappings });
  const mappingById = new Map(artifacts.mappings.map(item => [item.rubricPointId, item]));
  const hit = artifacts.mappings.filter(item => item.status === "hit").length;
  const partial = artifacts.mappings.filter(item => item.status === "partial").length;
  const missed = artifacts.mappings.filter(item => item.status === "missed").length;
  const classificationErrors = countErrors(artifacts, CLASSIFICATION_ERRORS);
  const expressionErrors = countErrors(artifacts, EXPRESSION_ERRORS);
  const redundancySignals = artifacts.wordBudget.redundantExcerpts.length + artifacts.wordBudget.lowValueExcerpts.length;

  const points = artifacts.rubric.map(rubricPoint => {
    const mapping = mappingById.get(rubricPoint.id);
    if (!mapping) throw new Error(`Cannot assemble review: missing mapping for ${rubricPoint.id}.`);
    return {
      title: rubricPoint.title,
      status: mapping.status,
      evidence: rubricPoint.evidence.join("；"),
      suggestion: mapping.suggestion,
      errorCodes: mapping.errorCodes
    };
  });

  const classification = classificationErrors === 0 ? "清晰" : classificationErrors === 1 ? "基本清晰" : "需加强";
  const expression = expressionErrors === 0 ? "较清楚" : expressionErrors === 1 ? "有局部问题" : "需加强";
  const redundancy = redundancySignals === 0 ? "较低" : redundancySignals <= 2 ? "可压缩" : "偏高";
  const coverage = `${hit} 命中 / ${partial} 部分 / ${missed} 遗漏`;

  let summary = `当前 rubric 共 ${artifacts.rubric.length} 个独立信息维度：${hit} 个完整覆盖，${partial} 个部分覆盖，${missed} 个遗漏。`;
  if (artifacts.wordBudget.overLimit) summary += " 当前答案超过字数上限，应优先压缩重复和低价值表达。";
  if (scoreResult.calibrationStatus === "uncalibrated") {
    summary += " 当前得分由未校准诊断 policy 计算，只用于开发与一致性验证，不代表正式阅卷分。";
  }

  return {
    score: scoreResult.score,
    maxScore,
    coverage,
    classification,
    expression,
    redundancy,
    summary,
    points,
    scoringPolicy: scoreResult.policyId,
    calibrationStatus: scoreResult.calibrationStatus
  };
}
