import { useEffect, useMemo, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { CheckCircle2, Download, ExternalLink, Eye, Globe2, ListChecks, RefreshCw, Search, ShieldCheck, X } from "lucide-react";
import {
  auditPublicExamCandidates,
  importAuditedPublicExams,
  isAuditedImportableCandidate,
  summarizePublicExamAudit,
  summarizePublicExamImport
} from "./publicExamBatch";
import { canImportParsedPublicExam } from "./publicExamParser";
import { importPublicExam, previewPublicExam, type PublicExamPreview } from "./publicExamImporter";
import { discoverProviderCandidates, getPublicExamYearRange, isRecentPublicExamYear } from "./publicSourceDiscovery";
import { getPublicSourceProvider, PUBLIC_SOURCE_PROVIDERS, type PublicSourceRole } from "./publicSourceProviders";
import { publicSourceStore, type PublicSourceCandidate, type PublicSourceStatus } from "./publicSourceStore";
import "./publicSourceCatalog.css";

const PAGE_SIZE = 40;

const ROLE_LABELS: Record<PublicSourceRole, string> = {
  "primary-structured": "主结构化来源",
  "cross-check": "交叉核验",
  "discovery-only": "仅发现"
};

const STATUS_LABELS: Record<PublicSourceStatus, string> = {
  discovered: "待核验",
  reviewed: "已核验",
  imported: "已导入",
  rejected: "已排除"
};

function providerCount(candidates: PublicSourceCandidate[], providerId: string): number {
  return candidates.filter(item => item.providerId === providerId).length;
}

function providerSupportsStructuredImport(candidate: PublicSourceCandidate): boolean {
  return getPublicSourceProvider(candidate.providerId)?.role === "primary-structured" && candidate.sourceKind === "public-web";
}

export default function PublicSourceCatalogSection() {
  const desktop = isTauri();
  const yearRange = getPublicExamYearRange();
  const primaryProvider = PUBLIC_SOURCE_PROVIDERS.find(item => item.role === "primary-structured");
  const [candidates, setCandidates] = useState<PublicSourceCandidate[]>([]);
  const [busyProvider, setBusyProvider] = useState<string | null>(null);
  const [busyCandidate, setBusyCandidate] = useState<string | null>(null);
  const [batchMode, setBatchMode] = useState<"audit" | "import" | null>(null);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number; title: string } | null>(null);
  const [query, setQuery] = useState("");
  const [providerFilter, setProviderFilter] = useState("all");
  const [regionFilter, setRegionFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("公开来源目录尚未扫描。来源正文不会打包进 GitHub 仓库。");
  const [preview, setPreview] = useState<PublicExamPreview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [importedCount, setImportedCount] = useState<number | null>(null);

  async function reload() {
    setCandidates(await publicSourceStore.listCandidates());
  }

  useEffect(() => {
    void reload().catch(error => {
      console.error("Failed to load public source candidates.", error);
      setStatus("无法读取公开来源候选池。");
    });
  }, []);

  useEffect(() => {
    setPage(1);
  }, [query, providerFilter, regionFilter, yearFilter, statusFilter]);

  async function scanProvider(providerId: string) {
    if (busyProvider || batchMode || !desktop) return;
    const provider = PUBLIC_SOURCE_PROVIDERS.find(item => item.id === providerId);
    if (!provider) return;
    setBusyProvider(providerId);
    setStatus(`正在扫描：${provider.name}…`);
    try {
      const discovered = await discoverProviderCandidates(provider);
      await reload();
      setStatus(`扫描完成：${provider.name} 本次识别 ${discovered.length} 条申论整卷来源。重复 URL 已去重，既有人工状态不会被重置。`);
    } catch (error) {
      console.error("Public source discovery failed.", error);
      setStatus(error instanceof Error ? error.message : "公开来源扫描失败。");
    } finally {
      setBusyProvider(null);
    }
  }

  async function inspectCandidate(candidate: PublicSourceCandidate) {
    if (!desktop || busyCandidate || batchMode) return;
    setBusyCandidate(candidate.id);
    setStatus(`正在读取并解析：${candidate.title}`);
    setConfirmed(false);
    setImportedCount(null);
    try {
      const nextPreview = await previewPublicExam(candidate);
      setPreview(nextPreview);
      const importable = canImportParsedPublicExam(nextPreview.exam);
      setStatus(importable
        ? `解析完成：识别 ${nextPreview.exam.materials.length} 则材料、${nextPreview.exam.tasks.length} 道作答题。请人工核对后再导入。`
        : "解析完成，但仍有结构警告。当前禁止自动写入正式题库。"
      );
    } catch (error) {
      console.error("Public exam preview failed.", error);
      setStatus(error instanceof Error ? error.message : "公开整卷读取失败。");
    } finally {
      setBusyCandidate(null);
    }
  }

  async function confirmAndImport() {
    if (!preview || !confirmed || busyCandidate || batchMode) return;
    setBusyCandidate(preview.candidate.id);
    setStatus("正在把整卷中的作答题写入本机正式题库…");
    try {
      const result = await importPublicExam(preview);
      await reload();
      setImportedCount(result.newlyImportedQuestionIds.length);
      setStatus(`整卷导入完成：新增 ${result.newlyImportedQuestionIds.length} 道题${result.reusedQuestionIds.length ? `，复用已存在 ${result.reusedQuestionIds.length} 道` : ""}。每道题均保留整卷完整材料和来源追溯。`);
    } catch (error) {
      console.error("Public exam import failed.", error);
      setStatus(error instanceof Error ? error.message : "整卷导入失败。");
    } finally {
      setBusyCandidate(null);
    }
  }

  const primaryRecentCandidates = useMemo(() => candidates.filter(item =>
    item.providerId === primaryProvider?.id
    && providerSupportsStructuredImport(item)
    && isRecentPublicExamYear(item.year)
  ), [candidates, primaryProvider?.id]);
  const auditedReadyCount = useMemo(() => primaryRecentCandidates.filter(isAuditedImportableCandidate).length, [primaryRecentCandidates]);

  async function batchAuditRecent() {
    if (!desktop || batchMode || busyProvider || busyCandidate || !primaryProvider) return;
    const queue = primaryRecentCandidates.filter(item => item.status !== "imported" && item.status !== "rejected");
    if (!queue.length) {
      setStatus("当前近10年主来源没有待校验整卷。先扫描主来源目录，或目录中的卷已经全部处理。");
      return;
    }
    setBatchMode("audit");
    setBatchProgress({ done: 0, total: queue.length, title: queue[0]?.title ?? "" });
    setStatus(`开始批量校验 ${queue.length} 套 ${yearRange.minYear}—${yearRange.maxYear} 公开整卷。请求串行限速，只记录解析结果，不保存网页全文。`);
    try {
      const results = await auditPublicExamCandidates(queue, {
        delayMs: 500,
        onProgress: progress => setBatchProgress({ done: progress.index, total: progress.total, title: progress.current.title })
      });
      const summary = summarizePublicExamAudit(results);
      await reload();
      setStatus(`批量校验完成：${summary.ready} 套结构完整可导入，${summary.blocked} 套被 parser warning 阻断，${summary.error} 套网络/解析错误，${summary.skipped} 套跳过。`);
    } catch (error) {
      console.error("Recent public exam batch audit failed.", error);
      setStatus(error instanceof Error ? error.message : "批量校验失败。");
    } finally {
      setBatchMode(null);
      setBatchProgress(null);
    }
  }

  async function batchImportReviewed() {
    if (!desktop || batchMode || busyProvider || busyCandidate) return;
    const queue = primaryRecentCandidates.filter(isAuditedImportableCandidate);
    if (!queue.length) {
      setStatus("当前没有已通过批量结构校验、等待导入的近10年整卷。");
      return;
    }
    const confirmedBatch = window.confirm(`将重新读取并导入 ${queue.length} 套已通过结构校验的公开整卷。每套卷会拆成多道训练题并保留完整材料。继续吗？`);
    if (!confirmedBatch) return;

    setBatchMode("import");
    setBatchProgress({ done: 0, total: queue.length, title: queue[0]?.title ?? "" });
    setStatus(`开始导入 ${queue.length} 套已校验整卷。导入前会再次抓取和解析，网页若发生变化将自动跳过。`);
    try {
      const results = await importAuditedPublicExams(queue, {
        delayMs: 500,
        onProgress: progress => setBatchProgress({ done: progress.index, total: progress.total, title: progress.current.title })
      });
      const summary = summarizePublicExamImport(results);
      await reload();
      setStatus(`批量导入完成：${summary.imported} 套成功，共形成/复用 ${summary.questionCount} 道训练题；${summary.error} 套失败，${summary.skipped} 套跳过。`);
    } catch (error) {
      console.error("Recent public exam batch import failed.", error);
      setStatus(error instanceof Error ? error.message : "批量导入失败。");
    } finally {
      setBatchMode(null);
      setBatchProgress(null);
    }
  }

  const filterOptions = useMemo(() => ({
    years: [...new Set(candidates.map(item => item.year).filter((value): value is number => typeof value === "number"))].sort((a, b) => b - a),
    regions: [...new Set(candidates.map(item => item.region).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, "zh-CN"))
  }), [candidates]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return candidates.filter(item => {
      if (providerFilter !== "all" && item.providerId !== providerFilter) return false;
      if (regionFilter !== "all" && item.region !== regionFilter) return false;
      if (yearFilter !== "all" && String(item.year ?? "") !== yearFilter) return false;
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (!needle) return true;
      return [item.title, item.region, item.paperVariant, item.providerId, item.status]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [candidates, providerFilter, query, regionFilter, statusFilter, yearFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const previewImportable = preview ? canImportParsedPublicExam(preview.exam) : false;

  return <section className="settings-section public-source-section">
    <div className="settings-section-heading">
      <div>
        <h2>公开真题来源</h2>
        <p>公开索引只负责发现历年申论整卷；正文按需本机读取。正式训练范围只准备滚动最近10年，当前为 {yearRange.minYear}—{yearRange.maxYear}。</p>
      </div>
      <div className="public-source-security"><ShieldCheck size={17}/><span>{desktop ? "桌面受限抓取器可用" : "浏览器目录预览"}</span></div>
    </div>

    <div className="public-source-status"><CheckCircle2 size={15}/><span>{status}</span></div>

    <div className="source-provider-grid">
      {PUBLIC_SOURCE_PROVIDERS.map(provider => <article className={`source-provider-card source-role-${provider.role}`} key={provider.id}>
        <header><Globe2 size={17}/><div><strong>{provider.name}</strong><span>{provider.coverage}</span><em>{ROLE_LABELS[provider.role]}</em></div></header>
        <p>{provider.notes}</p>
        <footer>
          <span>候选 {providerCount(candidates, provider.id)} 条</span>
          <button className="secondary" disabled={!desktop || busyProvider !== null || batchMode !== null} title={desktop ? "扫描该公开索引" : "真实网络扫描仅在 Tauri 桌面版启用"} onClick={() => void scanProvider(provider.id)}><RefreshCw size={14}/>{busyProvider === provider.id ? "扫描中…" : desktop ? "扫描索引" : "桌面扫描"}</button>
        </footer>
      </article>)}
    </div>

    <div className="public-source-batch-panel">
      <div><ListChecks size={18}/><div><strong>近10年题库批量准备</strong><span>主来源近10年候选 {primaryRecentCandidates.length} 套 · 已校验可导入 {auditedReadyCount} 套。校验与导入都串行限速。</span></div></div>
      <div className="public-source-batch-actions">
        <button className="secondary" disabled={!desktop || batchMode !== null || busyProvider !== null || busyCandidate !== null || !primaryProvider} onClick={() => void batchAuditRecent()}><ListChecks size={14}/>{batchMode === "audit" ? "校验中…" : "批量校验近10年"}</button>
        <button className="primary" disabled={!desktop || batchMode !== null || busyProvider !== null || busyCandidate !== null || auditedReadyCount === 0} onClick={() => void batchImportReviewed()}><Download size={14}/>{batchMode === "import" ? "导入中…" : `导入已校验整卷 (${auditedReadyCount})`}</button>
      </div>
      {batchProgress && <div className="public-source-batch-progress"><div><span style={{ width: `${batchProgress.total ? Math.min(100, (batchProgress.done / batchProgress.total) * 100) : 0}%` }}/></div><small>{batchProgress.done} / {batchProgress.total} · {batchProgress.title}</small></div>}
    </div>

    {!desktop && <div className="settings-warning">当前浏览器预览只用于 UI 验收。批量发现、校验和整卷导入需要 Tauri 桌面版，因为第三方页面通常有 CORS 限制；桌面抓取器只允许已登记的公考来源域名。</div>}

    <div className="public-source-toolbar catalog-filters">
      <div className="search-box"><Search size={16}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索标题、卷别或地区"/></div>
      <select aria-label="来源筛选" value={providerFilter} onChange={event => setProviderFilter(event.target.value)}><option value="all">全部来源</option>{PUBLIC_SOURCE_PROVIDERS.map(provider => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select>
      <select aria-label="年份筛选" value={yearFilter} onChange={event => setYearFilter(event.target.value)}><option value="all">全部年份</option>{filterOptions.years.map(year => <option key={year} value={year}>{year}</option>)}</select>
      <select aria-label="地区筛选" value={regionFilter} onChange={event => setRegionFilter(event.target.value)}><option value="all">全部地区</option>{filterOptions.regions.map(region => <option key={region} value={region}>{region}</option>)}</select>
      <select aria-label="状态筛选" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="all">全部状态</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
    </div>

    <div className="public-source-list">
      {pageItems.map(item => {
        const provider = getPublicSourceProvider(item.providerId);
        return <article className="public-source-row" key={item.id}>
          <div className="public-source-main"><strong>{item.title}</strong><div>{item.year ? <span>{item.year}</span> : null}{item.region ? <span>{item.region}</span> : null}{item.paperVariant ? <span>{item.paperVariant}</span> : null}<span>{STATUS_LABELS[item.status]}</span>{provider ? <span>{ROLE_LABELS[provider.role]}</span> : null}{item.metadata?.recallVersion ? <span className="recall">回忆版</span> : null}</div></div>
          <div className="public-source-row-actions">
            {providerSupportsStructuredImport(item) && <button disabled={!desktop || busyCandidate !== null || batchMode !== null} title={desktop ? "读取正文并显示结构化预览" : "整卷读取仅在 Tauri 桌面版启用"} onClick={() => void inspectCandidate(item)}><Eye size={15}/><span>{busyCandidate === item.id ? "读取中" : "预览"}</span></button>}
            <a href={item.sourceUrl} target="_blank" rel="noreferrer" title="打开原始公开来源"><ExternalLink size={15}/></a>
          </div>
        </article>;
      })}
      {!filtered.length && <div className="public-source-empty">没有符合当前筛选条件的整卷来源。</div>}
      {filtered.length > 0 && <div className="public-source-pagination"><span>共 {filtered.length} 套 · 第 {currentPage}/{totalPages} 页</span><div><button className="secondary" disabled={currentPage <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}>上一页</button><button className="secondary" disabled={currentPage >= totalPages} onClick={() => setPage(value => Math.min(totalPages, value + 1))}>下一页</button></div></div>}
    </div>

    {preview && <section className="public-exam-preview">
      <header>
        <div><span>整卷结构预览</span><h3>{preview.exam.title}</h3><p>来源正文尚未进入正式题库。请先核对材料数、题数、分值和字数限制。</p></div>
        <button className="icon-button" onClick={() => { setPreview(null); setConfirmed(false); setImportedCount(null); }}><X size={16}/></button>
      </header>

      <div className="public-exam-summary"><div><span>材料</span><strong>{preview.exam.materials.length}</strong></div><div><span>作答题</span><strong>{preview.exam.tasks.length}</strong></div><div><span>整卷状态</span><strong>{previewImportable ? "结构完整" : "需人工修正"}</strong></div></div>

      {preview.exam.warnings.length > 0 && <div className="public-exam-warnings">{preview.exam.warnings.map(warning => <p key={warning}>{warning}</p>)}</div>}

      <div className="public-exam-preview-grid">
        <div className="public-exam-materials"><h4>材料</h4>{preview.exam.materials.map(material => <article key={material.sourceNumber}><strong>{material.label}</strong><p>{material.content.slice(0, 220)}{material.content.length > 220 ? "…" : ""}</p></article>)}</div>
        <div className="public-exam-tasks"><h4>作答要求</h4>{preview.exam.tasks.map(task => <article key={task.taskIndex}><div><strong>第 {task.taskIndex + 1} 题</strong><span>{task.questionType}</span><span>{task.score ?? "?"} 分</span><span>≤ {task.wordLimit ?? "?"} 字</span>{task.materialNumbers.length ? <span>材料 {task.materialNumbers.join("、")}</span> : null}</div><p>{task.prompt}</p>{task.requirements && <small>要求：{task.requirements}</small>}{task.warnings.map(warning => <em key={warning}>{warning}</em>)}</article>)}</div>
      </div>

      <footer className="public-exam-import-footer">
        {previewImportable ? <label><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/><span>我已核对：材料数量、作答题数量、每题分值和字数限制与原始公开卷面一致。</span></label> : <div className="public-exam-blocked">存在未解决的解析警告，本版本不允许绕过校验强行导入。</div>}
        <div>
          {importedCount !== null && <button className="secondary" onClick={() => window.location.reload()}><RefreshCw size={14}/>刷新应用题库</button>}
          <button className="primary" disabled={!previewImportable || !confirmed || busyCandidate !== null || batchMode !== null} onClick={() => void confirmAndImport()}><Download size={15}/>{busyCandidate === preview.candidate.id ? "导入中…" : "确认并导入整卷"}</button>
        </div>
      </footer>
    </section>}
  </section>;
}
