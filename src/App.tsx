import { useEffect, useMemo, useState } from "react";
import { BookOpenText, Check, ChevronRight, CircleAlert, Clock3, FileText, History, Home, LibraryBig, PanelRightClose, PanelRightOpen, PenLine, RotateCcw, Search, Settings, Sparkles, Target, TimerReset } from "lucide-react";
import { buildMockReview, questions } from "./mockData";
import { persistence } from "./storage";
import type { AppView, MockReview, Question, TrainingRecord } from "./types";

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

function Today({ onStart, history }: { onStart: (question: Question) => void; history: TrainingRecord[] }) {
  const q = questions[0];
  return <main className="page page-wide">
    <header className="page-header"><div><p className="eyebrow">2026 · 训练工作台</p><h1>今天做一道，重点练“要点落地”</h1><p>先独立作答，再看结构化反馈。批改不会在作答阶段干扰你的判断。</p></div><div className="streak"><Target size={20}/><div><strong>连续 4 天</strong><span>保持训练节奏</span></div></div></header>
    <section className="hero-card"><div className="hero-top"><Badge tone="green">今日推荐</Badge><span>预计 18–25 分钟</span></div><h2>{q.title}</h2><p>{q.prompt}</p><div className="meta-row"><span><FileText size={16}/>{q.type}</span><span><TimerReset size={16}/>{q.wordLimit} 字</span><span><Target size={16}/>{q.score} 分</span></div><button className="primary large" onClick={() => onStart(q)}>开始作答 <ChevronRight size={18}/></button></section>
    <section className="dashboard-grid"><article className="metric-card"><span>本周完成</span><strong>{history.length || 3}</strong><small>目标 5 题</small></article><article className="metric-card"><span>平均得分率</span><strong>{history.length ? Math.round(history.reduce((s, r) => s + r.score / r.maxScore, 0) / history.length * 100) : 76}%</strong><small>近 7 次训练</small></article><article className="metric-card"><span>当前弱项</span><strong className="metric-text">具体化表达</strong><small>概括不能替代材料动作</small></article></section>
  </main>;
}

function Library({ onStart }: { onStart: (question: Question) => void }) {
  const [query, setQuery] = useState("");
  const filtered = questions.filter(q => `${q.title}${q.type}${q.tags.join("")}`.includes(query.trim()));
  return <main className="page page-wide"><header className="page-header compact"><div><p className="eyebrow">题库</p><h1>按能力点选题，而不是随机刷题</h1><p>V0.1 使用内置样题；后续再接真题导入和标签体系。</p></div></header><div className="toolbar"><div className="search-box"><Search size={17}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索题目、题型或标签"/></div><Badge>{filtered.length} 题</Badge></div><div className="question-grid">{filtered.map(q => <article className="question-card" key={q.id}><div className="question-top"><Badge tone={q.difficulty === "挑战" ? "amber" : "neutral"}>{q.difficulty}</Badge><span>{q.year} · {q.region}</span></div><h3>{q.title}</h3><p>{q.prompt}</p><div className="tag-row">{q.tags.map(tag => <span key={tag}>#{tag}</span>)}</div><footer><span>{q.type} · {q.score} 分 · {q.wordLimit} 字</span><button onClick={() => onStart(q)}>开始训练 <ChevronRight size={16}/></button></footer></article>)}</div></main>;
}

function BeforeReview({ question }: { question: Question }) {
  return <div className="before-review"><div className="review-icon"><Sparkles size={22}/></div><h3>批改面板</h3><p>提交前不展示要点，避免提示效应。提交后这里会显示结构化反馈。</p><div className="review-rule"><Check size={16}/><span>要点覆盖</span></div><div className="review-rule"><Check size={16}/><span>要素分类</span></div><div className="review-rule"><Check size={16}/><span>表达与冗余</span></div><small>当前为 V0.1 模拟评分，尚未接入真实 AI 评分引擎。</small><div className="question-facts"><span>题型</span><strong>{question.type}</strong><span>字数</span><strong>≤ {question.wordLimit}</strong></div></div>;
}

function ReviewPanel({ review }: { review: MockReview }) {
  return <div className="review-content"><div className="score-panel"><span>本次得分</span><strong>{review.score}<small> / {review.maxScore}</small></strong><p>{review.summary}</p></div><div className="review-metrics"><div><span>要点覆盖</span><strong>{review.coverage}</strong></div><div><span>分类</span><strong>{review.classification}</strong></div><div><span>表达</span><strong>{review.expression}</strong></div><div><span>冗余</span><strong>{review.redundancy}</strong></div></div><div className="point-list"><h4>逐点核对</h4>{review.points.map(point => <article key={point.title} className={`point point-${point.status}`}><div className="point-heading">{point.status === "hit" ? <Check size={16}/> : <CircleAlert size={16}/>}<strong>{point.title}</strong><Badge tone={point.status === "hit" ? "green" : "amber"}>{point.status === "hit" ? "已覆盖" : point.status === "partial" ? "部分覆盖" : "遗漏"}</Badge></div><p><b>材料依据：</b>{point.evidence}</p>{point.suggestion && <p className="suggestion"><b>修改：</b>{point.suggestion}</p>}</article>)}</div></div>;
}

function Practice({ question, onExit, onSubmitted }: { question: Question; onExit: () => void; onSubmitted: (record: TrainingRecord) => void }) {
  const [answer, setAnswer] = useState(() => persistence.getDraft(question.id)?.answer ?? "");
  const [review, setReview] = useState<MockReview | null>(null);
  const [rightOpen, setRightOpen] = useState(true);
  const chars = answer.replace(/\s/g, "").length;
  useEffect(() => { const timer = window.setTimeout(() => persistence.saveDraft({ questionId: question.id, answer, updatedAt: new Date().toISOString() }), 350); return () => window.clearTimeout(timer); }, [answer, question.id]);
  function submit() { const result = buildMockReview(question, answer); setReview(result); const record: TrainingRecord = { id: crypto.randomUUID(), questionId: question.id, title: question.title, score: result.score, maxScore: result.maxScore, submittedAt: new Date().toLocaleString("zh-CN"), answer }; persistence.addHistory(record); onSubmitted(record); }
  return <div className="practice-shell"><header className="practice-header"><button className="text-button" onClick={onExit}>← 返回题库</button><div><strong>{question.title}</strong><span>{question.type} · {question.score} 分</span></div><button className="icon-button" onClick={() => setRightOpen(v => !v)}>{rightOpen ? <PanelRightClose size={19}/> : <PanelRightOpen size={19}/>}</button></header><div className={rightOpen ? "practice-grid" : "practice-grid right-hidden"}><section className="materials-pane"><div className="pane-title"><BookOpenText size={18}/><strong>给定资料</strong><span>{question.materials.length} 则</span></div><div className="material-scroll">{question.materials.map(block => <article className="material" key={block.id}><span>{block.label}</span><p>{block.content}</p></article>)}</div></section><section className="answer-pane"><div className="prompt-box"><span>作答任务</span><p>{question.prompt}</p></div><textarea value={answer} onChange={e => setAnswer(e.target.value)} placeholder="在这里独立作答。草稿会自动保存在本机……"/><div className="answer-footer"><span className={chars > question.wordLimit ? "over-limit" : ""}>{chars} / {question.wordLimit} 字</span><span>已自动保存</span><button className="primary" disabled={chars < 10} onClick={submit}><Sparkles size={16}/>提交批改</button></div></section>{rightOpen && <aside className="review-pane">{review ? <ReviewPanel review={review}/> : <BeforeReview question={question}/>}</aside>}</div></div>;
}

function HistoryPage({ records }: { records: TrainingRecord[] }) {
  return <main className="page page-wide"><header className="page-header compact"><div><p className="eyebrow">训练记录</p><h1>所有作答都留下证据</h1><p>后续能力画像、错题复盘和自适应推荐都从这里产生。</p></div></header><div className="history-table"><div className="history-row header"><span>题目</span><span>得分</span><span>时间</span></div>{records.length ? records.map(r => <div className="history-row" key={r.id}><span><strong>{r.title}</strong><small>{r.answer.slice(0, 50)}{r.answer.length > 50 ? "…" : ""}</small></span><span className="history-score">{r.score}/{r.maxScore}</span><span>{r.submittedAt}</span></div>) : <div className="empty-state"><History size={24}/><strong>还没有正式训练记录</strong><span>完成一次答题后会自动出现在这里。</span></div>}</div></main>;
}

function Placeholder({ kind }: { kind: "review" | "settings" }) { const title = kind === "review" ? "错题复盘将在下一迭代接通" : "设置页暂时保持最小"; const body = kind === "review" ? "先把每次训练记录完整，再基于遗漏要点和错误标签生成复盘队列。" : "后续在这里配置模型提供商、API、数据目录以及批改严格度。"; return <main className="page centered"><div className="placeholder"><Clock3 size={30}/><h2>{title}</h2><p>{body}</p><Badge>V0.2</Badge></div></main>; }

export default function App() {
  const [view, setView] = useState<AppView>("today");
  const [activeQuestion, setActiveQuestion] = useState<Question>(questions[0]);
  const [history, setHistory] = useState<TrainingRecord[]>(() => persistence.listHistory());
  function start(question: Question) { setActiveQuestion(question); setView("practice"); }
  const content = useMemo(() => {
    if (view === "today") return <Today onStart={start} history={history}/>;
    if (view === "library") return <Library onStart={start}/>;
    if (view === "practice") return <Practice question={activeQuestion} onExit={() => setView("library")} onSubmitted={r => setHistory(current => [r, ...current])}/>;
    if (view === "history") return <HistoryPage records={history}/>;
    if (view === "review") return <Placeholder kind="review"/>;
    return <Placeholder kind="settings"/>;
  }, [view, activeQuestion, history]);
  if (view === "practice") return content;
  return <div className="app-shell"><Sidebar view={view} onChange={setView}/>{content}</div>;
}
