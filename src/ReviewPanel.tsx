import { Check, ChevronDown, CircleAlert } from "lucide-react";
import ReferenceCrossCheckPanel from "./ReferenceCrossCheckPanel";
import ReviewProvenance from "./ReviewProvenance";
import type { MockReview, ReviewPoint } from "./types";
import EssayReviewPanel from "./EssayReviewPanel";

const FOCUS_LIMIT = 3;

function statusLabel(status: ReviewPoint["status"]): string {
  if (status === "hit") return "已覆盖";
  if (status === "partial") return "部分覆盖";
  return "待补";
}

function PointIcon({ status }: { status: ReviewPoint["status"] }) {
  return status === "hit" ? <Check size={15} /> : <CircleAlert size={15} />;
}

function PointStatus({ status }: { status: ReviewPoint["status"] }) {
  return <span className={`review-point-status review-point-status-${status}`}>{statusLabel(status)}</span>;
}

function PointDetail({ point }: { point: ReviewPoint }) {
  return <article className={`review-detail-point review-detail-point-${point.status}`}>
    <header>
      <PointIcon status={point.status} />
      <strong>{point.title}</strong>
      <PointStatus status={point.status} />
    </header>
    <div className="review-detail-copy">
      <p className="review-detail-evidence">{point.evidence}</p>
      {point.diagnosis && <p><b>判断：</b>{point.diagnosis}</p>}
      {point.suggestion && <p className="review-detail-suggestion"><b>修改：</b>{point.suggestion}</p>}
    </div>
  </article>;
}

export default function ReviewPanel({ review }: { review: MockReview }) {
  if (review.essayReview) return <EssayReviewPanel review={review}/>;
  const total = review.points.length;
  const hitCount = review.points.filter(point => point.status === "hit").length;
  const issuePoints = review.points.filter(point => point.status !== "hit");
  const focusPoints = issuePoints.slice(0, FOCUS_LIMIT);
  const hasMoreIssues = issuePoints.length > focusPoints.length;

  return <div className="review-content review-content-compact">
    <section className="review-summary-card">
      <div className="review-score-block"><span>本次得分</span><strong>{review.score}<small> / {review.maxScore}</small></strong></div>
      <div className="review-summary-copy"><span className={issuePoints.length ? "review-summary-label review-summary-label-warn" : "review-summary-label review-summary-label-good"}>{issuePoints.length ? `优先补 ${issuePoints.length} 个缺口` : "要点覆盖完整"}</span><p>{review.summary}</p></div>
    </section>

    <div className="review-signal-row" aria-label="批改指标">
      <span><small>要点覆盖</small><b>{review.coverage}</b></span>
      <span><small>分类</small><b>{review.classification}</b></span>
      <span><small>表达</small><b>{review.expression}</b></span>
      <span><small>冗余</small><b>{review.redundancy}</b></span>
    </div>

    <details className="review-provenance-details">
      <summary><span>评分口径与来源</span><ChevronDown size={14} /></summary>
      <ReviewProvenance review={review} />
    </details>

    <section className="review-focus-section">
      <header><div><span>下一步先改</span><strong>{issuePoints.length ? "把失分点变成动作" : "保持当前答题结构"}</strong></div><em>{total ? `已覆盖 ${hitCount}/${total}` : "暂无逐点数据"}</em></header>
      {focusPoints.length ? <div className="review-focus-list">{focusPoints.map(point => <article key={point.title} className={`review-focus-item review-focus-item-${point.status}`}><div><PointIcon status={point.status} /><strong>{point.title}</strong><PointStatus status={point.status} /></div>{point.suggestion && <p>{point.suggestion}</p>}</article>)}</div> : <p className="review-all-covered">本次没有需要优先返工的要点，可以继续练习表达精度。</p>}
      {hasMoreIssues && <p className="review-focus-hint">还有 {issuePoints.length - focusPoints.length} 个失分点已收纳到下方“查看全部逐点”。</p>}
    </section>

    <details className="review-all-points">
      <summary><span>查看全部逐点</span><em>{total} 项 · 已覆盖 {hitCount} 项</em><ChevronDown size={15} /></summary>
      <div className="review-detail-list">{review.points.map(point => <PointDetail key={point.title} point={point} />)}</div>
    </details>

    {review.referenceCrossCheck && <details className="review-reference-details"><summary><span>参考答案对照</span><ChevronDown size={14} /></summary><ReferenceCrossCheckPanel crossCheck={review.referenceCrossCheck} /></details>}
  </div>;
}
