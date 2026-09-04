import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { getIdentifier, getVersion } from "@tauri-apps/api/app";
import { isTauri } from "@tauri-apps/api/core";
import { ArrowLeft, BookMarked, Check, ChevronRight, CircleAlert, CirclePlay, FilePlus2, FileText, History, Home, LibraryBig, PenLine, RotateCcw, Settings, Target, TimerReset } from "lucide-react";
import { useAppUpdater } from "./appUpdater";
import { parseMaterialText, serializeMaterialTextForPersistence } from "./materialParser";
import MaterialBankPage from "./MaterialBankPage";
import InProgressPage from "./InProgressPage";
import { deleteEssayDrillDraft, listEssayDrillDrafts, type EssayDrillDraftEntry } from "./essayDrillStore";
import { buildInProgressPractices } from "./inProgressPractice";
import { questions as builtinQuestions } from "./mockData";
import PracticeWorkspace from "./PracticeWorkspace";
import ProviderSettingsPage from "./ProviderSettingsPage";
import QuestionLibraryPage from "./QuestionLibraryPage";
import RecordMaterialReference from "./RecordMaterialReference";
import ReviewPanel from "./ReviewPanel";
import { persistence } from "./storage";
import { isTownshipPaper, PAPER_LEVEL_OPTIONS, questionPaperId, questionPaperTitle, taskNumber } from "./examPaper";
import type { AppView, Difficulty, Draft, LocalQuestionInput, MockReview, PaperLevel, Question, QuestionType, TrainingRecord } from "./types";
import "./appUpdates.css";

const navItems = [
  { id: "today" as const, label: "今日训练", icon: Home },
  { id: "inProgress" as const, label: "进行中", icon: CirclePlay },
  { id: "library" as const, label: "题库", icon: LibraryBig },
  { id: "materials" as const, label: "素材精读", icon: BookMarked },
  { id: "review" as const, label: "错题复盘", icon: RotateCcw },
  { id: "history" as const, label: "训练记录", icon: History },
  { id: "settings" as const, label: "设置", icon: Settings }
];

function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "green" | "amber" }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

interface RuntimeInfo {
  identifier: string;
  version: string;
  isPreview: boolean;
}

function Sidebar({ view, onChange, inProgressCount, runtimeInfo }: { view: AppView; onChange: (view: AppView) => void; inProgressCount: number; runtimeInfo: RuntimeInfo | null }) {
  return <aside className="sidebar">
    <div className="brand"><div className="brand-mark"><PenLine size={19} /></div><div><strong>申论训练助手</strong><span>Shenlun Trainer</span>{runtimeInfo && <small className={runtimeInfo.isPreview ? "runtime-badge preview" : "runtime-badge"}>{runtimeInfo.isPreview ? "预览版 · 数据独立" : `正式版 v${runtimeInfo.version}`}</small>}</div></div>
    <nav>{navItems.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? "nav-item active" : "nav-item"} onClick={() => onChange(id)}><Icon size={18}/><span>{label}</span>{id === "inProgress" && inProgressCount > 0 && <small className="nav-count">{inProgressCount}</small>}</button>)}</nav>
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

function getRecordReview(record: TrainingRecord): MockReview | null {
  return record.review ?? null;
}

function formatStorageError(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "本地数据存储初始化失败。为保护题库和训练记录，应用已停止加载。";
}

function waitBeforeStorageRetry(milliseconds: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, milliseconds));
}

const STORAGE_RETRY_DELAYS = [500, 1500, 3000] as const;

function StorageGate({ state, error, onRetry }: { state: "loading" | "error"; error: string | null; onRetry: () => void }) {
  const loading = state === "loading";
  return <main className="storage-gate"><section className="storage-gate-card">
    <div className="storage-gate-icon"><CircleAlert size={24}/></div>
    <p className="eyebrow">本地数据保护</p>
    <h1>{loading ? "正在读取本地数据…" : "本地数据没有加载"}</h1>
    <p>{loading ? "正在打开题库、草稿和训练记录。请不要在此时重复安装或清理应用数据。" : error}</p>
    {!loading && <>
      <p className="storage-gate-note">为避免把空存储误当成新数据，桌面版不会在数据库异常时自动切换到空的浏览器存储。若你打开的是“申论训练助手 Preview”，它与正式版使用不同的数据目录，请改开正式版。</p>
      <button className="primary" onClick={onRetry}><RotateCcw size={16}/>重新读取数据</button>
    </>}
  </section></main>;
}

function Today({ onStart, onOpenInProgress, inProgressCount, history, allQuestions }: { onStart: (question: Question) => void; onOpenInProgress: () => void; inProgressCount: number; history: TrainingRecord[]; allQuestions: Question[] }) {
  const q = allQuestions.find(question => !isTownshipPaper(question));
  if (!q) return <main className="page page-wide">
    <header className="page-header"><div><p className="eyebrow">训练工作台</p><h1>从一道真实题目开始</h1><p>三个演示案例已移除。导入或收录的真实题目会出现在这里。</p></div></header>
    <div className="empty-state standalone"><LibraryBig size={28}/><strong>当前题库为空</strong><span>请先到“题库”导入一道题目。</span></div>
  </main>;
  const average = history.length ? Math.round(history.reduce((sum, item) => sum + item.score / item.maxScore, 0) / history.length * 100) : 76;
  return <main className="page page-wide">
    <header className="page-header"><div><p className="eyebrow">2026 · 训练工作台</p><h1>今天做一道，重点练“要点落地”</h1><p>先独立作答，再看结构化反馈。批改不会在作答阶段干扰你的判断。</p></div><div className="streak"><Target size={20}/><div><strong>连续 4 天</strong><span>保持训练节奏</span></div></div></header>
    {inProgressCount > 0 && <button className="today-resume" onClick={onOpenInProgress}><span><CirclePlay size={20}/></span><div><strong>你有 {inProgressCount} 道题尚未完成</strong><small>草稿已经自动保存，可以从上次停下的位置继续。</small></div><ChevronRight size={18}/></button>}
    <section className="hero-card"><div className="hero-top"><Badge tone="green">今日推荐</Badge><span>预计 18–25 分钟</span></div><h2>{q.title}</h2><p>{q.prompt}</p><div className="meta-row"><span><FileText size={16}/>{q.type}</span><span><TimerReset size={16}/>{q.wordLimit} 字</span><span><Target size={16}/>{q.score} 分</span></div><button className="primary large" onClick={() => onStart(q)}>开始作答 <ChevronRight size={18}/></button></section>
    <section className="dashboard-grid"><article className="metric-card"><span>已完成训练</span><strong>{history.length}</strong><small>本机留存的作答记录</small></article><article className="metric-card"><span>平均得分率</span><strong>{average}%</strong><small>按当前记录计算</small></article><article className="metric-card"><span>当前阶段</span><strong className="metric-text">形成稳定闭环</strong><small>题目 → 作答 → 学习 → 复盘</small></article></section>
  </main>;
}

function ImportQuestion({ onCancel, onSaved }: { onCancel: () => void; onSaved: (question: Question) => void }) {
  const [title, setTitle] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [region, setRegion] = useState("本地导入");
  const [paperLevel, setPaperLevel] = useState<PaperLevel>("其他/未标注");
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
      paperLevel,
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

  return <main className="page page-wide import-page"><header className="page-header compact"><div><p className="eyebrow">本地题库</p><h1>导入一道申论题</h1><p>支持完整真题粘贴。优先按“材料一 / 材料1 / 给定资料1”等显式标题识别材料，材料内部空行不会被当成新材料。</p></div><button className="secondary" onClick={onCancel}><ArrowLeft size={16}/>返回题库</button></header><form className="import-form" onSubmit={submit}><section className="form-card"><h3>题目信息</h3><label className="field field-wide"><span>题目名称</span><input value={title} onChange={e => setTitle(e.target.value)} placeholder="例如：概括某地基层治理的主要做法" required/></label><div className="form-grid"><label className="field"><span>题型</span><select value={type} onChange={e => setType(e.target.value as QuestionType)}>{["概括归纳","提出对策","综合分析","贯彻执行","文章写作"].map(item => <option key={item}>{item}</option>)}</select></label><label className="field"><span>难度</span><select value={difficulty} onChange={e => setDifficulty(e.target.value as Difficulty)}>{["基础","进阶","挑战"].map(item => <option key={item}>{item}</option>)}</select></label><label className="field"><span>试卷级别</span><select value={paperLevel} onChange={e => setPaperLevel(e.target.value as PaperLevel)}>{PAPER_LEVEL_OPTIONS.map(item => <option key={item}>{item}</option>)}</select></label><label className="field"><span>分值</span><input type="number" min="1" max="100" value={score} onChange={e => setScore(Number(e.target.value))}/></label><label className="field"><span>字数上限</span><input type="number" min="50" max="2000" value={wordLimit} onChange={e => setWordLimit(Number(e.target.value))}/></label><label className="field"><span>年份</span><input type="number" min="2000" max="2100" value={year} onChange={e => setYear(Number(e.target.value))}/></label><label className="field"><span>来源/地区</span><input value={region} onChange={e => setRegion(e.target.value)}/></label></div><label className="field field-wide"><span>标签（逗号分隔）</span><input value={tags} onChange={e => setTags(e.target.value)} placeholder="基层治理，概括做法，要点分类"/></label></section><section className="form-card"><h3>题干与材料</h3><label className="field field-wide"><span>作答要求</span><textarea className="form-textarea prompt-input" value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="粘贴题干与作答要求" required/></label><label className="field field-wide"><span>给定资料</span><textarea className="form-textarea material-input" value={materialText} onChange={e => setMaterialText(e.target.value)} placeholder="建议保留原题中的“材料一 / 材料二 / 给定资料1”等标题；每则材料内部可以正常保留多个自然段。" required/></label><div className="import-note"><CircleAlert size={16}/><span>{materialText.trim() ? `当前识别为 ${parsedMaterials.length} 则材料。` : "粘贴材料后会显示识别结果。"} 未检测到显式材料标题时，整段按一则材料保存，避免误拆。</span></div></section><section className="form-card"><h3>老师 / 机构参考答案（可选）</h3><label className="field field-wide"><span>来源</span><input value={referenceAnswerSource} onChange={e => setReferenceAnswerSource(e.target.value)} placeholder="例如：某机构参考答案、老师批改稿"/></label><label className="field field-wide"><span>参考答案正文</span><textarea className="form-textarea prompt-input" value={referenceAnswerContent} onChange={e => setReferenceAnswerContent(e.target.value)} placeholder="可留空。参考答案可用于后续学习或评分交叉验证。"/></label></section><footer className="form-actions"><button type="button" className="secondary" onClick={onCancel}>取消</button><button className="primary" type="submit" disabled={saving}><FilePlus2 size={16}/>{saving ? "保存中…" : "保存并开始作答"}</button></footer></form></main>;
}

function Practice({ question, paperQuestions, onExit, onSubmitted }: { question: Question; paperQuestions: Question[]; onExit: () => void; onSubmitted: (record: TrainingRecord) => void }) {
  return <PracticeWorkspace initialQuestion={question} paperQuestions={paperQuestions} onExit={onExit} onSubmitted={onSubmitted}/>;
}

function HistoryPage({ records, onOpen }: { records: TrainingRecord[]; onOpen: (record: TrainingRecord) => void }) {
  return <main className="page page-wide"><header className="page-header compact"><div><p className="eyebrow">训练记录</p><h1>每次作答都留下可追溯证据</h1><p>答案、当次得分和批改快照一起保存。</p></div></header><div className="history-table"><div className="history-row header"><span>题目</span><span>得分</span><span>时间</span><span></span></div>{records.length ? records.map(r => <button className="history-row history-button" key={r.id} onClick={() => onOpen(r)}><span><strong>{r.title}</strong><small>{r.answer.slice(0, 50)}{r.answer.length > 50 ? "…" : ""}</small></span><span className="history-score">{r.score}/{r.maxScore}</span><span>{r.submittedAt}</span><ChevronRight size={16}/></button>) : <div className="empty-state"><History size={24}/><strong>还没有训练记录</strong><span>完成一次答题后会自动出现在这里。</span></div>}</div></main>;
}

function ReviewQueue({ records, allQuestions, onOpen }: { records: TrainingRecord[]; allQuestions: Question[]; onOpen: (record: TrainingRecord) => void }) {
  const queue = records
    .map(record => ({ record, review: getRecordReview(record), question: allQuestions.find(question => question.id === record.questionId) }))
    .filter(item => (item.review?.points.some(point => point.status !== "hit") ?? false));
  return <main className="page page-wide"><header className="page-header compact"><div><p className="eyebrow">错题复盘</p><h1>把每次作答复盘清楚</h1><p>打开一题，查看题干、答案、材料和批改反馈。</p></div><Badge tone={queue.length ? "amber" : "green"}>{queue.length} 组待复盘</Badge></header>{queue.length ? <div className="review-queue">{queue.map(({ record, question }) => <button className="review-row" key={record.id} onClick={() => onOpen(record)}><div className="review-row-main"><span className="review-row-kicker">{record.submittedAt}{question ? ` · ${question.region}` : ""}</span><h3>{question ? questionPaperTitle(question) : record.title}</h3><p>{question?.prompt ?? "打开查看本次作答与批改反馈"}</p></div><div className="review-row-side"><span>{question ? `第${taskNumber(question)}题 · ${question.type}` : "错题复盘"}</span><strong>{record.score}/{record.maxScore}</strong><ChevronRight size={17}/></div></button>)}</div> : <div className="empty-state standalone"><Check size={28}/><strong>当前没有待复盘题目</strong><span>新提交的训练会自动根据批改快照进入这里。</span></div>}</main>;
}

function RecordDetail({ record, allQuestions, onBack, onRetry }: { record: TrainingRecord; allQuestions: Question[]; onBack: () => void; onRetry: (question: Question) => void }) {
  const review = getRecordReview(record);
  const question = allQuestions.find(item => item.id === record.questionId);
  return <main className="page page-wide"><header className="detail-header"><button className="secondary" onClick={onBack}><ArrowLeft size={16}/>返回</button><div><p className="eyebrow">训练复盘</p><h1>{question ? questionPaperTitle(question) : record.title}</h1><p>{record.submittedAt}{question ? ` · 第${taskNumber(question)}题 · ${question.type}` : ""} · 得分 {record.score}/{record.maxScore}</p></div>{question ? <button className="primary" onClick={() => onRetry(question)}>重新作答</button> : <span/>}</header><div className="record-detail-stack">{question && <section className="review-question-prompt"><div><span>题干 / 作答要求</span><strong>{questionPaperTitle(question)} · 第{taskNumber(question)}题</strong></div><p>{question.prompt}</p><small>{question.type} · {question.wordLimit} 字以内 · {question.score} 分</small></section>}<section className="answer-snapshot"><span>你的答案</span><p>{record.answer}</p></section>{question && review && <RecordMaterialReference question={question} review={review}/>}<section className="detail-review">{review ? <ReviewPanel review={review}/> : <div className="empty-state"><CircleAlert size={24}/><strong>这条旧记录没有批改快照</strong><span>应用不会用新规则重建或伪造历史批改结果。</span></div>}</section></div></main>;
}

export default function App() {
  const updater = useAppUpdater();
  const [view, setView] = useState<AppView>("today");
  const [importedQuestions, setImportedQuestions] = useState<Question[]>([]);
  // Built-in questions remain available only to automated tests and mock grading;
  // user-facing pages show actual imported/public-source questions exclusively.
  const allQuestions = useMemo(() => [...importedQuestions], [importedQuestions]);
  const [activeQuestion, setActiveQuestion] = useState<Question>(builtinQuestions[0]);
  const [activePaperQuestions, setActivePaperQuestions] = useState<Question[]>([builtinQuestions[0]]);
  const [history, setHistory] = useState<TrainingRecord[]>([]);
  const [answerDrafts, setAnswerDrafts] = useState<Draft[]>([]);
  const [essayDrafts, setEssayDrafts] = useState<EssayDrillDraftEntry[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<TrainingRecord | null>(null);
  const [returnView, setReturnView] = useState<AppView>("history");
  const [storageState, setStorageState] = useState<"loading" | "ready" | "error">("loading");
  const [storageError, setStorageError] = useState<string | null>(null);
  const [runtimeInfo, setRuntimeInfo] = useState<RuntimeInfo | null>(null);
  const hydrationPromise = useRef<Promise<{ questions: Question[]; records: TrainingRecord[]; drafts: Draft[] }> | null>(null);
  const inProgress = useMemo(() => buildInProgressPractices(answerDrafts, essayDrafts, history), [answerDrafts, essayDrafts, history]);

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    void Promise.all([getIdentifier(), getVersion()]).then(([identifier, version]) => {
      if (cancelled) return;
      setRuntimeInfo({ identifier, version, isPreview: identifier === "com.shenlun.trainer.preview" });
    }).catch(error => console.warn("Failed to read app identity.", error));
    return () => { cancelled = true; };
  }, []);

  async function refreshImportedQuestions() {
    const questions = await persistence.listImportedQuestions();
    setImportedQuestions(questions);
  }

  async function refreshInProgress() {
    const drafts = await persistence.listDrafts();
    setAnswerDrafts(drafts);
    setEssayDrafts(listEssayDrillDrafts());
  }

  useEffect(() => {
    let cancelled = false;
    // React StrictMode replays effects in development. Share one hydration
    // promise between effect subscriptions so the database is read once while
    // the currently mounted subscription can still receive the result.
    if (!hydrationPromise.current) {
      hydrationPromise.current = (async () => {
        let lastError: unknown = null;
        for (let attempt = 0; attempt <= STORAGE_RETRY_DELAYS.length; attempt += 1) {
          try {
            if (attempt === 0) await persistence.initialize();
            else await persistence.retryInitialize();
            const [questions, records, drafts] = await Promise.all([
              persistence.listImportedQuestions(),
              persistence.listHistory(),
              persistence.listDrafts()
            ]);
            return { questions, records, drafts };
          } catch (error) {
            lastError = error;
            const retryDelay = STORAGE_RETRY_DELAYS[attempt];
            if (retryDelay !== undefined) await waitBeforeStorageRetry(retryDelay);
          }
        }
        throw lastError instanceof Error ? lastError : new Error("本地数据初始化失败。");
      })();
    }
    void hydrationPromise.current.then(({ questions, records, drafts }) => {
      if (cancelled) return;
      setImportedQuestions(questions);
      setHistory(current => mergeUniqueById(current, records));
      setAnswerDrafts(drafts);
      setEssayDrafts(listEssayDrillDrafts());
      setStorageError(null);
      setStorageState("ready");
    }).catch(error => {
      console.error("Failed to initialize persistence.", error);
      if (cancelled) return;
      setStorageError(formatStorageError(error));
      setStorageState("error");
    });
    return () => { cancelled = true; };
  }, []);

  function start(question: Question) {
    const paperId = questionPaperId(question);
    const paperQuestions = paperId
      ? allQuestions
          .filter(item => questionPaperId(item) === paperId)
          .sort((left, right) => (left.taskIndex ?? Number.MAX_SAFE_INTEGER) - (right.taskIndex ?? Number.MAX_SAFE_INTEGER))
      : [question];
    setActiveQuestion(question);
    setActivePaperQuestions(paperQuestions.length ? paperQuestions : [question]);
    setView("practice");
  }
  function openRecord(record: TrainingRecord, from: AppView) { setSelectedRecord(record); setReturnView(from); setView("record"); }
  function saveImported(question: Question) { setImportedQuestions(current => mergeUniqueById([question], current)); start(question); }
  function changeView(next: AppView) {
    setView(next);
    if (next === "inProgress") void refreshInProgress();
  }
  function leavePractice() {
    setView("library");
    window.setTimeout(() => void refreshInProgress(), 0);
  }
  function recordSubmission(record: TrainingRecord) {
    setHistory(current => mergeUniqueById([record], current));
    setAnswerDrafts(current => current.filter(draft => draft.questionId !== record.questionId));
    setEssayDrafts(current => current.filter(entry => entry.questionId !== record.questionId));
  }
  async function clearInProgress(questionId: string) {
    await persistence.deleteDraft(questionId);
    deleteEssayDrillDraft(questionId);
    setAnswerDrafts(current => current.filter(draft => draft.questionId !== questionId));
    setEssayDrafts(current => current.filter(entry => entry.questionId !== questionId));
  }

  const updateBanner = updater.available ? <div className="app-update-banner" role="status">
    <span>{updater.error ?? <>发现新版本 <strong>v{updater.available.version}</strong>，安装前会先备份本地数据。</>}</span>
    <button disabled={updater.installing} onClick={() => void updater.install()}>{updater.installing ? "更新中…" : updater.error ? "重试" : "立即更新"}</button>
    <button className="app-update-dismiss" disabled={updater.installing} onClick={updater.dismiss}>稍后</button>
  </div> : null;

  if (storageState !== "ready") return <StorageGate state={storageState} error={storageError} onRetry={() => window.location.reload()}/>;

  if (view === "practice") return <><Practice question={activeQuestion} paperQuestions={activePaperQuestions} onExit={leavePractice} onSubmitted={recordSubmission}/>{updateBanner}</>;

  let content: React.ReactNode;
  if (view === "today") content = <Today onStart={start} onOpenInProgress={() => changeView("inProgress")} inProgressCount={inProgress.length} history={history} allQuestions={allQuestions}/>;
  else if (view === "inProgress") content = <InProgressPage items={inProgress} questions={allQuestions} onResume={start} onClear={clearInProgress}/>;
  else if (view === "library") content = <QuestionLibraryPage allQuestions={allQuestions} history={history} onStart={start} onImport={() => setView("import")} onRefreshImported={refreshImportedQuestions}/>;
  else if (view === "materials") content = <MaterialBankPage/>;
  else if (view === "import") content = <ImportQuestion onCancel={() => setView("library")} onSaved={saveImported}/>;
  else if (view === "review") content = <ReviewQueue records={history} allQuestions={allQuestions} onOpen={record => openRecord(record, "review")}/>;
  else if (view === "history") content = <HistoryPage records={history} onOpen={record => openRecord(record, "history")}/>;
  else if (view === "record" && selectedRecord) content = <RecordDetail record={selectedRecord} allQuestions={allQuestions} onBack={() => setView(returnView)} onRetry={start}/>;
  else content = <ProviderSettingsPage onQuestionsChanged={refreshImportedQuestions}/>;

  return <div className="app-shell"><Sidebar view={view} onChange={changeView} inProgressCount={inProgress.length} runtimeInfo={runtimeInfo}/>{content}{updateBanner}</div>;
}
