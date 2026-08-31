import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft, BookOpen, BookmarkPlus, CalendarDays, Check, ChevronRight,
  FileText, History, Lightbulb, LoaderCircle, Search, Sparkles, Target
} from "lucide-react";
import { errorMessage } from "./errorMessage";
import {
  deepReadQuestion,
  MATERIAL_LEARNING_VERSION,
  type DeepReadAnnotation,
  type DeepReadAnnotationType,
  type MaterialDeepReadOutput
} from "./materialLearning";
import {
  loadMaterialDeepReadSnapshot,
  loadMaterialDeepReadSnapshots,
  saveMaterialDeepReadSnapshot,
  type MaterialDeepReadSnapshot
} from "./materialLearningStore";
import { materialBankStore, type MaterialBankItem } from "./materialBankStore";
import DailyMaterialPage from "./DailyMaterialPage";
import { inferQuestionThemes, QUESTION_THEMES, type QuestionTheme } from "./questionThemes";
import type { Question, QuestionType } from "./types";
import "./materialBank.css";

type View = "browse" | "reader" | "archive";
type Theme = "全部主题" | QuestionTheme;

const QUESTION_TYPES: Array<"全部题型" | QuestionType> = ["全部题型", "概括归纳", "提出对策", "综合分析", "贯彻执行", "文章写作"];
const THEMES: Theme[] = QUESTION_THEMES;
const DEEP_READ_PAGE_SIZE = 24;
const ANNOTATION_LABEL: Record<DeepReadAnnotationType, string> = {
  problem: "问题",
  practice: "做法",
  effect: "成效",
  insight: "观点 / 机制"
};

function inferThemes(question: Question): Theme[] {
  return inferQuestionThemes(question);
}

function bankItemsFromOutput(question: Question, output: MaterialDeepReadOutput): MaterialBankItem[] {
  const common = { sourceQuestionId: question.id, sourceQuestionTitle: question.title, note: "", createdAt: new Date().toISOString() };
  return [
    ...output.expressions.map(item => ({ ...common, id: crypto.randomUUID(), category: "expression" as const, title: item.phrase, content: item.meaning, themes: item.useCases, sourceEvidence: item.sourceEvidence })),
    ...output.mechanisms.map(item => ({ ...common, id: crypto.randomUUID(), category: "mechanism" as const, title: item.title, content: item.chain, themes: item.transferableTo, sourceEvidence: item.sourceEvidence })),
    ...output.cases.map(item => ({ ...common, id: crypto.randomUUID(), category: "case" as const, title: item.title, content: item.summary, themes: item.transferableTo, sourceEvidence: item.sourceEvidence })),
    ...output.essayAngles.map(item => ({ ...common, id: crypto.randomUUID(), category: "essay-angle" as const, title: item.claim, content: `${item.reasoning}\n\n段落用法：${item.paragraphUse}`, themes: item.transferableTo }))
  ];
}

function FilterRow({ label, children }: { label: string; children: ReactNode }) {
  return <div className="deep-filter-row"><span>{label}</span><div>{children}</div></div>;
}

function MarkedMaterial({ content, annotations }: { content: string; annotations: DeepReadAnnotation[] }) {
  const candidates = annotations
    .map((annotation, annotationIndex) => ({ annotation, annotationIndex, start: content.indexOf(annotation.quote) }))
    .filter(match => match.start >= 0)
    .sort((a, b) => a.start - b.start || b.annotation.quote.length - a.annotation.quote.length);
  const matches = candidates.filter((match, index) => index === 0 || match.start >= candidates[index - 1].start + candidates[index - 1].annotation.quote.length);

  if (!matches.length) return <>{content}</>;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.start > cursor) nodes.push(content.slice(cursor, match.start));
    nodes.push(<mark key={`${match.start}-${match.annotationIndex}`} className={`material-mark mark-${match.annotation.type}`} title={match.annotation.keyPoint}>
      {match.annotation.quote}<sup>{match.annotationIndex + 1}</sup>
    </mark>);
    cursor = match.start + match.annotation.quote.length;
  }
  if (cursor < content.length) nodes.push(content.slice(cursor));
  return <>{nodes}</>;
}

export default function MaterialBankPage({ questions, initialQuestionId }: { questions: Question[]; initialQuestionId?: string | null }) {
  const [materialMode, setMaterialMode] = useState<"past" | "daily">("past");
  const [view, setView] = useState<View>(initialQuestionId ? "reader" : "browse");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [typeFilter, setTypeFilter] = useState<"全部题型" | QuestionType>("全部题型");
  const [themeFilter, setThemeFilter] = useState<Theme>("全部主题");
  const [yearFilter, setYearFilter] = useState<number | "全部年份">("全部年份");
  const [selectedQuestionId, setSelectedQuestionId] = useState(initialQuestionId ?? questions[0]?.id ?? "");
  const [page, setPage] = useState(1);
  const [output, setOutput] = useState<MaterialDeepReadOutput | null>(null);
  const [completed, setCompleted] = useState<Map<string, MaterialDeepReadSnapshot>>(new Map());
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState("");

  const selectedQuestion = questions.find(question => question.id === selectedQuestionId) ?? null;
  const selectedSnapshot = selectedQuestion ? completed.get(selectedQuestion.id) : undefined;
  const needsAnnotationRefresh = !!output && !!selectedSnapshot && selectedSnapshot.version !== MATERIAL_LEARNING_VERSION;
  const matchedAnnotationCount = selectedQuestion && output
    ? output.annotations.filter(annotation => selectedQuestion.materials.some(material => material.content.includes(annotation.quote))).length
    : 0;
  const years = useMemo(() => [...new Set(questions.map(question => question.year))].sort((a, b) => b - a), [questions]);

  useEffect(() => {
    setPage(1);
  }, [deferredQuery, themeFilter, typeFilter, yearFilter]);

  useEffect(() => {
    let cancelled = false;
    void loadMaterialDeepReadSnapshots(questions)
      .then(snapshots => {
        if (cancelled) return;
        setCompleted(snapshots);
      })
      .catch(error => console.error("Failed to load completed deep reads.", error));
    return () => { cancelled = true; };
  }, [questions]);

  useEffect(() => {
    if (!initialQuestionId) return;
    setSelectedQuestionId(initialQuestionId);
    setView("reader");
  }, [initialQuestionId]);

  useEffect(() => {
    let cancelled = false;
    setRunError(null);
    setSavedMessage("");
    if (!selectedQuestion) { setOutput(null); return () => { cancelled = true; }; }
    const cached = completed.get(selectedQuestion.id);
    if (cached) setOutput(cached.result);
    else {
      setOutput(null);
      void loadMaterialDeepReadSnapshot(selectedQuestion).then(snapshot => {
        if (!cancelled && snapshot) setOutput(snapshot.result);
      }).catch(error => console.error("Failed to load AI deep-read snapshot.", error));
    }
    return () => { cancelled = true; };
  }, [completed, selectedQuestion]);

  const filteredQuestions = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    return questions.filter(question => {
      if (typeFilter !== "全部题型" && question.type !== typeFilter) return false;
      if (themeFilter !== "全部主题" && !inferThemes(question).includes(themeFilter)) return false;
      if (yearFilter !== "全部年份" && question.year !== yearFilter) return false;
      return !needle || `${question.title} ${question.tags.join(" ")} ${question.prompt}`.toLowerCase().includes(needle);
    });
  }, [questions, deferredQuery, themeFilter, typeFilter, yearFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredQuestions.length / DEEP_READ_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visibleQuestions = filteredQuestions.slice(
    (currentPage - 1) * DEEP_READ_PAGE_SIZE,
    currentPage * DEEP_READ_PAGE_SIZE
  );

  function openQuestion(question: Question) {
    setSelectedQuestionId(question.id);
    setOutput(completed.get(question.id)?.result ?? null);
    setRunError(null);
    setView("reader");
  }

  async function runDeepRead() {
    if (!selectedQuestion || running) return;
    setRunning(true);
    setRunError(null);
    setSavedMessage("");
    try {
      const result = await deepReadQuestion(selectedQuestion);
      setOutput(result);
      const snapshot = await saveMaterialDeepReadSnapshot(selectedQuestion, result);
      setCompleted(current => new Map(current).set(selectedQuestion.id, snapshot));
    } catch (error) {
      setRunError(errorMessage(error, "AI精读失败，请检查模型配置。"));
    } finally {
      setRunning(false);
    }
  }

  async function saveLearningItems() {
    if (!selectedQuestion || !output) return;
    const items = bankItemsFromOutput(selectedQuestion, output);
    await materialBankStore.addMany(items);
    setSavedMessage(`已收下 ${items.length} 条可迁移素材`);
  }

  const pageHeader = <header className="deep-page-header">
    <div>
      <p className="eyebrow">素材精读</p>
      <h1>{view === "reader" && selectedQuestion ? selectedQuestion.title : view === "archive" ? "已精读文章" : "从一个主题开始精读"}</h1>
      {view !== "reader" && <p>{view === "archive" ? "回到读过的材料，继续复习原文标注和作答方法。" : "按主题和题型找材料，不必先翻完整套试卷。"}</p>}
    </div>
    <button className="archive-button" onClick={() => setView(view === "archive" ? "browse" : "archive")}>
      {view === "archive" ? <><ArrowLeft size={17}/>返回选材</> : <><History size={17}/>已精读文章<span>{completed.size}</span></>}
    </button>
  </header>;

  if (materialMode === "daily") return <DailyMaterialPage onSwitchPast={() => setMaterialMode("past")}/>;

  const modeTabs = <nav className="material-mode-tabs" aria-label="素材精读类型">
    <button className="active">真题精读</button>
    <button onClick={() => setMaterialMode("daily")}>每日时事 <span>20 分钟</span></button>
  </nav>;

  if (view === "browse") return <main className="page page-wide material-bank-page">
    {modeTabs}
    {pageHeader}
    <section className="deep-filter-panel">
      <div className="deep-search"><Search size={18}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索主题、题目或关键词"/></div>
      <FilterRow label="题型">{QUESTION_TYPES.map(type => <button key={type} className={typeFilter === type ? "active" : ""} onClick={() => setTypeFilter(type)}>{type}</button>)}</FilterRow>
      <FilterRow label="主题">{THEMES.map(theme => <button key={theme} className={themeFilter === theme ? "active" : ""} onClick={() => setThemeFilter(theme)}>{theme}</button>)}</FilterRow>
      <FilterRow label="年份"><button className={yearFilter === "全部年份" ? "active" : ""} onClick={() => setYearFilter("全部年份")}>全部年份</button>{years.map(year => <button key={year} className={yearFilter === year ? "active" : ""} onClick={() => setYearFilter(year)}>{year}</button>)}</FilterRow>
    </section>
    <div className="deep-results-head"><div><strong>{themeFilter === "全部主题" ? "精选材料" : themeFilter}</strong><span>{filteredQuestions.length} 篇可选</span></div>{(themeFilter !== "全部主题" || typeFilter !== "全部题型" || yearFilter !== "全部年份") && <button onClick={() => { setThemeFilter("全部主题"); setTypeFilter("全部题型"); setYearFilter("全部年份"); }}>清除筛选</button>}</div>
    <section className="deep-title-grid">
      {visibleQuestions.map(question => <article className="deep-title-card" key={question.id}>
        <div className="deep-card-poster"><BookOpen size={25}/><span>{inferThemes(question)[0]}</span></div>
        <div className="deep-card-body">
          <div className="deep-card-meta"><span>{question.type}</span><span>{question.year}</span>{completed.has(question.id) && <em><Check size={12}/>已精读</em>}</div>
          <h2>{question.title}</h2>
          <p>{question.prompt}</p>
          <button onClick={() => openQuestion(question)}>{completed.has(question.id) ? "查看精读" : "选取这篇"}<ChevronRight size={16}/></button>
        </div>
      </article>)}
    </section>
    {filteredQuestions.length > DEEP_READ_PAGE_SIZE && <div className="deep-pagination"><span>第 {currentPage}/{totalPages} 页 · 每页 {DEEP_READ_PAGE_SIZE} 篇</span><div><button className="secondary" disabled={currentPage <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}>上一页</button><button className="secondary" disabled={currentPage >= totalPages} onClick={() => setPage(value => Math.min(totalPages, value + 1))}>下一页</button></div></div>}
    {!filteredQuestions.length && <div className="deep-no-results"><Search size={24}/><strong>没有匹配的材料</strong><span>换一个主题或清除筛选试试。</span></div>}
  </main>;

  if (view === "archive") {
    const archived = questions.filter(question => completed.has(question.id));
    return <main className="page page-wide material-bank-page">
      {modeTabs}
      {pageHeader}
      {archived.length ? <section className="archive-list">{archived.map(question => <button key={question.id} onClick={() => openQuestion(question)}>
        <span className="archive-date"><CalendarDays size={16}/>{new Date(completed.get(question.id)!.generatedAt).toLocaleDateString("zh-CN")}</span>
        <strong>{question.title}</strong><small>{inferThemes(question)[0]} · {question.type} · {question.year}</small><ChevronRight size={18}/>
      </button>)}</section> : <div className="deep-no-results"><History size={25}/><strong>还没有精读记录</strong><span>完成一次 AI 精读后，文章会自动保存在这里。</span></div>}
    </main>;
  }

  return <main className="page page-wide material-bank-page deep-reader-page">
    {modeTabs}
    <button className="reader-back" onClick={() => setView("browse")}><ArrowLeft size={16}/>重新选材</button>
    {pageHeader}
    {selectedQuestion ? <>
      <section className="reader-brief">
        <div className="reader-meta"><span>{inferThemes(selectedQuestion)[0]}</span><span>{selectedQuestion.type}</span><span>{selectedQuestion.year}</span><span>{selectedQuestion.score} 分 / {selectedQuestion.wordLimit} 字</span></div>
        <p>{selectedQuestion.prompt}</p>
        <button className="primary" disabled={running} onClick={() => void runDeepRead()}>{running ? <LoaderCircle className="spin" size={16}/> : <Sparkles size={16}/>} {running ? "正在精读…" : needsAnnotationRefresh ? "更新完整标注" : output ? "重新精读" : "开始 AI 精读"}</button>
      </section>
      {runError && <div className="deep-read-error">{runError}</div>}
      {needsAnnotationRefresh && <div className="annotation-upgrade"><Sparkles size={16}/><span>这篇文章使用的是旧版精读规则。点击“更新完整标注”，AI 会按长材料逐段复核并补齐得分证据。</span></div>}
      {!output && <div className="reader-awaiting">{running ? <LoaderCircle className="spin" size={28}/> : <Lightbulb size={28}/>}<strong>{running ? "正在阅读并标注原文" : "先读材料，再看答案"}</strong><span>{running ? "AI 正在定位原文证据、提炼要点并组织考场作答。" : "精读结果会直接呈现在原文上，不再拆成零散的小卡片。"}</span></div>}
      {output && <>
        <div className="annotation-legend"><strong>高亮为直接得分证据，未标注部分为背景、过渡或重复信息</strong>{(Object.keys(ANNOTATION_LABEL) as DeepReadAnnotationType[]).map(type => <span key={type}><i className={`legend-${type}`}/>{ANNOTATION_LABEL[type]}</span>)}</div>
        <section className="annotated-reading">
          <article className="source-paper">
            <div className="source-paper-title"><FileText size={18}/><strong>材料原文</strong><span>已定位 {matchedAnnotationCount} 处证据 · 悬停高亮查看要点</span></div>
            {selectedQuestion.materials.map(material => <section key={material.id} className="source-material"><h3>{material.label}</h3><p><MarkedMaterial content={material.content} annotations={output.annotations}/></p></section>)}
          </article>
          <aside className="key-point-rail"><div className="key-point-heading"><Target size={18}/><strong>提炼要点</strong><span>{output.annotations.length}</span></div>
            <ol>{output.annotations.map((annotation, index) => <li key={`${annotation.quote}-${index}`} className={`point-${annotation.type}`}><span>{index + 1}</span><div><small>{ANNOTATION_LABEL[annotation.type]}</small><p>{annotation.keyPoint}</p></div></li>)}</ol>
          </aside>
        </section>
        <section className="answer-workbench">
          <article className="standard-answer"><div className="section-kicker"><FileText size={17}/><span>{selectedQuestion.type === "文章写作" ? "参考立意与示范论证" : "标准答案"}</span></div><p>{output.referenceAnswer}</p></article>
          <aside className="exam-approach"><div className="section-kicker"><Lightbulb size={17}/><span>考场做题思路</span></div><ol>{output.examApproach.map((step, index) => <li key={step}><span>{index + 1}</span><p>{step}</p></li>)}</ol></aside>
        </section>
        <details className="transferable-drawer"><summary><span><Sparkles size={16}/>本题可迁移表达</span><em>{output.expressions.length + output.mechanisms.length + output.cases.length + output.essayAngles.length} 条</em><ChevronRight size={17}/></summary>
          <div className="transferable-content">
            {output.expressions.map(item => <p key={item.phrase}><strong>{item.phrase}</strong><span>{item.meaning}</span></p>)}
            {output.mechanisms.map(item => <p key={item.title}><strong>{item.title}</strong><span>{item.chain}</span></p>)}
            {output.essayAngles.map(item => <p key={item.claim}><strong>{item.claim}</strong><span>{item.reasoning}</span></p>)}
          </div>
        </details>
        <div className="reader-save"><button className="secondary" onClick={() => void saveLearningItems()}><BookmarkPlus size={16}/>收藏本页可迁移素材</button>{savedMessage && <span><Check size={14}/>{savedMessage}</span>}</div>
      </>}
    </> : <div className="deep-no-results">当前没有可精读材料。</div>}
  </main>;
}
