import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { BookOpen, ChevronRight, Download, ExternalLink, Eye, FileText, Globe2, Info, Plus, RefreshCw, Search, Sparkles } from "lucide-react";
import { errorMessage } from "./errorMessage";
import { inferPaperLevel, isTownshipPaper, PAPER_LEVEL_OPTIONS, questionPaperId, questionPaperLevel } from "./examPaper";
import { initializeRecentPublicExamLibrary, type PublicExamBootstrapProgress } from "./publicExamBootstrap";
import { groupPublicExamCandidates } from "./publicExamCatalog";
import { canImportParsedPublicExam } from "./publicExamParser";
import { importPublicExam, previewPublicExam, type PublicExamPreview } from "./publicExamImporter";
import { discoverProviderCandidates, getPublicExamYearRange, isRecentPublicExamYear } from "./publicSourceDiscovery";
import { getPublicSourceProvider } from "./publicSourceProviders";
import { getQuestionNote, getQuestionNoteIds, saveQuestionNote } from "./questionNotes";
import { getCachedExactQuestionSimilarityMap, type SimilarQuestion } from "./questionSimilarity";
import { inferQuestionThemes, QUESTION_THEMES, type QuestionTheme } from "./questionThemes";
import { publicSourceStore, type PublicSourceCandidate, type QuestionSourceProvenance } from "./publicSourceStore";
import type { Question, QuestionType, TrainingRecord } from "./types";
import "./questionLibrary.css";
import "./questionLibraryPreviewModal.css";
import "./trainingLibraryV2.css";

const PRIMARY_PROVIDER_ID = "gkzhenti-public";
const PUBLIC_PAGE_SIZE = 30;
const QUESTION_PAGE_SIZE = 24;
const QUESTION_TYPES: QuestionType[] = ["概括归纳", "提出对策", "综合分析", "贯彻执行", "文章写作"];

type LibraryTab = "ready" | "public";

type NoteEditorState = {
  question: Question;
  value: string;
  loading: boolean;
  saving: boolean;
};

function LibraryFilterRow({ label, children, scroll = false }: { label: string; children: ReactNode; scroll?: boolean }) {
  return <div className={`library-filter-row ${scroll ? "is-scrollable" : ""}`}><span>{label}</span><div>{children}</div></div>;
}

function difficultyLabel(question: Question): string { return question.difficulty; }
function isPublicImportedQuestion(question: Question): boolean { return question.id.startsWith("publicq:"); }
function sourceVariantLabel(candidate: PublicSourceCandidate): string {
  if (candidate.status === "imported") return "已入库版本";
  if (candidate.metadata?.recallVersion === true) return "回忆版本";
  if (/(站友|网友|考生).*(提供|整理)|站友提供/.test(candidate.title)) return "用户提供版本";
  return "公开版本";
}
function bootstrapStatus(progress: PublicExamBootstrapProgress): string {
  if (progress.phase === "scan") return progress.title;
  if (progress.phase === "done") return `${progress.title}：已入库 ${progress.done}/${progress.total} 套。`;
  const phase = progress.phase === "audit" ? "自动校验" : "自动导入";
  return `${phase} ${progress.done}/${progress.total}：${progress.title}`;
}

function PublicExamBrowser({ onImported }: { onImported: () => Promise<void> | void }) {
  const desktop = isTauri();
  const yearRange = getPublicExamYearRange();
  const [candidates, setCandidates] = useState<PublicSourceCandidate[]>([]);
  const [query, setQuery] = useState("");
  const [yearFilter, setYearFilter] = useState("all");
  const [regionFilter, setRegionFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [expandedGroupKey, setExpandedGroupKey] = useState<string | null>(null);
  const [status, setStatus] = useState(`只加载近10年（${yearRange.minYear}—${yearRange.maxYear}）公开整卷目录；可自动校验并导入结构稳定的试卷。`);
  const [preview, setPreview] = useState<PublicExamPreview | null>(null);
  const [previewCandidate, setPreviewCandidate] = useState<PublicSourceCandidate | null>(null);
  const [previewError, setPreviewError] = useState<{ candidateId: string; message: string } | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  async function reload() {
    const rows = await publicSourceStore.listCandidates();
    setCandidates(rows.filter(item => item.providerId === PRIMARY_PROVIDER_ID
      && isRecentPublicExamYear(item.year)
      && inferPaperLevel(item.region, item.paperVariant, item.title) !== "省考乡镇级"));
  }

  useEffect(() => { void reload().catch(error => { console.error("Failed to load public exam catalog.", error); setStatus(errorMessage(error, "无法读取本机公开真题目录。")); }); }, []);
  useEffect(() => { setPage(1); }, [query, yearFilter, regionFilter]);

  async function autoCompleteLibrary() {
    if (!desktop || busy) return;
    setBusy("bootstrap");
    setStatus("正在自动补全近10年题库：通过结构校验的整卷会直接入库，异常卷自动隔离……");
    try {
      const result = await initializeRecentPublicExamLibrary({ delayMs: 350, onProgress: progress => setStatus(bootstrapStatus(progress)) });
      await reload();
      setStatus(`自动补全完成：已入库 ${result.finalImportedPaperCount}/${result.candidateCount} 套；本轮新增 ${result.import.questionCount} 道题。${result.audit.blocked + result.audit.error + result.import.error > 0 ? ` 另有 ${result.audit.blocked + result.audit.error + result.import.error} 套异常来源已隔离，不影响刷题。` : ""}`);
      await onImported();
    } catch (error) {
      console.error("Failed to bootstrap public exam library.", error);
      setStatus(errorMessage(error, "自动补全题库失败。已完成的批次会保留，下次可继续。"));
    } finally { setBusy(null); }
  }

  async function scanPrimaryCatalog() {
    if (!desktop || busy) return;
    const provider = getPublicSourceProvider(PRIMARY_PROVIDER_ID);
    if (!provider) return;
    setBusy("scan");
    setStatus(`正在更新 ${yearRange.minYear}—${yearRange.maxYear} 公开申论整卷目录；只保存标题、年份、地区、卷别和原始 URL…`);
    try {
      const discovered = await discoverProviderCandidates(provider);
      await reload();
      setStatus(`目录更新完成：识别 ${groupPublicExamCandidates(discovered).length} 套近10年申论整卷、${discovered.length} 个公开版本；同卷多版本已分组，不会重复占满题库。`);
    } catch (error) { console.error("Failed to scan primary public exam catalog.", error); setStatus(errorMessage(error, "公开真题目录更新失败。")); }
    finally { setBusy(null); }
  }

  async function openPreview(candidate: PublicSourceCandidate) {
    if (!desktop || busy) return;
    setPreviewCandidate(candidate); setBusy(candidate.id); setPreview(null); setPreviewError(null); setConfirmed(false); setStatus(`正在读取整卷：${candidate.title}`);
    try {
      const next = await previewPublicExam(candidate);
      setPreview(next);
      setStatus(canImportParsedPublicExam(next.exam) ? `已识别 ${next.exam.materials.length} 则材料、${next.exam.tasks.length} 道题。这里的人工核验只用于你主动检查异常/特定试卷，不是日常导入必需步骤。` : "这套卷仍有未解决的解析警告，当前不会写入正式题库。");
    } catch (error) {
      console.error("Failed to preview public exam.", error);
      const message = errorMessage(error, "整卷预览失败。");
      setPreviewError({ candidateId: candidate.id, message }); setStatus(`预览失败：${candidate.title}。${message}`);
    } finally { setBusy(null); }
  }

  function closePreviewDialog() { if (busy) return; setPreviewCandidate(null); setPreview(null); setPreviewError(null); setConfirmed(false); }

  async function importExam() {
    if (!preview || !confirmed || busy) return;
    setBusy(preview.candidate.id);
    try {
      const result = await importPublicExam(preview);
      await reload();
      setStatus(`已导入：新增 ${result.newlyImportedQuestionIds.length} 道题${result.reusedQuestionIds.length ? `，已有 ${result.reusedQuestionIds.length} 道直接复用` : ""}。`);
      setPreviewCandidate(null); setPreview(null); setPreviewError(null); setConfirmed(false); setExpandedGroupKey(null); await onImported();
    } catch (error) { console.error("Failed to import public exam.", error); setStatus(errorMessage(error, "整卷导入失败。")); }
    finally { setBusy(null); }
  }

  const groups = useMemo(() => groupPublicExamCandidates(candidates), [candidates]);
  const options = useMemo(() => ({ years: [...new Set(groups.map(item => item.year))].sort((a, b) => b - a), regions: [...new Set(groups.map(item => item.region).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN")) }), [groups]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return groups.filter(group => {
      if (yearFilter !== "all" && String(group.year) !== yearFilter) return false;
      if (regionFilter !== "all" && group.region !== regionFilter) return false;
      return !needle || group.members.some(item => `${item.title} ${item.paperVariant ?? ""} ${item.region ?? ""}`.toLowerCase().includes(needle));
    });
  }, [groups, query, regionFilter, yearFilter]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PUBLIC_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const rows = filtered.slice((currentPage - 1) * PUBLIC_PAGE_SIZE, currentPage * PUBLIC_PAGE_SIZE);
  const importable = preview ? canImportParsedPublicExam(preview.exam) : false;

  return <div className="public-library-browser">
    <div className="public-library-intro public-library-auto-intro"><div><Globe2 size={20}/><div><strong>公开申论整卷 · 近10年</strong><span>正常试卷由程序自动校验后入库；只有解析警告/来源异常的试卷会被隔离。你无需逐卷人工核对。</span></div></div><div className="public-library-auto-actions"><button className="primary" disabled={!desktop || busy !== null} onClick={() => void autoCompleteLibrary()}><Download size={15}/>{busy === "bootstrap" ? "自动补全中…" : "自动补全题库"}</button><button className="secondary" disabled={!desktop || busy !== null} onClick={() => void scanPrimaryCatalog()}><RefreshCw size={15}/>{busy === "scan" ? "更新中…" : candidates.length ? "只更新目录" : "获取公开目录"}</button></div></div>
    {!desktop && <div className="library-runtime-note">浏览器预览不能跨站抓取公开真题。自动补全和整卷导入请在 Tauri 桌面版执行。</div>}
    <div className="library-status">{status}</div>
    <div className="public-library-filters"><div className="search-box"><Search size={16}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索国考、省考、年份或卷别"/></div><select value={yearFilter} onChange={event => setYearFilter(event.target.value)}><option value="all">近10年全部年份</option>{options.years.map(year => <option key={year} value={year}>{year}</option>)}</select><select value={regionFilter} onChange={event => setRegionFilter(event.target.value)}><option value="all">全部地区</option>{options.regions.map(region => <option key={region} value={region}>{region}</option>)}</select><span>{filtered.length} 套 · {candidates.length} 个版本</span></div>
    <div className="public-exam-cards">{rows.map(group => { const item = group.preferred; const expanded = expandedGroupKey === group.key; return <article className="public-exam-card" key={group.key}><div className="public-exam-card-heading"><div><strong>{item.title}</strong><div>{item.year && <span>{item.year}</span>}{item.region && <span>{item.region}</span>}{item.paperVariant && <span>{item.paperVariant}</span>}<span className="preferred">推荐版本</span>{item.metadata?.recallVersion === true && <span className="recall">回忆来源</span>}{group.hasImportedVersion && <span className="imported">已有版本入库</span>}{group.alternatives.length > 0 && <button className="variant-toggle" onClick={() => setExpandedGroupKey(expanded ? null : group.key)}>{expanded ? "收起版本" : `另有 ${group.alternatives.length} 个版本`}</button>}</div></div><button disabled={!desktop || busy !== null || group.hasImportedVersion} onClick={() => void openPreview(item)}><Eye size={14}/>{busy === item.id ? "读取中" : group.hasImportedVersion ? "已有版本入库" : "手动检查"}</button></div>{expanded && <div className="public-exam-variants">{group.alternatives.map(alternative => <div key={alternative.id}><div><strong>{alternative.title}</strong><span>{sourceVariantLabel(alternative)}</span></div><div>{!group.hasImportedVersion && <button disabled={!desktop || busy !== null} onClick={() => void openPreview(alternative)}><Eye size={13}/>{busy === alternative.id ? "读取中" : "检查此版本"}</button>}<a href={alternative.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink size={13}/>原页面</a></div></div>)}</div>}</article>; })}{!rows.length && <div className="public-library-empty">{candidates.length ? "没有符合筛选条件的整卷。" : `尚未获取 ${yearRange.minYear}—${yearRange.maxYear} 公开整卷目录。桌面版点击“自动补全题库”即可开始。`}</div>}</div>
    {filtered.length > 0 && <div className="public-library-pager"><span>第 {currentPage}/{totalPages} 页</span><div><button className="secondary" disabled={currentPage <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}>上一页</button><button className="secondary" disabled={currentPage >= totalPages} onClick={() => setPage(value => Math.min(totalPages, value + 1))}>下一页</button></div></div>}
    {previewCandidate && <div className="library-preview-backdrop" role="dialog" aria-modal="true" aria-label="公开真题导入前核验"><div className="library-exam-preview library-exam-preview-modal">{!preview && !previewError ? <div className="library-preview-loading"><RefreshCw size={24}/><strong>正在读取并解析整卷</strong><span>{previewCandidate.title}</span><small>通常几秒内完成。</small></div> : null}{previewError ? <div className="library-preview-error"><header><div><span>预览失败</span><h3>{previewCandidate.title}</h3></div><button className="text-button" disabled={busy !== null} onClick={closePreviewDialog}>关闭</button></header><p>{previewError.message}</p><div><a href={previewCandidate.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink size={14}/>打开原始页面</a><button className="secondary" disabled={busy !== null} onClick={() => void openPreview(previewCandidate)}><RefreshCw size={14}/>重新读取</button></div></div> : null}{preview ? <><header><div><span>人工检查（可选）</span><h3>{preview.exam.title}</h3><p>{preview.exam.materials.length} 则材料 · {preview.exam.tasks.length} 道作答题</p></div><button className="text-button" disabled={busy !== null} onClick={closePreviewDialog}>关闭</button></header>{preview.exam.warnings.length > 0 && <div className="library-parser-warning">{preview.exam.warnings.join("；")}</div>}<div className="library-preview-tasks">{preview.exam.tasks.map(task => <article key={task.taskIndex}><div><strong>第 {task.taskIndex + 1} 题</strong><span>{task.questionType}</span><span>{task.score ?? "?"} 分</span><span>≤ {task.wordLimit ?? "?"} 字</span>{task.materialNumbers.length ? <span>材料 {task.materialNumbers.join("、")}</span> : null}</div><p>{task.prompt}</p>{task.warnings.length > 0 && <small>{task.warnings.join("；")}</small>}</article>)}</div><footer>{importable ? <label><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/><span>我已人工核对，仍要手动导入此版本。</span></label> : <span className="blocked">结构校验未通过，禁止自动导入。</span>}<button className="primary" disabled={!importable || !confirmed || busy !== null} onClick={() => void importExam()}><Download size={15}/>{busy === preview.candidate.id ? "导入中…" : "手动导入此卷"}</button></footer></> : null}</div></div>}
  </div>;
}

export default function QuestionLibraryPage({ allQuestions, history, onStart, onImport, onRefreshImported, onDeepRead }: {
  allQuestions: Question[];
  history: TrainingRecord[];
  onStart: (question: Question) => void;
  onImport: () => void;
  onRefreshImported: () => Promise<void> | void;
  onDeepRead: (question: Question) => void;
}) {
  const [tab, setTab] = useState<LibraryTab>("ready");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [typeFilter, setTypeFilter] = useState<"all" | QuestionType>("all");
  const [themeFilter, setThemeFilter] = useState<"all" | QuestionTheme>("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [regionFilter, setRegionFilter] = useState("all");
  const [paperLevelFilter, setPaperLevelFilter] = useState("all");
  const [difficultyFilter, setDifficultyFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "todo" | "done">("all");
  const [page, setPage] = useState(1);
  const [sourceLoadingId, setSourceLoadingId] = useState<string | null>(null);
  const [sourceDetail, setSourceDetail] = useState<{ questionId: string; source: QuestionSourceProvenance | null } | null>(null);
  const [noteIds, setNoteIds] = useState<Set<string>>(new Set());
  const [noteEditor, setNoteEditor] = useState<NoteEditorState | null>(null);
  const libraryQuestions = useMemo(() => allQuestions.filter(question => !isTownshipPaper(question)), [allQuestions]);

  useEffect(() => { void getQuestionNoteIds().then(setNoteIds).catch(error => console.error("Failed to load question note ids.", error)); }, [libraryQuestions.length]);
  const typeCounts = useMemo(() => { const counts = new Map<QuestionType, number>(QUESTION_TYPES.map(type => [type, 0])); for (const question of libraryQuestions) counts.set(question.type, (counts.get(question.type) ?? 0) + 1); return counts; }, [libraryQuestions]);
  const attemptCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const record of history) counts.set(record.questionId, (counts.get(record.questionId) ?? 0) + 1);
    return counts;
  }, [history]);
  const [similarityMap, setSimilarityMap] = useState<Map<string, SimilarQuestion[]>>(new Map());
  useEffect(() => {
    let cancelled = false;
    setSimilarityMap(new Map());
    const timer = window.setTimeout(() => {
      const next = getCachedExactQuestionSimilarityMap(libraryQuestions);
      if (!cancelled) setSimilarityMap(next);
    }, 80);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [libraryQuestions]);
  const questionMeta = useMemo(() => new Map(libraryQuestions.map(question => [question.id, {
    themes: inferQuestionThemes(question),
    searchText: `${question.title} ${question.prompt} ${question.type} ${question.tags.join(" ")} ${question.region} ${questionPaperLevel(question)}`.toLowerCase(),
    createdAt: question.createdAt ? Date.parse(question.createdAt) || 0 : 0
  }])), [libraryQuestions]);
  const themeCounts = useMemo(() => {
    const counts = new Map<QuestionTheme, number>();
    for (const meta of questionMeta.values()) for (const theme of meta.themes) counts.set(theme, (counts.get(theme) ?? 0) + 1);
    return counts;
  }, [questionMeta]);
  const filterOptions = useMemo(() => ({
    years: [...new Set(libraryQuestions.map(question => question.year))].sort((a, b) => b - a),
    regions: [...new Set(libraryQuestions.map(question => question.region).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN")),
    difficulties: [...new Set(libraryQuestions.map(question => question.difficulty))],
    paperLevels: PAPER_LEVEL_OPTIONS.filter(level => libraryQuestions.some(question => questionPaperLevel(question) === level))
  }), [libraryQuestions]);
  const paperQuestionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const question of libraryQuestions) {
      const key = questionPaperId(question) ?? question.id;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [libraryQuestions]);
  const filtered = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    return libraryQuestions
      .filter(question => typeFilter === "all" || question.type === typeFilter)
      .filter(question => themeFilter === "all" || questionMeta.get(question.id)?.themes.includes(themeFilter))
      .filter(question => yearFilter === "all" || String(question.year) === yearFilter)
      .filter(question => regionFilter === "all" || question.region === regionFilter)
      .filter(question => paperLevelFilter === "all" || questionPaperLevel(question) === paperLevelFilter)
      .filter(question => difficultyFilter === "all" || question.difficulty === difficultyFilter)
      .filter(question => {
        const completed = (attemptCounts.get(question.id) ?? 0) > 0;
        return statusFilter === "all" || (statusFilter === "done" ? completed : !completed);
      })
      .filter(question => !needle || questionMeta.get(question.id)?.searchText.includes(needle))
      .sort((left, right) => {
        const leftCompleted = (attemptCounts.get(left.id) ?? 0) > 0;
        const rightCompleted = (attemptCounts.get(right.id) ?? 0) > 0;
        if (leftCompleted !== rightCompleted) return leftCompleted ? 1 : -1;
        const leftCreated = questionMeta.get(left.id)?.createdAt ?? 0;
        const rightCreated = questionMeta.get(right.id)?.createdAt ?? 0;
        return rightCreated - leftCreated
          || right.year - left.year
          || left.title.localeCompare(right.title, "zh-CN");
      });
  }, [attemptCounts, deferredQuery, difficultyFilter, libraryQuestions, paperLevelFilter, questionMeta, regionFilter, statusFilter, themeFilter, typeFilter, yearFilter]);

  useEffect(() => { setPage(1); }, [deferredQuery, difficultyFilter, paperLevelFilter, regionFilter, statusFilter, themeFilter, typeFilter, yearFilter]);
  const completedCount = useMemo(() => libraryQuestions.filter(question => (attemptCounts.get(question.id) ?? 0) > 0).length, [libraryQuestions, attemptCounts]);
  const todoCount = libraryQuestions.length - completedCount;
  const questionTitleById = useMemo(() => new Map(libraryQuestions.map(question => [question.id, question.title])), [libraryQuestions]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / QUESTION_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visibleQuestions = filtered.slice((currentPage - 1) * QUESTION_PAGE_SIZE, currentPage * QUESTION_PAGE_SIZE);
  const hasActiveFilters = query.trim() !== "" || typeFilter !== "all" || themeFilter !== "all" || yearFilter !== "all" || regionFilter !== "all" || paperLevelFilter !== "all" || difficultyFilter !== "all" || statusFilter !== "all";

  async function finishPublicImport() { await onRefreshImported(); setTab("ready"); setQuery(""); }
  async function toggleSource(questionId: string) {
    if (sourceDetail?.questionId === questionId) { setSourceDetail(null); return; }
    if (sourceLoadingId) return;
    setSourceLoadingId(questionId);
    try { setSourceDetail({ questionId, source: await publicSourceStore.getQuestionSource(questionId) }); }
    catch (error) { console.error("Failed to load question source provenance.", error); setSourceDetail({ questionId, source: null }); }
    finally { setSourceLoadingId(null); }
  }
  async function openNote(question: Question) {
    setNoteEditor({ question, value: "", loading: true, saving: false });
    try { const note = await getQuestionNote(question.id); setNoteEditor(current => current?.question.id === question.id ? { ...current, value: note?.content ?? "", loading: false } : current); }
    catch (error) { console.error("Failed to load question note.", error); setNoteEditor(current => current?.question.id === question.id ? { ...current, loading: false } : current); }
  }
  async function persistNote() {
    if (!noteEditor || noteEditor.saving) return;
    const questionId = noteEditor.question.id; const content = noteEditor.value;
    setNoteEditor(current => current ? { ...current, saving: true } : current);
    try { await saveQuestionNote(questionId, content); setNoteIds(current => { const next = new Set(current); if (content.trim()) next.add(questionId); else next.delete(questionId); return next; }); setNoteEditor(null); }
    catch (error) { console.error("Failed to save question note.", error); setNoteEditor(current => current ? { ...current, saving: false } : current); }
  }
  function startRandomFilteredQuestion() { if (filtered.length) onStart(filtered[Math.floor(Math.random() * filtered.length)]); }
  function clearFilters() { setQuery(""); setTypeFilter("all"); setThemeFilter("all"); setYearFilter("all"); setRegionFilter("all"); setPaperLevelFilter("all"); setDifficultyFilter("all"); setStatusFilter("all"); }

  return <main className="page page-wide question-library-page training-library-v2">
    <header className="page-header compact"><div><p className="eyebrow">题库</p><h1>从一个题型或主题开始训练</h1><p>像选文章一样筛选真题；进入任意一道题后，会自动打开所属整卷及全部题目。</p></div><div className="library-header-actions"><button className="secondary" disabled={!filtered.length} onClick={startRandomFilteredQuestion}>随机一题</button><button className="secondary" onClick={onImport}><Plus size={16}/>手工导入</button></div></header>
    <div className="library-tabs"><button className={tab === "ready" ? "active" : ""} onClick={() => setTab("ready")}><BookOpen size={16}/>开始刷题 <span>{libraryQuestions.length}</span></button><button className={tab === "public" ? "active" : ""} onClick={() => setTab("public")}><Globe2 size={16}/>自动补全题库</button></div>
    {tab === "ready" ? <>
      <section className="library-horizontal-filter">
        <div className="library-filter-search"><Search size={18}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索题目、题干、标签或地区"/><span>{filtered.length} 道题</span></div>
        <LibraryFilterRow label="题型"><button className={typeFilter === "all" ? "active" : ""} onClick={() => setTypeFilter("all")}>全部题型 <small>{libraryQuestions.length}</small></button>{QUESTION_TYPES.map(type => <button key={type} className={typeFilter === type ? "active" : ""} onClick={() => setTypeFilter(type)}>{type} <small>{typeCounts.get(type) ?? 0}</small></button>)}</LibraryFilterRow>
        <LibraryFilterRow label="主题"><button className={themeFilter === "all" ? "active" : ""} onClick={() => setThemeFilter("all")}>全部主题</button>{QUESTION_THEMES.filter(theme => theme !== "全部主题").map(theme => <button key={theme} className={themeFilter === theme ? "active" : ""} onClick={() => setThemeFilter(theme)}>{theme} <small>{themeCounts.get(theme) ?? 0}</small></button>)}</LibraryFilterRow>
        <LibraryFilterRow label="进度"><button className={statusFilter === "all" ? "active" : ""} onClick={() => setStatusFilter("all")}>全部</button><button className={statusFilter === "todo" ? "active" : ""} onClick={() => setStatusFilter("todo")}>未做 {todoCount}</button><button className={statusFilter === "done" ? "active" : ""} onClick={() => setStatusFilter("done")}>已做 {completedCount}</button></LibraryFilterRow>
        <LibraryFilterRow label="年份" scroll><button className={yearFilter === "all" ? "active" : ""} onClick={() => setYearFilter("all")}>全部年份</button>{filterOptions.years.map(year => <button key={year} className={yearFilter === String(year) ? "active" : ""} onClick={() => setYearFilter(String(year))}>{year}</button>)}</LibraryFilterRow>
        <LibraryFilterRow label="地区" scroll><button className={regionFilter === "all" ? "active" : ""} onClick={() => setRegionFilter("all")}>全部地区</button>{filterOptions.regions.map(region => <button key={region} className={regionFilter === region ? "active" : ""} onClick={() => setRegionFilter(region)}>{region}</button>)}</LibraryFilterRow>
        <LibraryFilterRow label="卷别/级别" scroll><button className={paperLevelFilter === "all" ? "active" : ""} onClick={() => setPaperLevelFilter("all")}>全部级别</button>{filterOptions.paperLevels.map(level => <button key={level} className={paperLevelFilter === level ? "active" : ""} onClick={() => setPaperLevelFilter(level)}>{level}</button>)}</LibraryFilterRow>
        <LibraryFilterRow label="难度"><button className={difficultyFilter === "all" ? "active" : ""} onClick={() => setDifficultyFilter("all")}>全部难度</button>{filterOptions.difficulties.map(value => <button key={value} className={difficultyFilter === value ? "active" : ""} onClick={() => setDifficultyFilter(value)}>{value}</button>)}</LibraryFilterRow>
      </section>
      <div className="library-result-heading"><div><strong>{typeFilter === "all" ? themeFilter === "all" ? "全部真题" : themeFilter : typeFilter}</strong><span>{filtered.length} 道 · 未做 {todoCount}</span></div>{hasActiveFilters && <button onClick={clearFilters}>清除筛选</button>}</div>
      <section className="question-landscape-list">{visibleQuestions.map(question => {
        const publicQuestion = isPublicImportedQuestion(question); const detail = sourceDetail?.questionId === question.id ? sourceDetail : null; const hasNote = noteIds.has(question.id); const attemptCount = attemptCounts.get(question.id) ?? 0; const similar = (similarityMap.get(question.id) ?? []) as SimilarQuestion[]; const nearestSimilar = similar[0];
        const tags = question.tags.slice(0, 5); const paperCount = paperQuestionCounts.get(questionPaperId(question) ?? question.id) ?? 1;
        return <article className={`question-landscape-card ${attemptCount ? "is-completed" : "is-todo"}`} key={question.id}>
          <div className="question-kind-panel"><span>{question.type}</span><strong>{question.score}</strong><small>分 · {question.wordLimit} 字</small></div>
          <div className="question-landscape-body"><div className="question-landscape-meta"><span className={`question-status ${attemptCount ? "question-status-done" : "question-status-todo"}`}>{attemptCount ? `已做 ${attemptCount} 次` : "未做"}</span><span>{question.year}</span><span>{question.region}</span><span>{questionPaperLevel(question)}</span><span>{difficultyLabel(question)}</span>{paperCount > 1 && <em>整卷 {paperCount} 题 · {question.materials.length} 则材料</em>}{similar.length > 0 && paperCount === 1 && <em>同材料 {similar.length} 题</em>}</div><h2>{question.title}</h2><p>{question.prompt}</p>{nearestSimilar && paperCount === 1 && <div className="question-similarity-note"><strong>同组材料</strong><span>与“{questionTitleById.get(nearestSimilar.questionId) ?? "其他题目"}”使用相同材料，可按不同问法对比训练。</span></div>}<div className="question-landscape-tags">{tags.map(tag => <span key={tag}>#{tag}</span>)}{question.tags.length > tags.length && <span>+{question.tags.length - tags.length}</span>}</div></div>
          <aside className="question-landscape-actions"><button className="primary" onClick={() => onStart(question)}>{attemptCount ? "再次训练" : "开始训练"}<ChevronRight size={15}/></button><button onClick={() => onDeepRead(question)}><Sparkles size={13}/>AI精读</button><button className={hasNote ? "has-note" : ""} onClick={() => void openNote(question)}><FileText size={13}/>{hasNote ? "查看笔记" : "写笔记"}</button>{publicQuestion && <button onClick={() => void toggleSource(question.id)} disabled={sourceLoadingId !== null}><Info size={13}/>{sourceLoadingId === question.id ? "读取来源…" : detail ? "收起来源" : "查看来源"}</button>}</aside>
          {detail && <div className="question-source-detail question-landscape-source">{detail.source ? <><div><strong>{detail.source.sourceName ?? "公开来源"}</strong><span>{detail.source.sourceTitle ?? question.title}</span></div>{detail.source.sourceUrl ? <a href={detail.source.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink size={13}/>查看原始整卷</a> : null}{detail.source.isRecallVersion && <small>该来源为网友/考生回忆版本。</small>}</> : <span>没有读取到这道题的来源记录。</span>}</div>}
        </article>;
      })}</section>
      {filtered.length > QUESTION_PAGE_SIZE && <div className="question-library-pager"><span>第 {currentPage}/{totalPages} 页 · 每页 {QUESTION_PAGE_SIZE} 道</span><div><button className="secondary" disabled={currentPage <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}>上一页</button><button className="secondary" disabled={currentPage >= totalPages} onClick={() => setPage(value => Math.min(totalPages, value + 1))}>下一页</button></div></div>}
      {!filtered.length && <div className="public-library-empty">当前专项没有符合条件的题目。可以清除年份/地区/难度筛选，或到“自动补全题库”继续补题。</div>}
    </> : <PublicExamBrowser onImported={finishPublicImport}/>}
    {noteEditor && <div className="question-note-backdrop" role="dialog" aria-modal="true" aria-label="我的题目笔记"><div className="question-note-dialog"><header><div><span>我的笔记</span><strong>{noteEditor.question.title}</strong><small>{noteEditor.question.type} · {noteEditor.question.year} · {noteEditor.question.region}</small></div><button className="text-button" disabled={noteEditor.saving} onClick={() => setNoteEditor(null)}>关闭</button></header><textarea value={noteEditor.value} onChange={event => setNoteEditor(current => current ? { ...current, value: event.target.value } : current)} disabled={noteEditor.loading || noteEditor.saving} placeholder={noteEditor.loading ? "正在读取笔记…" : "记录自己的审题思路、踩坑点、得分词、重做提醒……"}/><footer><span>{noteEditor.value.length} 字 · 仅保存在你的本地题库数据中</span><button className="primary" disabled={noteEditor.loading || noteEditor.saving} onClick={() => void persistNote()}>{noteEditor.saving ? "保存中…" : "保存笔记"}</button></footer></div></div>}
  </main>;
}
