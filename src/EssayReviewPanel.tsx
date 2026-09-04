import { BookOpenCheck, ChevronDown, CircleAlert, Route, Target } from "lucide-react";
import ReviewProvenance from "./ReviewProvenance";
import type { EssayDimensionReview, StructuredReview } from "./types";

function statusLabel(status: EssayDimensionReview["status"]): string {
  return status === "strong" ? "稳定" : status === "developing" ? "待加强" : "优先返工";
}

function themeTypeLabel(type: "single" | "double" | "multi"): string {
  return type === "single" ? "单主题" : type === "double" ? "双主题" : "多主题";
}

export default function EssayReviewPanel({ review }: { review: StructuredReview }) {
  const detail = review.essayReview;
  if (!detail) return null;
  const weakest = [...detail.dimensions].sort((a, b) => a.score / a.maxScore - b.score / b.maxScore)[0];

  return <div className="essay-review">
    <section className="essay-review-hero">
      <div className="essay-review-score"><span>作文诊断分</span><strong>{review.score}<small> / {review.maxScore}</small></strong><em>课程量表 · 非官方等值分</em></div>
      <div><span className="essay-review-method">袁东课程证据模型</span><h3>{review.summary}</h3>{weakest && <p><Target size={14}/>下一轮只盯：<b>{weakest.label}</b> · {weakest.action}</p>}</div>
    </section>

    <section className="essay-task-frame">
      <header><div><Route size={16}/><strong>审题建构</strong></div><span>{themeTypeLabel(detail.taskFrame.themeType)}</span></header>
      <div className="essay-keywords">{detail.taskFrame.topicKeywords.map(keyword => <span key={keyword}>{keyword}</span>)}</div>
      <p><b>建议总论点：</b>{detail.taskFrame.proposedThesis}</p>
      <ol>{detail.taskFrame.subpointCandidates.map((item, index) => <li key={`${index}-${item.claim}`}><strong>{item.claim}</strong><small>{item.source === "prompt" ? "题干" : item.source === "prompt-material" ? "题干所在材料" : "全篇材料"} · {item.sourceEvidence}</small></li>)}</ol>
    </section>

    <section className="essay-dimensions">
      <header><strong>五维独立评分</strong><span>总分按题目分值等比例折算</span></header>
      {detail.dimensions.map(dimension => <article key={dimension.id} className={`essay-dimension essay-dimension-${dimension.status}`}>
        <div className="essay-dimension-heading"><strong>{dimension.label}</strong><span>{dimension.score}/{dimension.maxScore}</span><em>{statusLabel(dimension.status)}</em></div>
        <div className="essay-dimension-track"><i style={{ width: `${Math.min(100, dimension.score / dimension.maxScore * 100)}%` }}/></div>
        <p>{dimension.finding}</p>
        <blockquote>{dimension.answerEvidence}</blockquote>
        <div className="essay-dimension-action"><CircleAlert size={13}/><span>{dimension.action}</span></div>
        <small>依据：{dimension.evidenceRuleIds.join(" · ")}</small>
      </article>)}
    </section>

    <details className="essay-review-details" open>
      <summary><span>文章骨架与重写提纲</span><ChevronDown size={14}/></summary>
      <div className="essay-structure-grid">
        <div><span>识别到的标题</span><strong>{detail.structureTrace.title}</strong></div>
        <div><span>识别到的总论点</span><strong>{detail.structureTrace.centralThesis}</strong></div>
        <div><span>开头</span><p>{detail.structureTrace.introductionAssessment}</p></div>
        <div><span>结尾</span><p>{detail.structureTrace.conclusionAssessment}</p></div>
      </div>
      <div className="essay-revised-outline"><h4>{detail.revisedOutline.title}</h4><p>{detail.revisedOutline.thesis}</p><ol>{detail.revisedOutline.subpoints.map(item => <li key={item}>{item}</li>)}</ol><div>{detail.revisedOutline.paragraphPlan.map((item, index) => <span key={`${index}-${item}`}>{index + 1}. {item}</span>)}</div></div>
    </details>

    <details className="essay-review-details">
      <summary><span>课程证据与评分口径</span><ChevronDown size={14}/></summary>
      <p className="essay-disclaimer">{detail.diagnosticDisclaimer}</p>
      <div className="essay-evidence-list">{detail.evidenceRefs.map(ref => <article key={ref.ruleId}><BookOpenCheck size={14}/><div><strong>{ref.ruleId} · {ref.title}</strong><span>{ref.source} · {ref.location}</span></div></article>)}</div>
      <ReviewProvenance review={review}/>
    </details>
  </div>;
}
