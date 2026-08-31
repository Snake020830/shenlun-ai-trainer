import type { MockReview } from "./types";

function interpretationLabel(review: MockReview): string {
  if (review.scoreInterpretation === "mock-diagnostic" || review.calibrationStatus === "mock") return "Mock 诊断分";
  if (review.scoreInterpretation === "validated" || review.calibrationStatus === "validated") return "已校准";
  if (review.scoreInterpretation === "ai-diagnostic-uncalibrated" || review.calibrationStatus === "uncalibrated") return "AI 诊断分 · 未校准";
  return "历史结果 · 口径不完整";
}

export default function ReviewProvenance({ review }: { review: MockReview }) {
  const warnings = review.skillWarnings ?? [];
  return <div className="review-provenance" aria-label="批改结果来源与口径">
    <div className="review-provenance-badges"><span className="review-provenance-interpretation">{interpretationLabel(review)}</span>{review.providerId && <span>provider · {review.providerId}</span>}{review.engine && <span>engine · {review.engine}</span>}</div>
    <div className="review-provenance-meta">{review.skillVersion && <span>Skill {review.skillVersion}</span>}{review.rulesetVersion && <span>规则 {review.rulesetVersion}</span>}{review.scoringPolicy && <span>评分策略 {review.scoringPolicy}</span>}</div>
    {!!warnings.length && <div className="review-provenance-warnings"><strong>提示</strong>{warnings.slice(0, 3).map((warning, index) => <span key={`${index}-${warning}`}>{warning}</span>)}</div>}
  </div>;
}
