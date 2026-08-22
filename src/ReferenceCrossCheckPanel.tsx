import { CircleAlert, GitCompareArrows } from "lucide-react";
import type { ReviewReferenceCrossCheck } from "./types";
import "./referenceCrossCheck.css";

function FindingGroup({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return <div className="reference-finding-group">
    <strong>{title}</strong>
    {items.map((item, index) => <p key={`${title}-${index}`}>{item}</p>)}
  </div>;
}

export default function ReferenceCrossCheckPanel({ crossCheck }: { crossCheck: ReviewReferenceCrossCheck }) {
  const differenceCount = crossCheck.blindRubricMissingDimensions.length
    + crossCheck.referenceOnlyDimensions.length
    + crossCheck.mergeDifferences.length;

  return <section className="reference-crosscheck">
    <div className="reference-crosscheck-heading">
      <GitCompareArrows size={17}/>
      <div><strong>参考答案交叉验证</strong><span>{crossCheck.source || "未标注来源"}</span></div>
    </div>
    <div className="reference-crosscheck-note"><CircleAlert size={14}/><span>此处只展示 Stage 5 差异，不自动修改盲抽 rubric，也不自动改分。</span></div>
    {differenceCount === 0
      ? <p className="reference-no-diff">当前未识别到需要人工复核的结构差异。</p>
      : <div className="reference-findings">
          <FindingGroup title="盲抽 rubric 可能需要复核" items={crossCheck.blindRubricMissingDimensions}/>
          <FindingGroup title="参考答案独有维度" items={crossCheck.referenceOnlyDimensions}/>
          <FindingGroup title="归并粒度差异" items={crossCheck.mergeDifferences}/>
        </div>}
    {crossCheck.notes.length > 0 && <FindingGroup title="补充说明" items={crossCheck.notes}/>} 
  </section>;
}