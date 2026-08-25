import { useEffect, useMemo, useState } from "react";
import { BookMarked, Check, FileText, Lightbulb, LoaderCircle, NotebookPen, Search, Sparkles, Trash2 } from "lucide-react";
import { errorMessage } from "./errorMessage";
import { deepReadQuestion, type MaterialDeepReadOutput } from "./materialLearning";
import { materialBankStore, type MaterialBankCategory, type MaterialBankItem } from "./materialBankStore";
import type { Question, QuestionType } from "./types";
import "./materialBank.css";

type Tab = "deep-read" | "bank";

const CATEGORY_LABEL: Record<MaterialBankCategory, string> = {
  expression: "规范表达",
  mechanism: "论证机制",
  case: "案例素材",
  "essay-angle": "作文观点"
};

const QUESTION_TYPES: Array<"all" | QuestionType> = ["all", "概括归纳", "提出对策", "综合分析", "贯彻执行", "文章写作"];

function bankItemsFromOutput(question: Question, output: MaterialDeepReadOutput): MaterialBankItem[] {
  const now = new Date().toISOString();
  const common = {
    sourceQuestionId: question.id,
    sourceQuestionTitle: question.title,
    note: "",
    createdAt: now
  };
  return [
    ...output.expressions.map(item => ({
      ...common,
      id: crypto.randomUUID(),
      category: "expression" as const,
      title: item.phrase,
      content: item.meaning,
      themes: item.useCases,
      sourceEvidence: item.sourceEvidence
    })),
    ...output.mechanisms.map(item => ({
      ...common,
      id: crypto.randomUUID(),
      category: "mechanism" as const,
      title: item.title,
      content: item.chain,
      themes: item.transferableTo,
      sourceEvidence: item.sourceEvidence
    })),
    ...output.cases.map(item => ({
      ...common,
      id: crypto.randomUUID(),
      category: "case" as const,
      title: item.title,
      content: item.summary,
      themes: item.transferableTo,
      sourceEvidence: item.sourceEvidence
    })),
    ...output.essayAngles.map(item => ({
      ...common,
      id: crypto.randomUUID(),
      category: "essay-angle" as const,
      title: item.claim,
      content: `${item.reasoning}\n\n段落用法：${item.paragraphUse}`,
      themes: item.transferableTo
    }))
  ];
}

function ExtractionSection({
  title,
  items,
  onSave
}: {
  title: string;
  items: MaterialBankItem[];
  onSave: (item: MaterialBankItem) => void;
}) {
  if (!items.length) return null;
  return <section className="learning-section">
    <h3>{title}<span>{items.length}</span></h3>
    <div className="learning-card-list">
      {items.map(item => <article key={item.id} className="learning-card">
        <div className="learning-card-head"><strong>{item.title}</strong><button onClick={() => onSave(item)}>+ 收入素材库</button></div>
        <p>{item.content}</p>
        {item.sourceEvidence && <small><b>材料依据：</b>{item.sourceEvidence}</small>}
        {!!item.themes.length && <div className="learning-tags">{item.themes.map(theme => <span key={theme}>{theme}</span>)}</div>}
      </article>)}
    </div>
  </section>;
}

export default function MaterialBankPage({
  questions,
  initialQuestionId
}: {
  questions: Question[];
  initialQuestionId?: string | null;
}) {
  const [tab, setTab] = useState<Tab>("deep-read");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | QuestionType>("all");
  const [selectedQuestionId, setSelectedQuestionId] = useState(initialQuestionId ?? questions[0]?.id ?? "");
  const [output, setOutput] = useState<MaterialDeepReadOutput | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [bank, setBank] = useState<MaterialBankItem[]>([]);
  const [bankFilter, setBankFilter] = useState<"all" | MaterialBankCategory>("all");
  const [savedMessage, setSavedMessage] = useState("");

  useEffect(() => {
    void materialBankStore.list().then(setBank).catch(error => console.error("Failed to load material bank.", error));
  }, []);

  useEffect(() => {
    if (initialQuestionId) {
      setSelectedQuestionId(initialQuestionId);
      setTab("deep-read");
      setOutput(null);
      setRunError(null);
    }
  }, [initialQuestionId]);

  const selectedQuestion = questions.find(item => item.id === selectedQuestionId) ?? null;
  const filteredQuestions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return questions.filter(question => {
      if (typeFilter !== "all" && question.type !== typeFilter) return false;
      return !needle || `${question.title}${question.region}${question.year}${question.type}`.toLowerCase().includes(needle);
    }).slice(0, 80);
  }, [questions, query, typeFilter]);

  const extracted = useMemo(() => selectedQuestion && output ? bankItemsFromOutput(selectedQuestion, output) : [], [output, selectedQuestion]);
  const extractedByCategory = useMemo(() => ({
    expression: extracted.filter(item => item.category === "expression"),
    mechanism: extracted.filter(item => item.category === "mechanism"),
    case: extracted.filter(item => item.category === "case"),
    "essay-angle": extracted.filter(item => item.category === "essay-angle")
  }), [extracted]);

  async function runDeepRead() {
    if (!selectedQuestion || running) return;
    setRunning(true);
    setRunError(null);
    setSavedMessage("");
    try {
      setOutput(await deepReadQuestion(selectedQuestion));
    } catch (error) {
      setRunError(errorMessage(error, "AI精读失败，请检查模型配置。"));
    } finally {
      setRunning(false);
    }
  }

  async function saveItems(items: MaterialBankItem[]) {
    if (!items.length) return;
    const next = await materialBankStore.addMany(items);
    setBank(next);
    setSavedMessage(`已收入 ${items.length} 条候选素材；重复项会自动跳过。`);
  }

  async function updateNote(item: MaterialBankItem, note: string) {
    setBank(await materialBankStore.updateNote(item.id, note));
  }

  async function removeItem(id: string) {
    setBank(await materialBankStore.remove(id));
  }

  const shownBank = bank.filter(item => bankFilter === "all" || item.category === bankFilter);

  return <main className="page page-wide material-bank-page">
    <header className="page-header compact">
      <div><p className="eyebrow">素材积累</p><h1>把真题材料变成自己的表达与论证语料</h1><p>AI精读独立于AI批改：直接从题干和材料生成参考作答，并提炼可复用的规范表达、机制、案例和作文观点。</p></div>
      <BookMarked size={28}/>
    </header>

    <div className="material-bank-tabs">
      <button className={tab === "deep-read" ? "active" : ""} onClick={() => setTab("deep-read")}><Sparkles size={16}/>AI精读</button>
      <button className={tab === "bank" ? "active" : ""} onClick={() => setTab("bank")}><NotebookPen size={16}/>我的素材 <span>{bank.length}</span></button>
    </div>

    {tab === "deep-read" ? <div className="deep-read-layout">
      <aside className="deep-read-picker">
        <div className="search-box"><Search size={15}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索要精读的真题"/></div>
        <select value={typeFilter} onChange={event => setTypeFilter(event.target.value as "all" | QuestionType)}>
          {QUESTION_TYPES.map(type => <option key={type} value={type}>{type === "all" ? "全部题型" : type}</option>)}
        </select>
        <div className="deep-read-question-list">
          {filteredQuestions.map(question => <button key={question.id} className={selectedQuestionId === question.id ? "active" : ""} onClick={() => { setSelectedQuestionId(question.id); setOutput(null); setRunError(null); }}>
            <strong>{question.title}</strong><span>{question.type} · {question.year} · {question.region}</span>
          </button>)}
        </div>
      </aside>

      <section className="deep-read-main">
        {selectedQuestion ? <>
          <div className="deep-read-question-head"><div><span>{selectedQuestion.type} · {selectedQuestion.score}分 · ≤{selectedQuestion.wordLimit}字</span><h2>{selectedQuestion.title}</h2><p>{selectedQuestion.prompt}</p></div><button className="primary" disabled={running} onClick={() => void runDeepRead()}>{running ? <LoaderCircle className="spin" size={16}/> : <Sparkles size={16}/>} {running ? "正在精读…" : output ? "重新精读" : "开始AI精读"}</button></div>
          {runError && <div className="deep-read-error">{runError}</div>}
          {!output && !running && <div className="deep-read-empty"><Lightbulb size={24}/><strong>这一步不需要先提交答案</strong><span>AI会直接读题干与完整材料，先给参考作答，再提炼值得积累的表达和论证素材。</span></div>}
          {running && <div className="deep-read-empty"><LoaderCircle className="spin" size={24}/><strong>正在精读材料</strong><span>长材料通常比普通对话需要更久，完成后会一次性返回结构化结果。</span></div>}
          {output && <>
            <section className="reference-answer-card"><div><FileText size={18}/><h3>{selectedQuestion.type === "文章写作" ? "参考立意与示范论证" : "参考作答"}</h3></div><p>{output.referenceAnswer}</p>{!!output.answerNotes.length && <ul>{output.answerNotes.map(note => <li key={note}>{note}</li>)}</ul>}</section>
            <div className="deep-read-actions"><button className="secondary" onClick={() => void saveItems(extracted)}><Check size={15}/>全部收入素材库</button>{savedMessage && <span>{savedMessage}</span>}</div>
            <ExtractionSection title="规范表达 / 中观词" items={extractedByCategory.expression} onSave={item => void saveItems([item])}/>
            <ExtractionSection title="作用机制 / 因果链" items={extractedByCategory.mechanism} onSave={item => void saveItems([item])}/>
            <ExtractionSection title="案例素材" items={extractedByCategory.case} onSave={item => void saveItems([item])}/>
            <ExtractionSection title="大作文观点与论证角度" items={extractedByCategory["essay-angle"]} onSave={item => void saveItems([item])}/>
          </>}
        </> : <div className="deep-read-empty">当前没有可精读题目。</div>}
      </section>
    </div> : <>
      <div className="bank-filter-row">
        {(["all", "expression", "mechanism", "case", "essay-angle"] as const).map(category => <button key={category} className={bankFilter === category ? "active" : ""} onClick={() => setBankFilter(category)}>{category === "all" ? `全部 ${bank.length}` : `${CATEGORY_LABEL[category]} ${bank.filter(item => item.category === category).length}`}</button>)}
      </div>
      <div className="bank-grid">
        {shownBank.map(item => <article className="bank-card" key={item.id}>
          <header><div><span>{CATEGORY_LABEL[item.category]}</span><strong>{item.title}</strong></div><button title="删除" onClick={() => void removeItem(item.id)}><Trash2 size={14}/></button></header>
          <p>{item.content}</p>
          {item.sourceEvidence && <small><b>原材料：</b>{item.sourceEvidence}</small>}
          {!!item.themes.length && <div className="learning-tags">{item.themes.map(theme => <span key={theme}>{theme}</span>)}</div>}
          <div className="bank-source">来自：{item.sourceQuestionTitle}</div>
          <label><span>我的笔记</span><textarea value={item.note} onChange={event => { const note = event.target.value; setBank(current => current.map(row => row.id === item.id ? { ...row, note } : row)); }} onBlur={event => void updateNote(item, event.target.value)} placeholder="写下你自己的理解、改写或适用场景…"/></label>
        </article>)}
      </div>
      {!shownBank.length && <div className="deep-read-empty"><NotebookPen size={24}/><strong>还没有这一类素材</strong><span>从“AI精读”中挑真正值得复用的内容收入这里。</span></div>}
    </>}
  </main>;
}
