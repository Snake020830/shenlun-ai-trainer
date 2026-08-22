import { useEffect, useMemo, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { BookOpen, ChevronRight, Download, ExternalLink, Eye, FileText, Globe2, Info, Plus, RefreshCw, Search } from "lucide-react";
import { groupPublicExamCandidates } from "./publicExamCatalog";
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

function sourceVariantLabel(candidate: PublicSourceCandidate): string {
  if (candidate.status === "imported") return "已入库版本";
  if (candidate.metadata?.recallVersion) return "回忆版本";
  if (/(站友|网友|考生).*(提供|整理)|站友提供/.test(candidate.title)) return "用户提供版本";
  return "公开版本";
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
      const discovered = await discoverProviderCandidates(provider);
      await reload();
      const groupCount = groupPublicExamCandidates(discovered).length;
      setStatus(`目录更新完成：识别 ${groupCount} 套近10年申论整卷、${discovered.length} 个公开版本；同卷多版本已分组，不会重复占满题库。`);
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
      setStatus(`已导入：新增 ${result.newlyImportedQuestionIds.length} 道题${result.reusedQuestionIds.length ? `，已有 ${result.reusedQuestionIds.length} 道直接复用` : ""}。同卷其他公开版本仍保留用于来源核对，不会自动重复导入。`);
      setPreview(null);
      setConfirmed(false);
      setExpandedGroupKey(null);
      await onImported();
    } catch (error) {
      console.error("Failed to import public exam.", error);
      setStatus(error instanceof Error ? error.message : "整卷导入失败。");
    } finally {
      setBusy(null);
    }
  }

  const groups = useMemo(() => groupPublicExamCandidates(candidates), [candidates]);
  const options = useMemo(() => ({
    years: [...new Set(groups.map(item => item.year))].sort((a, b) => b - a),
    regions: [...new Set(groups.map(item => item.region).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"))
  }), [groups]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return groups.filter(group => {
      if (yearFilter !== "all" && String(group.year) !== yearFilter) return false;
      if (regionFilter !== "all" && group.region !== regionFilter) return false;
      if (!needle) return true;
      return group.members.some(item => `${item.title} ${item.paperVariant ?? ""} ${item.region ?? ""}`.toLowerCase().includes(needle));
    });
  }, [groups, query, regionFilter, yearFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PUBLIC_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const rows = filtered.slice((currentPage - 1) * PUBLIC_PAGE_SIZE, currentPage * PUBLIC_PAGE_SIZE);
  const importable = preview ? canImportParsedPublicExam(preview.exam) : false;

  return <div className="public-library-browser">
    <div className="public-library-intro">
      <div><Globe2 size={20}/><div><strong>公开申论整卷 · 近10年</strong><span>{yearRange.minYear}—{yearRange.maxYear}。同一套卷的多个公开版本合并显示；完整材料只在你预览某个版本时读取。</span></div></div>
      <button className="secondary" disabled={!desktop || busy !== null} onClick={() => void scanPrimaryCatalog()}><RefreshCw size={15}/>{busy === "scan" ? "更新中…" : candidates.length ? "更新目录" : "获取公开目录"}</button>
    </div>
    {!desktop && <div className="library-runtime-note">浏览器预览不能跨站抓取公开真题。正式目录更新和整卷导入在 Tauri 桌面版执行；这里仍可验收布局。</div>}
    <div className="library-status">{status}</div>

    <div className="public-library-filters">
      <div className="search-box"><Search size={16}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索国考、省考、年份或卷别"/></div>
      <select value={yearFilter} onChange={event => setYearFilter(event.target.value)}><option value="all">近10年全部年份</option>{options.years.map(year => <option key={year} value={year}>{year}</option>)}</select>
      <select value={regionFilter} onChange={event => setRegionFilter(event.target.value)}><option value="all">全部地区</option>{options.regions.map(region => <option key={region} value={region}>{region}</option>)}</select>
      <span>{filtered.length} 套 · {candidates.length} 个版本</span>
    </div>

    <div className="public-exam-cards">
      {rows.map(group => {
        const item = group.preferred;
        const expanded = expandedGroupKey === group.key;
        return <article className="public-exam-card" key={group.key}>
          <div className="public-exam-card-heading">
            <div>
              <strong>{item.title}</strong>
              <div>{item.year && <span>{item.year}</span>}{item.region && <span>{item.region}</span>}{item.paperVariant && <span>{item.paperVariant}</span>}<span className="preferred">推荐版本</span>{item.metadata?.recallVersion && <span className="recall">回忆来源</span>}{group.hasImportedVersion && <span className="imported">已有版本入库</span>}{group.alternatives.length > 0 && <button className="variant-toggle" onClick={() => setExpandedGroupKey(expanded ? null : group.key)}>{expanded ? "收起版本" : `另有 ${group.alternatives.length} 个版本`}</button>}</div>
            </div>
            <button disabled={!desktop || busy !== null || group.hasImportedVersion} onClick={() => void openPreview(item)}><Eye size={14}/>{busy === item.id ? "读取中" : group.hasImportedVersion ? "已有版本入库" : "预览推荐版"}</button>
          </div>
          {expanded && <div className="public-exam-variants">{group.alternatives.map(alternative => <div key={alternative.id}><div><strong>{alternative.title}</strong><span>{sourceVariantLabel(alternative)}</span></div><div>{!group.hasImportedVersion && <button disabled={!desktop || busy !== null} onClick={() => void openPreview(alternative)}><Eye size={13}/>{busy === alternative.id ? "读取中" : "预览此版本"}</button>}<a href={alternative.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink size={13}/>原页面</a></div></div>)}</div>}
        </article>;
      })}
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
    <header className="page-header compact"><div><p className="eyebrow">题库</p><h1>真题先核验，再进入训练</h1><p>已入库题目可以直接作答；公开整卷只保留最近10年目录，同一套卷的多个公开版本会合并显示。</p></div><button className="primary" onClick={onImport}><Plus size={16}/>手工导入</button></header>

    <div className="library-tabs"><button className={tab === "ready" ? "active" : ""} onClick={() => setTab("ready")}><BookOpen size={16}/>已入库题目 <span>{allQuestions.length}</span></button><button className={tab === "public" ? "active" : ""} onClick={() => setTab("public")}><Globe2 size={16}/>近10年公开整卷</button></div>

    {tab === "ready" ? <>
      <div className="toolbar"><div className="search-box"><Search size={17}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索题目、题型或标签"/></div><span className="library-count">{filtered.length} 题</span></div>
      <div className="question-grid">{filtered.map(question => {
        const publicQuestion = isPublicImportedQuestion(question);
        const detail = sourceDetail?.questionId === question.id ? sourceDetail : null;
        return <article className="question-card" key={question.id}>
          <div className="question-top"><span className="library-difficulty">{difficultyLabel(question)}</span><span>{publicQuestion ? `公开真题 · ${question.year} · ${question.region}` : question.source === "local" ? `${question.year} · ${question.region}` : "功能演示"}</span></div>
          <h3>{question.title}</h3>
          <p>{question.prompt}</p>
          <div className="tag-row">{question.tags.map(tag => <span key={tag}>#{tag}</span>)}</div>
          {publicQuestion && <div className="question-source-row"><button type="button" onClick={() => void toggleSource(question.id)} disabled={sourceLoadingId !== null}><Info size={13}/>{sourceLoadingId === question.id ? "读取来源…" : detail ? "收起来源" : "来源"}</button>{question.tags.includes("回忆版") && <span>回忆版</span>}</div>}
          {detail && <div className="question-source-detail">{detail.source ? <><div><strong>{detail.source.sourceName ?? "公开来源"}</strong><span>{detail.source.sourceTitle ?? question.title}</span></div>{detail.source.sourceUrl ? <a href={detail.source.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink size={13}/>查看原始整卷</a> : null}{detail.source.isRecallVersion && <small>该来源标记为网友/考生回忆版本，训练时保留此标识。</small>}</> : <span>没有读取到这道题的来源记录。</span>}</div>}
          <footer><span><FileText size={14}/>{question.type} · {question.score} 分 · {question.wordLimit} 字</span><button onClick={() => onStart(question)}>开始训练 <ChevronRight size={16}/></button></footer>
        </article>;
      })}</div>
      {!filtered.length && <div className="public-library-empty">没有符合条件的已入库题目。</div>}
    </> : <PublicExamBrowser onImported={finishPublicImport}/>}
  </main>;
}
