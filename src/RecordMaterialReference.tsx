import type { ReactNode } from "react";
import { BookOpen, Check, ChevronDown, CircleAlert } from "lucide-react";
import { useState } from "react";
import type { MockReview, Question, ReviewPoint } from "./types";

type EvidenceMarker = {
  start: number;
  end: number;
  pointIndex: number;
  point: ReviewPoint;
};

function evidenceTerms(evidence: string): string[] {
  const quoted = [...evidence.matchAll(/[“「『"]([^”」』"]{2,48})[”」』"]/g)].map(match => match[1]);
  const fragments = evidence
    .split(/[；;。！？!?,，、]/)
    .map(item => item.replace(/^(材料(中|原文)?|原文(中|显示)?)[：:\s]*/u, "").trim())
    .filter(item => item.length >= 3 && item.length <= 48);
  return [...new Set([...quoted, ...fragments])].sort((left, right) => right.length - left.length);
}

function buildMarkers(content: string, review: MockReview): EvidenceMarker[] {
  const markers: EvidenceMarker[] = [];
  review.points.forEach((point, pointIndex) => {
    for (const term of evidenceTerms(point.evidence)) {
      let fromIndex = 0;
      while (fromIndex < content.length) {
        const start = content.indexOf(term, fromIndex);
        if (start < 0) break;
        markers.push({ start, end: start + term.length, pointIndex, point });
        fromIndex = start + term.length;
      }
    }
  });
  markers.sort((left, right) => left.start - right.start || (right.end - right.start) - (left.end - left.start));
  const accepted: EvidenceMarker[] = [];
  for (const marker of markers) {
    if (accepted.some(item => marker.start < item.end && marker.end > item.start)) continue;
    accepted.push(marker);
  }
  return accepted;
}

function MarkedSource({ content, review }: { content: string; review: MockReview }) {
  const markers = buildMarkers(content, review);
  if (!markers.length) return <>{content}</>;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const marker of markers) {
    if (marker.start > cursor) nodes.push(content.slice(cursor, marker.start));
    nodes.push(<mark key={`${marker.start}-${marker.pointIndex}`} className={`record-evidence-mark record-evidence-${marker.point.status}`} title={marker.point.title}>
      {content.slice(marker.start, marker.end)}<sup>{marker.pointIndex + 1}</sup>
    </mark>);
    cursor = marker.end;
  }
  if (cursor < content.length) nodes.push(content.slice(cursor));
  return <>{nodes}</>;
}

function CollapsibleMaterial({ material, review }: { material: Question["materials"][number]; review: MockReview }) {
  const [open, setOpen] = useState(false);
  return <article className={`record-material-item ${open ? "open" : ""}`}>
    <button type="button" className="record-material-toggle" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <span><strong>{material.label}</strong><small>{open ? "收起材料" : "展开材料"}</small></span>
      <ChevronDown size={16}/>
    </button>
    {open && <p><MarkedSource content={material.content} review={review}/></p>}
  </article>;
}

export default function RecordMaterialReference({ question, review }: { question: Question; review: MockReview }) {
  // Essay feedback cites course rules and the writer's own argument structure;
  // small-question material-point markers would be misleading here.
  if (question.type === "文章写作" || review.essayReview) return null;
  const markedCount = question.materials.reduce((total, material) => total + buildMarkers(material.content, review).length, 0);
  return <section className="record-material-reference">
    <header className="record-material-heading">
      <div><span className="record-section-kicker"><BookOpen size={16}/>对照原文</span><h2>材料原文</h2><p>批改依据已直接标在原文上，编号对应下方逐点详情。</p></div>
      <span className="record-material-count">{question.materials.length} 则材料 · {markedCount ? `已定位 ${markedCount} 处` : "暂未匹配原文词"}</span>
    </header>
    <div className="record-material-legend"><span><i className="record-legend-hit"><Check size={10}/></i>已覆盖</span><span><i className="record-legend-partial"><CircleAlert size={10}/></i>部分覆盖</span><span><i className="record-legend-missed"><CircleAlert size={10}/></i>待补</span></div>
    <div className="record-material-list">{question.materials.map(material => <CollapsibleMaterial key={material.id} material={material} review={review}/>)}</div>
  </section>;
}
