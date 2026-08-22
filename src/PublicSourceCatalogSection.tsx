import { useEffect, useMemo, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { CheckCircle2, Download, ExternalLink, Eye, Globe2, RefreshCw, Search, ShieldCheck, X } from "lucide-react";
import { canImportParsedPublicExam } from "./publicExamParser";
import { importPublicExam, previewPublicExam, type PublicExamPreview } from "./publicExamImporter";
import { discoverProviderCandidates } from "./publicSourceDiscovery";
import { PUBLIC_SOURCE_PROVIDERS } from "./publicSourceProviders";
import { publicSourceStore, type PublicSourceCandidate } from "./publicSourceStore";
import "./publicSourceCatalog.css";

function providerCount(candidates: PublicSourceCandidate[], providerId: string): number {
  return candidates.filter(item => item.providerId === providerId).length;
}

function providerSupportsStructuredImport(candidate: PublicSourceCandidate): boolean {
  return candidate.providerId === "gkzhenti-public" && candidate.sourceKind === "public-web";
}

export default function PublicSourceCatalogSection() {
  const desktop = isTauri();
  const [candidates, setCandidates] = useState<PublicSourceCandidate[]>([]);
  const [busyProvider, setBusyProvider] = useState<string | null>(null);
  const [busyCandidate, setBusyCandidate] = useState<string | null>(null);
  const [query, setQuery] = useState("");
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

  async function scanProvider(providerId: string) {
    if (busyProvider || !desktop) return;
    const provider = PUBLIC_SOURCE_PROVIDERS.find(item => item.id === providerId);
    if (!provider) return;
    setBusyProvider(providerId);
    setStatus(`正在扫描：${provider.name}…`);
    try {
      const discovered = await discoverProviderCandidates(provider);
      await reload();
      setStatus(`扫描完成：${provider.name} 本次发现 ${discovered.length} 条申论来源候选。候选只保存元数据与 URL。`);
    } catch (error) {
      console.error("Public source discovery failed.", error);
      setStatus(error instanceof Error ? error.message : "公开来源扫描失败。");
    } finally {
      setBusyProvider(null);
    }
  }

  async function inspectCandidate(candidate: PublicSourceCandidate) {
    if (!desktop || busyCandidate) return;
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
    if (!preview || !confirmed || busyCandidate) return;
    setBusyCandidate(preview.candidate.id);
    setStatus("正在把整卷中的作答题写入本机正式题库…");
    try {
      const result = await importPublicExam(preview);
      await reload();
      setImportedCount(result.newlyImportedQuestionIds.length);
      setStatus(`整卷导入完成：新增 ${result.newlyImportedQuestionIds.length} 道题${result.reusedQuestionIds.length ? `，复用已存在 ${result.reusedQuestionIds.length} 道` : ""}。重新载入页面后会出现在题库。`);
    } catch (error) {
      console.error("Public exam import failed.", error);
      setStatus(error instanceof Error ? error.message : "整卷导入失败。");
    } finally {
      setBusyCandidate(null);
    }
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return candidates;
    return candidates.filter(item => [
      item.title,
      item.region,
      item.paperVariant,
      item.providerId,
      item.status
    ].filter(Boolean).join(" ").toLowerCase().includes(needle));
  }, [candidates, query]);

  const previewImportable = preview ? canImportParsedPublicExam(preview.exam) : false;

  return <section className="settings-section public-source-section">
    <div className="settings-section-heading">
      <div>
        <h2>公开真题来源</h2>
        <p>用公开索引发现历年申论整卷，先保存元数据和原始 URL；正文按需在本机读取、解析、人工核验后再进入正式题库。</p>
      </div>
      <div className="public-source-security"><ShieldCheck size={17}/><span>{desktop ? "桌面受限抓取器可用" : "浏览器目录预览"}</span></div>
    </div>

    <div className="public-source-status"><CheckCircle2 size={15}/><span>{status}</span></div>

    <div className="source-provider-grid">
      {PUBLIC_SOURCE_PROVIDERS.map(provider => <article className="source-provider-card" key={provider.id}>
        <header><Globe2 size={17}/><div><strong>{provider.name}</strong><span>{provider.coverage}</span></div></header>
        <p>{provider.notes}</p>
        <footer>
          <span>候选 {providerCount(candidates, provider.id)} 条</span>
          <button className="secondary" disabled={!desktop || busyProvider !== null} title={desktop ? "扫描该公开索引" : "真实网络扫描仅在 Tauri 桌面版启用"} onClick={() => void scanProvider(provider.id)}><RefreshCw size={14}/>{busyProvider === provider.id ? "扫描中…" : desktop ? "扫描索引" : "桌面扫描"}</button>
        </footer>
      </article>)}
    </div>

    {!desktop && <div className="settings-warning">当前浏览器预览只用于 UI 验收。批量发现和整卷读取需要 Tauri 桌面版，因为第三方页面通常有 CORS 限制；桌面抓取器也只允许已登记的公考来源域名。</div>}

    <div className="public-source-toolbar">
      <div className="search-box"><Search size={16}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="筛选年份、地区、卷别或标题"/></div>
      <span>{filtered.length} / {candidates.length} 条</span>
    </div>

    <div className="public-source-list">
      {filtered.slice(0, 80).map(item => <article className="public-source-row" key={item.id}>
        <div className="public-source-main"><strong>{item.title}</strong><div>{item.year ? <span>{item.year}</span> : null}{item.region ? <span>{item.region}</span> : null}{item.paperVariant ? <span>{item.paperVariant}</span> : null}<span>{item.status}</span>{item.metadata?.recallVersion ? <span className="recall">回忆版</span> : null}</div></div>
        <div className="public-source-row-actions">
          {providerSupportsStructuredImport(item) && <button disabled={!desktop || busyCandidate !== null} title={desktop ? "读取正文并显示结构化预览" : "整卷读取仅在 Tauri 桌面版启用"} onClick={() => void inspectCandidate(item)}><Eye size={15}/><span>{busyCandidate === item.id ? "读取中" : "预览"}</span></button>}
          <a href={item.sourceUrl} target="_blank" rel="noreferrer" title="打开原始公开来源"><ExternalLink size={15}/></a>
        </div>
      </article>)}
      {!filtered.length && <div className="public-source-empty">还没有来源候选。桌面版扫描一个已登记来源后，这里会出现按 URL 去重的申论整卷。</div>}
      {filtered.length > 80 && <div className="public-source-more">当前只显示前 80 条；正式题库页会继续提供分页与地区/年份筛选。</div>}
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
          {importedCount !== null && <button className="secondary" onClick={() => window.location.reload()}><RefreshCw size={14}/>重新载入题库</button>}
          <button className="primary" disabled={!previewImportable || !confirmed || busyCandidate !== null} onClick={() => void confirmAndImport()}><Download size={15}/>{busyCandidate === preview.candidate.id ? "导入中…" : "确认并导入整卷"}</button>
        </div>
      </footer>
    </section>}
  </section>;
}
