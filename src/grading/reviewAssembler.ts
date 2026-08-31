import type { StructuredReview } from "../types";
import type { GradingWorkflowArtifacts } from "./artifacts";
import type { ScorePolicy } from "./scorePolicy";

const CLASSIFICATION_ERRORS = new Set(["CATEGORY_CONFUSION", "OBJECT_CONFUSION", "OVER_MERGE"]);
const EXPRESSION_ERRORS = new Set(["EXPRESSION_AMBIGUITY", "OVER_ABSTRACTION", "MODALITY_SHIFT", "MECHANISM_LOSS"]);

function countErrors(artifacts: GradingWorkflowArtifacts, target: Set<string>): number {
  return artifacts.mappings.reduce(
    (count, mapping) => count + mapping.errorCodes.filter(code => target.has(code)).length,
    0
  );
}

function userFacingSuggestion(mapping: GradingWorkflowArtifacts["mappings"][number]): string | undefined {
  if (mapping.status === "hit") return undefined;
  const diagnosis = mapping.diagnosis?.trim();
  const suggestion = mapping.suggestion?.trim();
  if (mapping.status === "partial") {
    if (diagnosis && suggestion) return `方向已到：${diagnosis}；最小修改：${suggestion}`;
    if (diagnosis) return `方向已到：${diagnosis}`;
    return suggestion ? `方向已到；最小修改：${suggestion}` : "方向已到，但表述还不够完整。";
  }
  if (diagnosis && suggestion) return `真正漏点：${diagnosis}；补充：${suggestion}`;
  if (diagnosis) return `真正漏点：${diagnosis}`;
  return suggestion ? `真正漏点；补充：${suggestion}` : "主得分方向没有出现。";
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
      diagnosis: mapping.diagnosis,
      evidence: rubricPoint.evidence.join("；"),
      suggestion: userFacingSuggestion(mapping),
      errorCodes: mapping.errorCodes
    };
  });

  const classification = classificationErrors === 0 ? "清晰" : classificationErrors === 1 ? "基本清晰" : "需调整";
  const expression = expressionErrors === 0 ? "到位" : expressionErrors === 1 ? "有一处损失" : "有多处损失";
  const redundancy = redundancySignals === 0 ? "控制较好" : redundancySignals <= 2 ? "可再压缩" : "偏多";
  const coverage = `${hit} 完整 / ${partial} 表述损失 / ${missed} 真正遗漏`;

  let summary = `主得分维度：${hit} 个完整覆盖，${partial} 个方向已到但表达有损失，${missed} 个真正遗漏。`;
  if (artifacts.wordBudget.overLimit) summary += " 当前答案超过字数上限，应先压缩重复和低价值表达。";
  if (scoreResult.calibrationStatus === "uncalibrated") {
    summary += " 分数仍是未校准诊断分，优先看覆盖、表述损失和漏点。";
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
    referenceCrossCheck: artifacts.referenceCrossCheck,
    scoringPolicy: scoreResult.policyId,
    calibrationStatus: scoreResult.calibrationStatus
  };
}
