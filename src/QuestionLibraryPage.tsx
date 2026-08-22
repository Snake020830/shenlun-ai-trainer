import { useEffect, useMemo, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { BookOpen, ChevronRight, Download, ExternalLink, Eye, FileText, Globe2, Info, Plus, RefreshCw, Search } from "lucide-react";
import { canImportParsedPublicExam } from "./publicExamParser";
import { importPublicExam, previewPublicExam, type PublicExamPreview } from "./publicExamImporter";
import { discoverProviderCandidates, getPublicExamYearRange, isRecentPublicExamYear } from "./publicSourceDiscovery";
import { getPublicSourceProvider } from "./publicSourceProviders";
import { publicSourceStore, type PublicSourceCandidate, type QuestionSourceProvenance } from "./publicSourceStore";
import type { Question } from "./types";
import "./questionLibrary.css";

const PRIMARY_PROVIDER_ID = "gkzhenti-public";
const PUBLIC_PAGE_SIZE = 30;

type LibraryTab = "ready" | "public";

function difficultyLabel(question: Question): string {
  return question.difficulty;
}

function isPublicImportedQuestion(question: Question): boolean {
  return question.id.startsWith("publicq:");
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
  const [status, setStatus] = useState(`只加载近10年（${yearRange.minYear}—${yearRange.maxYear}）公开整卷目录；正文在你选择某一卷时才读取。`);
  const [preview, setPreview] = useState<PublicExamPreview | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  async function reload() {
    const rows = await publicSourceStore.listCandidates();
    setCandidates(rows.filter(item => item.providerId === PRIMARY_PROVIDER_ID && isRecentPublicExamYear(item.year)));
  }

  useEffect(() => {
    void reload().catch(error => {
      console.error("Failed to load public exam catalog.", error);
      setStatus("无法读取本机公开真题目录。");
    });
  }, []);

  useEffect(() => { setPage(1); }, [query, yearFilter, regionFilter]);

  async function scanPrimaryCatalog() {
    if (!desktop || busy) return;
    const provider = getPublicSourceProvider(PRIMARY_PROVIDER_ID);
    if (!provider) return;
    setBusy("scan");
    setStatus(`正在更新 ${yearRange.minYear}—${yearRange.maxYear} 公开申论整卷目录；只保存标题、年份、地区、卷别和原始 URL…`);
    try {
      const rows = await discoverProviderCandidates(provider);
      await reload();
      setStatus(`目录更新完成：当前主来源识别 ${rows.length} 套近10年申论整卷。重复来源已自动去重。`);
    } catch (error) {
      console.error("Failed to scan primary public exam catalog.", error);
      setStatus(error instanceof Error ? error.message : "公开真题目录更新失败。");
    } finally {
      setBusy(null);
    }
  }

  async function openPreview(candidate: PublicSourceCandidate) {
    if (!desktop || busy) return;
    setBusy(candidate.id);
    setConfirmed(false);
    setStatus(`正在读取整卷：${candidate.title}`);
    try {
      const next = await previewPublicExam(candidate);
      setPreview(next);
      setStatus(canImportParsedPublicExam(next.exam)
        ? `已识别 ${next.exam.materials.length} 则材料、${next.exam.tasks.length} 道题。核对结构后即可导入。`
        : "这套卷仍有未解决的解析警告，当前不会写入正式题库。"
      );
    } catch (error) {
      console.error("Failed to preview public exam.", error);
      setStatus(error instanceof Error ? error.message : "整卷预览失败。");
    } finally {
      setBusy(null);
    }
  }

  async function importExam() {
    if (!preview || !confirmed || busy) return;
    setBusy(preview.candidate.id);
    try {
      const result = await importPublicExam(preview);
      await reload();
      setStatus(`已导入：新增 ${result.newlyImportedQuestionIds.length} 道题${result.reusedQuestionIds.length ? `，已有 ${result.reusedQuestionIds.length} 道直接复用` : ""}。`);
      setPreview(null);
      setConfirmed(false);
      await onImported();
    } catch (error) {
      console.error("Failed to import public exam.", error);
      setStatus(error instanceof Error ? error.message : "整卷导入失败。");
    } finally {
      setBusy(null);
    }
  }

  const options = useMemo(() => ({
    years: [...new Set(candidates.map(item => item.year).filter((value): value is number => typeof value === "number"))].sort((a, b) => b - a),
    regions: [...new Set(candidates.map(item => item.region).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, "zh-CN"))
  }), [candidates]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return candidates.filter(item => {
      if (yearFilter !== "all" && String(item.year ?? "") !== yearFilter) return false;
      if (regionFilter !== "all" && item.region !== regionFilter) return false;
      if (!needle) return true;
      return `${item.title} ${item.paperVariant ?? ""} ${item.region ?? ""}`.toLowerCase().includes(needle);
    });
  }, [candidates, query, regionFilter, yearFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PUBLIC_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const rows = filtered.slice((currentPage - 1) * PUBLIC_PAGE_SIZE, currentPage * PUBLIC_PAGE_SIZE);
  const importable = preview ? canImportParsedPublicExam(preview.exam) : false;

  return <div className="public-library-browser">
    <div className="public-library-intro">
      <div><Globe2 size={20}/><div><strong>公开申论整卷 · 近10年</strong><span>{yearRange.minYear}—{yearRange.maxYear}。目录元数据在本机缓存；完整材料只在你预览并确认一套卷时读取。</span></div></div>
      <button className="secondary" disabled={!desktop || busy !== null} onClick={() => void scanPrimaryCatalog()}><RefreshCw size={15}/>{busy === "scan" ? "更新中…" : candidates.length ? "更新目录" : "获取公开目录"}</button>
    </div>
    {!desktop && <div className="library-runtime-note">浏览器预览不能跨站抓取公开真题。正式目录更新和整卷导入在 Tauri 桌面版执行；这里仍可验收布局。</div>}
    <div className="library-status">{status}</div>

    <div className="public-library-filters">
      <div className="search-box"><Search size={16}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索国考、省考、年份或卷别"/></div>
      <select value={yearFilter} onChange={event => setYearFilter(event.target.value)}><option value="all">近10年全部年份</option>{options.years.map(year => <option key={year} value={year}>{year}</option>)}</select>
      <select value={regionFilter} onChange={event => setRegionFilter(event.target.value)}><option value="all">全部地区</option>{options.regions.map(region => <option key={region} value={region}>{region}</option>)}</select>
      <span>{filtered.length} 套</span>
    </div>

    <div className="public-exam-cards">
      {rows.map(item => <article className="public-exam-card" key={item.id}>
        <div className="public-exam-card-heading"><div><strong>{item.title}</strong><div>{item.year && <span>{item.year}</span>}{item.region && <span>{item.region}</span>}{item.paperVariant && <span>{item.paperVariant}</span>}{item.metadata?.recallVersion && <span className="recall">回忆来源</span>}{item.status === "imported" && <span className="imported">已入库</span>}</div></div><button disabled={!desktop || busy !== null || item.status === "imported"} onClick={() => void openPreview(item)}><Eye size={14}/>{busy === item.id ? "读取中" : item.status === "imported" ? "已导入" : "预览整卷"}</button></div>
      </article>)}
      {!rows.length && <div className="public-library-empty">{candidates.length ? "没有符合筛选条件的整卷。" : `尚未获取 ${yearRange.minYear}—${yearRange.maxYear} 公开整卷目录。桌面版点击“获取公开目录”后即可按年份和地区浏览。`}</div>}
    </div>

    {filtered.length > 0 && <div className="public-library-pager"><span>第 {currentPage}/{totalPages} 页</span><div><button className="secondary" disabled={currentPage <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}>上一页</button><button className="secondary" disabled={currentPage >= totalPages} onClick={() => setPage(value => Math.min(totalPages, value + 1))}>下一页</button></div></div>}

    {preview && <div className="library-exam-preview">
      <header><div><span>导入前核验</span><h3>{preview.exam.title}</h3><p>{preview.exam.materials.length} 则材料 · {preview.exam.tasks.length} 道作答题</p></div><button className="text-button" onClick={() => { setPreview(null); setConfirmed(false); }}>关闭</button></header>
      {preview.exam.warnings.length > 0 && <div className="library-parser-warning">{preview.exam.warnings.join("；")}</div>}
      <div className="library-preview-tasks">{preview.exam.tasks.map(task => <article key={task.taskIndex}><div><strong>第 {task.taskIndex + 1} 题</strong><span>{task.questionType}</span><span>{task.score ?? "?"} 分</span><span>≤ {task.wordLimit ?? "?"} 字</span></div><p>{task.prompt}</p>{task.warnings.length > 0 && <small>{task.warnings.join("；")}</small>}</article>)}</div>
      <footer>{importable ? <label><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/><span>已对照原始页面核对材料数、题数、分值和字数。</span></label> : <span className="blocked">结构校验未通过，禁止自动导入。</span>}<button className="primary" disabled={!importable || !confirmed || busy !== null} onClick={() => void importExam()}><Download size={15}/>{busy === preview.candidate.id ? "导入中…" : "导入整卷所有题"}</button></footer>
    </div>}
  </div>;
}

export default function QuestionLibraryPage({
  allQuestions,
  onStart,
  onImport,
  onRefreshImported
}: {
  allQuestions: Question[];
  onStart: (question: Question) => void;
  onImport: () => void;
  onRefreshImported: () => Promise<void> | void;
}) {
  const [tab, setTab] = useState<LibraryTab>("ready");
  const [query, setQuery] = useState("");
  const [sourceLoadingId, setSourceLoadingId] = useState<string | null>(null);
  const [sourceDetail, setSourceDetail] = useState<{ questionId: string; source: QuestionSourceProvenance | null } | null>(null);
  const filtered = allQuestions.filter(question => `${question.title}${question.type}${question.tags.join("")}`.toLowerCase().includes(query.trim().toLowerCase()));

  async function finishPublicImport() {
    await onRefreshImported();
    setTab("ready");
    setQuery("");
  }

  async function toggleSource(questionId: string) {
    if (sourceDetail?.questionId === questionId) {
      setSourceDetail(null);
      return;
    }
    if (sourceLoadingId) return;
    setSourceLoadingId(questionId);
    try {
      const source = await publicSourceStore.getQuestionSource(questionId);
      setSourceDetail({ questionId, source });
    } catch (error) {
      console.error("Failed to load question source provenance.", error);
      setSourceDetail({ questionId, source: null });
    } finally {
      setSourceLoadingId(null);
    }
  }

  return <main className="page page-wide question-library-page">
    <header className="page-header compact"><div><p className="eyebrow">题库</p><h1>真题先核验，再进入训练</h1><p>已入库题目可以直接作答；公开整卷只保留最近10年目录，选中后按需读取并结构化导入。</p></div><button className="primary" onClick={onImport}><Plus size={16}/>手工导入</button></header>

    <div className="library-tabs"><button className={tab === "ready" ? "active" : ""} onClick={() => setTab("ready")}><BookOpen size={16}/>已入库题目 <span>{allQuestions.length}</span></button><button className={tab === "public" ? "active" : ""} onClick={() => setTab("public")}><Globe2 size={16}/>近10年公开整卷</button></div>

    {tab === "ready" ? <>
      <div className="toolbar"><div className="search-box"><Search size={17}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索题目、题型或标签"/></div><span className="library-count">{filtered.length} 题</span></div>
      <div className="question-grid">{filtered.map(question => {
        const publicQuestion = isPublicImportedQuestion(question);
        const detailOpen = sourceDetail?.questionId === question.id;
        return <article className="question-card" key={question.id}>
          <div className="question-top"><span className="library-difficulty">{difficultyLabel(question)}</span><span>{publicQuestion ? `公开真题 · ${question.year} · ${question.region}` : question.source === "local" ? `${question.year} · ${question.region}` : "功能演示"}</span></div>
          <h3>{question.title}</h3>
          <p>{question.prompt}</p>
          <div className="tag-row">{question.tags.map(tag => <span key={tag}>#{tag}</span>)}</div>
          {publicQuestion && <div className="question-source-row"><button type="button" onClick={() => void toggleSource(question.id)} disabled={sourceLoadingId !== null}><Info size={13}/>{sourceLoadingId === question.id ? "读取来源…" : detailOpen ? "收起来源" : "来源"}</button>{question.tags.includes("回忆版") && <span>回忆版</span>}</div>}
          {detailOpen && <div className="question-source-detail">{sourceDetail.source ? <><div><strong>{sourceDetail.source.sourceName ?? "公开来源"}</strong><span>{sourceDetail.source.sourceTitle ?? question.title}</span></div>{sourceDetail.source.sourceUrl ? <a href={sourceDetail.source.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink size={13}/>查看原始整卷</a> : null}{sourceDetail.source.isRecallVersion && <small>该来源标记为网友/考生回忆版本，训练时保留此标识。</small>}</> : <span>没有读取到这道题的来源记录。</span>}</div>}
          <footer><span><FileText size={14}/>{question.type} · {question.score} 分 · {question.wordLimit} 字</span><button onClick={() => onStart(question)}>开始训练 <ChevronRight size={16}/></button></footer>
        </article>;
      })}</div>
      {!filtered.length && <div className="public-library-empty">没有符合条件的已入库题目。</div>}
    </> : <PublicExamBrowser onImported={finishPublicImport}/>}
  </main>;
}
