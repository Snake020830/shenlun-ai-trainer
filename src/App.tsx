import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { ArrowLeft, Check, ChevronRight, CircleAlert, FilePlus2, FileText, History, Home, LibraryBig, PenLine, RotateCcw, Settings, Sparkles, Target, TimerReset } from "lucide-react";
import { parseMaterialText, serializeMaterialTextForPersistence } from "./materialParser";
import { buildMockReview, questions as builtinQuestions } from "./mockData";
import PracticeWorkspace from "./PracticeWorkspace";
import ProviderSettingsPage from "./ProviderSettingsPage";
import QuestionLibraryPage from "./QuestionLibraryPage";
import ReferenceCrossCheckPanel from "./ReferenceCrossCheckPanel";
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
  const [referenceAnswerContent, setReferenceAnswerContent] = useState("");
  const [referenceAnswerSource, setReferenceAnswerSource] = useState("");
  const [saving, setSaving] = useState(false);
  const parsedMaterials = useMemo(() => parseMaterialText(materialText), [materialText]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || !prompt.trim() || !materialText.trim() || saving) return;
    const input: LocalQuestionInput = {
      title,
      year,
      region,
      type,
      difficulty,
      score,
      wordLimit,
      prompt,
      materialText: serializeMaterialTextForPersistence(materialText),
      materials: parsedMaterials.map(material => ({ label: material.label, content: material.content })),
      tags: tags.split(/[，,]/).map(item => item.trim()).filter(Boolean),
      referenceAnswerContent,
      referenceAnswerSource
    };
    setSaving(true);
    try {
      const question = await persistence.addImportedQuestion(input);
      onSaved(question);
    } catch (error) {
      console.error("Failed to save imported question.", error);
      setSaving(false);
    }
  }

  return <main className="page page-wide import-page"><header className="page-header compact"><div><p className="eyebrow">本地题库</p><h1>导入一道申论题</h1><p>支持完整真题粘贴。优先按“材料一 / 材料1 / 给定资料1”等显式标题识别材料，材料内部空行不会被当成新材料。</p></div><button className="secondary" onClick={onCancel}><ArrowLeft size={16}/>返回题库</button></header><form className="import-form" onSubmit={submit}><section className="form-card"><h3>题目信息</h3><label className="field field-wide"><span>题目名称</span><input value={title} onChange={e => setTitle(e.target.value)} placeholder="例如：概括某地基层治理的主要做法" required/></label><div className="form-grid"><label className="field"><span>题型</span><select value={type} onChange={e => setType(e.target.value as QuestionType)}>{["概括归纳","提出对策","综合分析","贯彻执行","文章写作"].map(item => <option key={item}>{item}</option>)}</select></label><label className="field"><span>难度</span><select value={difficulty} onChange={e => setDifficulty(e.target.value as Difficulty)}>{["基础","进阶","挑战"].map(item => <option key={item}>{item}</option>)}</select></label><label className="field"><span>分值</span><input type="number" min="1" max="100" value={score} onChange={e => setScore(Number(e.target.value))}/></label><label className="field"><span>字数上限</span><input type="number" min="50" max="2000" value={wordLimit} onChange={e => setWordLimit(Number(e.target.value))}/></label><label className="field"><span>年份</span><input type="number" min="2000" max="2100" value={year} onChange={e => setYear(Number(e.target.value))}/></label><label className="field"><span>来源/地区</span><input value={region} onChange={e => setRegion(e.target.value)}/></label></div><label className="field field-wide"><span>标签（逗号分隔）</span><input value={tags} onChange={e => setTags(e.target.value)} placeholder="基层治理，概括做法，要点分类"/></label></section><section className="form-card"><h3>题干与材料</h3><label className="field field-wide"><span>作答要求</span><textarea className="form-textarea prompt-input" value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="粘贴题干与作答要求" required/></label><label className="field field-wide"><span>给定资料</span><textarea className="form-textarea material-input" value={materialText} onChange={e => setMaterialText(e.target.value)} placeholder="建议保留原题中的“材料一 / 材料二 / 给定资料1”等标题；每则材料内部可以正常保留多个自然段。" required/></label><div className="import-note"><CircleAlert size={16}/><span>{materialText.trim() ? `当前识别为 ${parsedMaterials.length} 则材料。` : "粘贴材料后会显示识别结果。"} 未检测到显式材料标题时，整段按一则材料保存，避免误拆。真实 AI 评分仍从完整材料盲抽要点。</span></div></section><section className="form-card"><h3>老师 / 机构参考答案（可选）</h3><label className="field field-wide"><span>来源</span><input value={referenceAnswerSource} onChange={e => setReferenceAnswerSource(e.target.value)} placeholder="例如：某机构参考答案、老师批改稿"/></label><label className="field field-wide"><span>参考答案正文</span><textarea className="form-textarea prompt-input" value={referenceAnswerContent} onChange={e => setReferenceAnswerContent(e.target.value)} placeholder="可留空。保存后在正常作答界面完全隐藏，仅在 AI 已完成盲抽、rubric、答案映射和字数审计后用于 Stage 5 交叉验证。"/></label><div className="import-note"><CircleAlert size={16}/><span>参考答案不是唯一真值，也不会反向改写前四阶段的材料评分框架；它只用于发现遗漏维度、比较归类粒度和记录差异。</span></div></section><footer className="form-actions"><button type="button" className="secondary" onClick={onCancel}>取消</button><button className="primary" type="submit" disabled={saving}><FilePlus2 size={16}/>{saving ? "保存中…" : "保存并开始作答"}</button></footer></form></main>;
}

function ReviewPanel({ review }: { review: MockReview }) {
  return <div className="review-content"><div className="score-panel"><span>本次得分</span><strong>{review.score}<small> / {review.maxScore}</small></strong><p>{review.summary}</p></div><div className="review-metrics"><div><span>要点覆盖</span><strong>{review.coverage}</strong></div><div><span>分类</span><strong>{review.classification}</strong></div><div><span>表达</span><strong>{review.expression}</strong></div><div><span>冗余</span><strong>{review.redundancy}</strong></div></div><div className="point-list"><h4>逐点核对</h4>{review.points.map(point => <article key={point.title} className={`point point-${point.status}`}><div className="point-heading">{point.status === "hit" ? <Check size={16}/> : <CircleAlert size={16}/>}<strong>{point.title}</strong><Badge tone={point.status === "hit" ? "green" : "amber"}>{point.status === "hit" ? "已覆盖" : point.status === "partial" ? "部分覆盖" : "遗漏"}</Badge></div><p><b>材料依据：</b>{point.evidence}</p>{point.suggestion && <p className="suggestion"><b>修改：</b>{point.suggestion}</p>}</article>)}</div>{review.referenceCrossCheck && <ReferenceCrossCheckPanel crossCheck={review.referenceCrossCheck}/>}</div>;
}

function Practice({ question, onExit, onSubmitted }: { question: Question; onExit: () => void; onSubmitted: (record: TrainingRecord) => void }) {
  return <PracticeWorkspace question={question} onExit={onExit} onSubmitted={onSubmitted}/>;
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

export default function App() {
  const [view, setView] = useState<AppView>("today");
  const [importedQuestions, setImportedQuestions] = useState<Question[]>([]);
  const allQuestions = useMemo(() => [...builtinQuestions, ...importedQuestions], [importedQuestions]);
  const [activeQuestion, setActiveQuestion] = useState<Question>(builtinQuestions[0]);
  const [history, setHistory] = useState<TrainingRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<TrainingRecord | null>(null);
  const [returnView, setReturnView] = useState<AppView>("history");

  async function refreshImportedQuestions() {
    const questions = await persistence.listImportedQuestions();
    setImportedQuestions(questions);
  }

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
        setImportedQuestions(questions);
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
  else if (view === "library") content = <QuestionLibraryPage allQuestions={allQuestions} onStart={start} onImport={() => setView("import")} onRefreshImported={refreshImportedQuestions}/>;
  else if (view === "import") content = <ImportQuestion onCancel={() => setView("library")} onSaved={saveImported}/>;
  else if (view === "review") content = <ReviewQueue records={history} allQuestions={allQuestions} onOpen={record => openRecord(record, "review")}/>;
  else if (view === "history") content = <HistoryPage records={history} onOpen={record => openRecord(record, "history")}/>;
  else if (view === "record" && selectedRecord) content = <RecordDetail record={selectedRecord} allQuestions={allQuestions} onBack={() => setView(returnView)} onRetry={start}/>;
  else content = <ProviderSettingsPage/>;

  return <div className="app-shell"><Sidebar view={view} onChange={setView}/>{content}</div>;
}
