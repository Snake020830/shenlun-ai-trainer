import { BookOpenCheck, FileText, Lightbulb, Quote, Route, ScrollText } from "lucide-react";
import type { MaterialDeepReadOutput } from "./materialLearning";
import "./deepReadResult.css";

export default function DeepReadResultView({
  result,
  answerTitle = "参考作答"
}: {
  result: MaterialDeepReadOutput;
  answerTitle?: string;
}) {
  return <div className="deep-read-report">
    <section className="dr-answer-panel">
      <header className="dr-panel-title dr-blue">
        <span><FileText size={17}/>{answerTitle}</span>
        <small>AI精读 · 不参与评分</small>
      </header>
      <div className="dr-answer-text">{result.referenceAnswer}</div>
      {!!result.answerBlueprint.length && <div className="dr-blueprint">
        <div className="dr-mini-title"><BookOpenCheck size={14}/>答题结构</div>
        <ol>{result.answerBlueprint.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ol>
      </div>}
    </section>

    <section className="dr-takeaway-panel">
      <header className="dr-takeaway-head">
        <div><span>本题提炼</span><strong>{result.themeSummary.topic}</strong></div>
        <Lightbulb size={20}/>
      </header>

      <div className="dr-theme-strip">
        <div><span>核心问题</span><p>{result.themeSummary.coreQuestion}</p></div>
        <i/>
        <div><span>可迁移判断</span><p>{result.themeSummary.transferableInsight}</p></div>
      </div>

      {!!result.expressions.length && <section className="dr-section dr-expression-section">
        <div className="dr-section-title"><Quote size={15}/><strong>高价值表达</strong><span>只记能真正复用的词</span></div>
        <div className="dr-expression-grid">
          {result.expressions.map((item, index) => <article key={`${item.phrase}-${index}`}>
            <strong>{item.phrase}</strong>
            <p>{item.usage}</p>
            <details><summary>材料依据</summary><span>{item.sourceEvidence}</span></details>
          </article>)}
        </div>
      </section>}

      {!!result.reasoningChains.length && <section className="dr-section dr-reasoning-section">
        <div className="dr-section-title"><Route size={15}/><strong>论证链</strong><span>理解“为什么”，不背散点</span></div>
        <div className="dr-reasoning-list">
          {result.reasoningChains.map((item, index) => <article key={`${index}-${item.chain}`}>
            <span className="dr-index">{index + 1}</span>
            <div><strong>{item.chain}</strong><p>{item.takeaway}</p>{!!item.transferableTo.length && <div className="dr-tags">{item.transferableTo.map(tag => <span key={tag}>{tag}</span>)}</div>}<details><summary>材料依据</summary><span>{item.sourceEvidence}</span></details></div>
          </article>)}
        </div>
      </section>}

      {!!result.essayUnits.length && <section className="dr-section dr-essay-section">
        <div className="dr-section-title"><ScrollText size={15}/><strong>大作文调用</strong><span>事实 → 机制 → 观点</span></div>
        <div className="dr-essay-list">
          {result.essayUnits.map((item, index) => <article key={`${item.title}-${index}`}>
            <header><strong>{item.title}</strong>{!!item.transferableTo.length && <div className="dr-tags">{item.transferableTo.map(tag => <span key={tag}>{tag}</span>)}</div>}</header>
            <div className="dr-essay-flow">
              <div><span>事实</span><p>{item.fact}</p></div>
              <div><span>机制</span><p>{item.mechanism}</p></div>
              <div><span>可用观点</span><p>{item.usableClaim}</p></div>
            </div>
            <details><summary>材料依据</summary><span>{item.sourceEvidence}</span></details>
          </article>)}
        </div>
      </section>}
    </section>
  </div>;
}
