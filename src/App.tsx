import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { ArrowLeft, BookOpenText, Check, ChevronRight, CircleAlert, Clock3, FilePlus2, FileText, History, Home, LibraryBig, PanelRightClose, PanelRightOpen, PenLine, Plus, RotateCcw, Search, Settings, Sparkles, Target, TimerReset } from "lucide-react";
import { gradingService } from "./grading";
import { buildMockReview, questions as builtinQuestions } from "./mockData";
import { persistence } from "./storage";
import type { AppView, Difficulty, LocalQuestionInput, MockReview, Question, QuestionType, TrainingRecord } from "./types";

const navItems = [
  { id: "today" as const, label: "今日训练", icon: Home },
  { id: "library" as const, label: "题库", icon: LibraryBig },
  { id: "review" as const, label: "错题复盘", icon: RotateCcw },
  { id: "history" as const, label: "训练记录", icon: History },
  { id: "settings" as const, label: "设置", icon: Settings }
];

function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "green" | "amber" }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

function Sidebar({ view, onChange }: { view: AppView; onChange: (view: AppView) => void }) {
  return <aside className="sidebar">
    <div className="brand"><div className="brand-mark"><PenLine size={19} /></div><div><strong>申论训练助手</strong><span>Shenlun Trainer</span></div></div>
    <nav>{navItems.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? "nav-item active" : "nav-item"} onClick={() => onChange(id)}><Icon size={18}/><span>{label}</span></button>)}</nav>
    <div className="sidebar-footer"><div className="mini-progress"><span>本周训练</span><strong>3 / 5</strong></div><div className="progress-track"><i style={{ width: "60%" }}/></div><small>先保持稳定输出，再追求高分。</small></div>
  </aside>;
}

function mergeUniqueById<T extends { id: string }>(current: T[], loaded: T[]): T[] {
  const seen = new Set<string>();
  return [...current, ...loaded].filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function getRecordReview(record: TrainingRecord, allQuestions: Question[]): MockReview | null {
  if (record.review) return record.review;
  const question = allQuestions.find(item => item.id === record.questionId);
  return question ? buildMockReview(question, record.answer) : null;
}

function Today({ onStart, history, allQuestions }: { onStart: (question: Question) => void; history: TrainingRecord[]; allQuestions: Question[] }) {
  const q = allQuestions[0];
  const average = history.length ? Math.round(history.reduce((sum, item) => sum + item.score / item.maxScore, 0) / history.length * 100) : 76;
  return <main className="page page-wide">
    <header className="page-header"><div><p className="eyebrow">2026 · 训练工作台</p><h1>今天做一道，重点练“要点落地”</h1><p>先独立作答，再看结构化反馈。批改不会在作答阶段干扰你的判断。</p></div><div className="streak"><Target size={20}/><div><strong>连续 4 天</strong><span>保持训练节奏</span></div></div></header>
    <section className="hero-card"><div className="hero-top"><Badge tone="green">今日推荐</Badge><span>预计 18–25 分钟</span></div><h2>{q.title}</h2><p>{q.prompt}</p><div className="meta-row"><span><FileText size={16}/>{q.type}</span><span><TimerReset size={16}/>{q.wordLimit} 字</span><span><Target size={16}/>{q.score} 分</span></div><button className="primary large" onClick={() => onStart(q)}>开始作答 <ChevronRight size={18}/></button></section>
    <section className="dashboard-grid"><article className="metric-card"><span>已完成训练</span><strong>{history.length}</strong><small>本机留存的作答记录</small></article><article className="metric-card"><span>平均得分率</span><strong>{average}%</strong><small>按当前记录计算</small></article><article className="metric-card"><span>当前阶段</span><strong className="metric-text">形成稳定闭环</strong><small>题目 → 作答 → 批改 → 复盘</small></article></section>
  </main>;
}

function Library({ allQuestions, onStart, onImport }: { allQuestions: Question[]; onStart: (question: Question) => void; onImport: () => void }) {
  const [query, setQuery] = useState("");
  const filtered = allQuestions.filter(q => `${q.title}${q.type}${q.tags.join("")}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <main className="page page-wide"><header className="page-header compact"><div><p className="eyebrow">题库</p><h1>按能力点选题，而不是随机刷题</h1><p>内置样题与本地导入题统一进入训练工作台。</p></div><button className="primary" onClick={onImport}><Plus size={16}/>导入题目</button></header><div className="toolbar"><div className="search-box"><Search size={17}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索题目、题型或标签"/></div><Badge>{filtered.length} 题</Badge></div><div className="question-grid">{filtered.map(q => <article className="question-card" key={q.id}><div className="question-top"><Badge tone={q.difficulty === "挑战" ? "amber" : "neutral"}>{q.difficulty}</Badge><span>{q.source === "local" ? "本地导入" : `${q.year} · ${q.region}`}</span></div><h3>{q.title}</h3><p>{q.prompt}</p><div className="tag-row">{q.tags.map(tag => <span key={tag}>#{tag}</span>)}</div><footer><span>{q.type} · {q.score} 分 · {q.wordLimit} 字</span><button onClick={() => onStart(q)}>开始训练 <ChevronRight size={16}/></button></footer></article>)}</div></main>;
}

function ImportQuestion({ onCancel, onSaved }: { onCancel: () => void; onSaved: (question: Question) => void }) {
  const [title, setTitle] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [region, setRegion] = useState("本地导入");
  const [type, setType] = useState<QuestionType>("概括归纳");
  const [difficulty, setDifficulty] = useState<Difficulty>("进阶");
  const [score, setScore] = useState(20);
  const [wordLimit, setWordLimit] = useState(300);
  const [prompt, setPrompt] = useState("");
  const [materialText, setMaterialText] = useState("");
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || !prompt.trim() || !materialText.trim() || saving) return;
    const input: LocalQuestionInput = { title, year, region, type, difficulty, score, wordLimit, prompt, materialText, tags: tags.split(/[，,]/).map(item => item.trim()).filter(Boolean) };
    setSaving(true);
    try {
      const question = await persistence.addImportedQuestion(input);
      onSaved(question);
    } catch (error) {
      console.error("Failed to save imported question.", error);
      setSaving(false);
    }
  }

  return <main className="page page-wide import-page"><header className="page-header compact"><div><p className="eyebrow">本地题库</p><h1>导入一道申论题</h1><p>先支持手工粘贴。材料之间空一行会自动拆成“材料 1、材料 2……”</p></div><button className="secondary" onClick={onCancel}><ArrowLeft size={16}/>返回题库</button></header><form className="import-form" onSubmit={submit}><section className="form-card"><h3>题目信息</h3><label className="field field-wide"><span>题目名称</span><input value={title} onChange={e => setTitle(e.target.value)} placeholder="例如：概括某地基层治理的主要做法" required/></label><div className="form-grid"><label className="field"><span>题型</span><select value={type} onChange={e => setType(e.target.value as QuestionType)}>{["概括归纳","提出对策","综合分析","贯彻执行","文章写作"].map(item => <option key={item}>{item}</option>)}</select></label><label className="field"><span>难度</span><select value={difficulty} onChange={e => setDifficulty(e.target.value as Difficulty)}>{["基础","进阶","挑战"].map(item => <option key={item}>{item}</option>)}</select></label><label className="field"><span>分值</span><input type="number" min="1" max="100" value={score} onChange={e => setScore(Number(e.target.value))}/></label><label className="field"><span>字数上限</span><input type="number" min="50" max="2000" value={wordLimit} onChange={e => setWordLimit(Number(e.target.value))}/></label><label className="field"><span>年份</span><input type="number" min="2000" max="2100" value={year} onChange={e => setYear(Number(e.target.value))}/></label><label className="field"><span>来源/地区</span><input value={region} onChange={e => setRegion(e.target.value)}/></label></div><label className="field field-wide"><span>标签（逗号分隔）</span><input value={tags} onChange={e => setTags(e.target.value)} placeholder="基层治理，概括做法，要点分类"/></label></section><section className="form-card"><h3>题干与材料</h3><label className="field field-wide"><span>作答要求</span><textarea className="form-textarea prompt-input" value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="粘贴题干与作答要求" required/></label><label className="field field-wide"><span>给定资料</span><textarea className="form-textarea material-input" value={materialText} onChange={e => setMaterialText(e.target.value)} placeholder="粘贴材料。不同材料之间空一行。" required/></label><div className="import-note"><CircleAlert size={16}/><span>本地导入题目前没有人工标准要点，因此只提供通用模拟反馈；真实 AI 评分引擎接入后再做材料级要点识别。</span></div></section><footer className="form-actions"><button type="button" className="secondary" onClick={onCancel}>取消</button><button className="primary" type="submit" disabled={saving}><FilePlus2 size={16}/>{saving ? "保存中…" : "保存并开始作答"}</button></footer></form></main>;
}

function BeforeReview({ question }: { question: Question }) {
  return <div className="before-review"><div className="review-icon"><Sparkles size={22}/></div><h3>批改面板</h3><p>提交前不展示要点，避免提示效应。提交后这里会显示结构化反馈。</p><div className="review-rule"><Check size={16}/><span>要点覆盖</span></div><div className="review-rule"><Check size={16}/><span>要素分类</span></div><div className="review-rule"><Check size={16}/><span>表达与冗余</span></div><small>当前为 V0.1 模拟评分，尚未接入真实 AI 评分引擎。</small><div className="question-facts"><span>题型</span><strong>{question.type}</strong><span>字数</span><strong>≤ {question.wordLimit}</strong></div></div>;
}

function ReviewPanel({ review }: { review: MockReview }) {
  return <div className="review-content"><div className="score-panel"><span>本次得分</span><strong>{review.score}<small> / {review.maxScore}</small></strong><p>{review.summary}</p></div><div className="review-metrics"><div><span>要点覆盖</span><strong>{review.coverage}</strong></div><div><span>分类</span><strong>{review.classification}</strong></div><div><span>表达</span><strong>{review.expression}</strong></div><div><span>冗余</span><strong>{review.redundancy}</strong></div></div><div className="point-list"><h4>逐点核对</h4>{review.points.map(point => <article key={point.title} className={`point point-${point.status}`}><div className="point-heading">{point.status === "hit" ? <Check size={16}/> : <CircleAlert size={16}/>}<strong>{point.title}</strong><Badge tone={point.status === "hit" ? "green" : "amber"}>{point.status === "hit" ? "已覆盖" : point.status === "partial" ? "部分覆盖" : "遗漏"}</Badge></div><p><b>材料依据：</b>{point.evidence}</p>{point.suggestion && <p className="suggestion"><b>修改：</b>{point.suggestion}</p>}</article>)}</div></div>;
}

function Practice({ question, onExit, onSubmitted }: { question: Question; onExit: () => void; onSubmitted: (record: TrainingRecord) => void }) {
  const [answer, setAnswer] = useState("");
  const [review, setReview] = useState<MockReview | null>(null);
  const [rightOpen, setRightOpen] = useState(true);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const chars = answer.replace(/\s/g, "").length;

  useEffect(() => {
    let cancelled = false;
    setDraftLoaded(false);
    setAnswer("");
    setReview(null);
    setSubmitting(false);
    setSubmitError(null);
    persistence.getDraft(question.id)
      .then(draft => {
        if (cancelled) return;
        setAnswer(draft?.answer ?? "");
        setDraftLoaded(true);
      })
      .catch(error => {
        console.error("Failed to load draft.", error);
        if (!cancelled) setDraftLoaded(true);
      });
    return () => { cancelled = true; };
  }, [question.id]);

  useEffect(() => {
    if (!draftLoaded) return;
    const timer = window.setTimeout(() => {
      void persistence.saveDraft({ questionId: question.id, answer, updatedAt: new Date().toISOString() })
        .catch(error => console.error("Failed to save draft.", error));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [answer, draftLoaded, question.id]);

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await gradingService.grade({ question, answer });
      setReview(result);
      const now = new Date();
      const record: TrainingRecord = { id: crypto.randomUUID(), questionId: question.id, title: question.title, score: result.score, maxScore: result.maxScore, submittedAt: now.toLocaleString("zh-CN"), submittedAtIso: now.toISOString(), answer, review: result };
      await persistence.addHistory(record);
      onSubmitted(record);
    } catch (error) {
      console.error("Failed to grade or save training record.", error);
      setSubmitError("批改未完成，请重试");
    } finally {
      setSubmitting(false);
    }
  }

  const persistenceStatus = submitError ?? (draftLoaded ? "已自动保存" : "正在读取草稿…");
  return <div className="practice-shell"><header className="practice-header"><button className="text-button" onClick={onExit}>← 返回题库</button><div><strong>{question.title}</strong><span>{question.type} · {question.score} 分</span></div><button className="icon-button" onClick={() => setRightOpen(v => !v)}>{rightOpen ? <PanelRightClose size={19}/> : <PanelRightOpen size={19}/>}</button></header><div className={rightOpen ? "practice-grid" : "practice-grid right-hidden"}><section className="materials-pane"><div className="pane-title"><BookOpenText size={18}/><strong>给定资料</strong><span>{question.materials.length} 则</span></div><div className="material-scroll">{question.materials.map(block => <article className="material" key={block.id}><span>{block.label}</span><p>{block.content}</p></article>)}</div></section><section className="answer-pane"><div className="prompt-box"><span>作答任务</span><p>{question.prompt}</p></div><textarea value={answer} onChange={e => setAnswer(e.target.value)} placeholder="在这里独立作答。草稿会自动保存在本机……"/><div className="answer-footer"><span className={chars > question.wordLimit ? "over-limit" : ""}>{chars} / {question.wordLimit} 字</span><span className={submitError ? "over-limit" : ""}>{persistenceStatus}</span><button className="primary" disabled={chars < 10 || !draftLoaded || submitting} onClick={submit}><Sparkles size={16}/>{submitting ? "批改中…" : "提交批改"}</button></div></section>{rightOpen && <aside className="review-pane">{review ? <ReviewPanel review={review}/> : <BeforeReview question={question}/>}</aside>}</div></div>;
}

function HistoryPage({ records, onOpen }: { records: TrainingRecord[]; onOpen: (record: TrainingRecord) => void }) {
  return <main className="page page-wide"><header className="page-header compact"><div><p className="eyebrow">训练记录</p><h1>每次作答都留下可追溯证据</h1><p>答案、当次得分和批改快照一起保存。</p></div></header><div className="history-table"><div className="history-row header"><span>题目</span><span>得分</span><span>时间</span><span></span></div>{records.length ? records.map(r => <button className="history-row history-button" key={r.id} onClick={() => onOpen(r)}><span><strong>{r.title}</strong><small>{r.answer.slice(0, 50)}{r.answer.length > 50 ? "…" : ""}</small></span><span className="history-score">{r.score}/{r.maxScore}</span><span>{r.submittedAt}</span><ChevronRight size={16}/></button>) : <div className="empty-state"><History size={24}/><strong>还没有训练记录</strong><span>完成一次答题后会自动出现在这里。</span></div>}</div></main>;
}

function ReviewQueue({ records, allQuestions, onOpen }: { records: TrainingRecord[]; allQuestions: Question[]; onOpen: (record: TrainingRecord) => void }) {
  const queue = records.map(record => ({ record, review: getRecordReview(record, allQuestions) })).map(item => ({ ...item, weak: item.review?.points.filter(point => point.status !== "hit") ?? [] })).filter(item => item.weak.length > 0);
  return <main className="page page-wide"><header className="page-header compact"><div><p className="eyebrow">错题复盘</p><h1>按“漏了什么”组织复盘</h1><p>不是简单收藏错题，而是把每次批改中未覆盖的要点变成下一轮训练线索。</p></div><Badge tone={queue.length ? "amber" : "green"}>{queue.length} 组待复盘</Badge></header>{queue.length ? <div className="review-queue">{queue.map(({ record, weak }) => <article className="review-card" key={record.id}><div className="review-card-top"><div><span>{record.submittedAt}</span><h3>{record.title}</h3></div><strong>{record.score}/{record.maxScore}</strong></div><div className="weak-list">{weak.map(point => <div key={point.title}><CircleAlert size={15}/><span><strong>{point.title}</strong><small>{point.suggestion ?? point.evidence}</small></span></div>)}</div><button className="secondary" onClick={() => onOpen(record)}>查看完整复盘 <ChevronRight size={15}/></button></article>)}</div> : <div className="empty-state standalone"><Check size={28}/><strong>当前没有待复盘要点</strong><span>新提交的训练会自动根据批改快照进入这里。</span></div>}</main>;
}

function RecordDetail({ record, allQuestions, onBack, onRetry }: { record: TrainingRecord; allQuestions: Question[]; onBack: () => void; onRetry: (question: Question) => void }) {
  const review = getRecordReview(record, allQuestions);
  const question = allQuestions.find(item => item.id === record.questionId);
  return <main className="page page-wide"><header className="detail-header"><button className="secondary" onClick={onBack}><ArrowLeft size={16}/>返回</button><div><p className="eyebrow">训练复盘</p><h1>{record.title}</h1><p>{record.submittedAt} · 得分 {record.score}/{record.maxScore}</p></div>{question ? <button className="primary" onClick={() => onRetry(question)}>重新作答</button> : <span/>}</header><div className="detail-grid"><section className="answer-snapshot"><span>你的答案</span><p>{record.answer}</p></section><aside className="detail-review">{review ? <ReviewPanel review={review}/> : <div className="empty-state"><CircleAlert size={24}/><strong>这条旧记录没有批改快照</strong><span>对应题目也已不存在，无法重建模拟反馈。</span></div>}</aside></div></main>;
}

function SettingsPage() {
  return <main className="page centered"><div className="placeholder"><Settings size={30}/><h2>设置页将在评分引擎接入时启用</h2><p>届时在这里配置模型提供商、API、数据目录、批改严格度和隐私选项。当前不提前堆无效设置。</p><Badge>V0.2</Badge></div></main>;
}

export default function App() {
  const [view, setView] = useState<AppView>("today");
  const [importedQuestions, setImportedQuestions] = useState<Question[]>([]);
  const allQuestions = useMemo(() => [...builtinQuestions, ...importedQuestions], [importedQuestions]);
  const [activeQuestion, setActiveQuestion] = useState<Question>(builtinQuestions[0]);
  const [history, setHistory] = useState<TrainingRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<TrainingRecord | null>(null);
  const [returnView, setReturnView] = useState<AppView>("history");

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      try {
        await persistence.initialize();
        const [questions, records] = await Promise.all([
          persistence.listImportedQuestions(),
          persistence.listHistory()
        ]);
        if (cancelled) return;
        setImportedQuestions(current => mergeUniqueById(current, questions));
        setHistory(current => mergeUniqueById(current, records));
      } catch (error) {
        console.error("Failed to initialize persistence.", error);
      }
    }
    void hydrate();
    return () => { cancelled = true; };
  }, []);

  function start(question: Question) { setActiveQuestion(question); setView("practice"); }
  function openRecord(record: TrainingRecord, from: AppView) { setSelectedRecord(record); setReturnView(from); setView("record"); }
  function saveImported(question: Question) { setImportedQuestions(current => mergeUniqueById([question], current)); start(question); }

  if (view === "practice") return <Practice question={activeQuestion} onExit={() => setView("library")} onSubmitted={record => setHistory(current => mergeUniqueById([record], current))}/>;

  let content: React.ReactNode;
  if (view === "today") content = <Today onStart={start} history={history} allQuestions={allQuestions}/>;
  else if (view === "library") content = <Library allQuestions={allQuestions} onStart={start} onImport={() => setView("import")}/>;
  else if (view === "import") content = <ImportQuestion onCancel={() => setView("library")} onSaved={saveImported}/>;
  else if (view === "review") content = <ReviewQueue records={history} allQuestions={allQuestions} onOpen={record => openRecord(record, "review")}/>;
  else if (view === "history") content = <HistoryPage records={history} onOpen={record => openRecord(record, "history")}/>;
  else if (view === "record" && selectedRecord) content = <RecordDetail record={selectedRecord} allQuestions={allQuestions} onBack={() => setView(returnView)} onRetry={start}/>;
  else content = <SettingsPage/>;

  return <div className="app-shell"><Sidebar view={view} onChange={setView}/>{content}</div>;
}
