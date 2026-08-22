import { useEffect, useMemo, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { CircleAlert, ExternalLink, Globe2, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { discoverProviderCandidates } from "./publicSourceDiscovery";
import { PUBLIC_SOURCE_PROVIDERS } from "./publicSourceProviders";
import { publicSourceStore, type PublicSourceCandidate } from "./publicSourceStore";
import "./publicSourceCatalog.css";

function providerCount(candidates: PublicSourceCandidate[], providerId: string): number {
  return candidates.filter(item => item.providerId === providerId).length;
}

export default function PublicSourceCatalogSection() {
  const desktop = isTauri();
  const [candidates, setCandidates] = useState<PublicSourceCandidate[]>([]);
  const [busyProvider, setBusyProvider] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("公开来源目录尚未扫描。来源正文不会打包进 GitHub 仓库。");

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
    if (busyProvider) return;
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

  return <section className="settings-section public-source-section">
    <div className="settings-section-heading">
      <div>
        <h2>公开真题来源</h2>
        <p>用公开索引发现历年申论来源，先保存元数据和原始 URL；正文按需在本机抓取、解析并核验后进入正式题库。</p>
      </div>
      <div className="public-source-security"><ShieldCheck size={17}/><span>{desktop ? "桌面受限抓取器可用" : "浏览器目录预览"}</span></div>
    </div>

    <div className="public-source-status"><CircleAlert size={15}/><span>{status}</span></div>

    <div className="source-provider-grid">
      {PUBLIC_SOURCE_PROVIDERS.map(provider => <article className="source-provider-card" key={provider.id}>
        <header><Globe2 size={17}/><div><strong>{provider.name}</strong><span>{provider.coverage}</span></div></header>
        <p>{provider.notes}</p>
        <footer>
          <span>候选 {providerCount(candidates, provider.id)} 条</span>
          <button className="secondary" disabled={busyProvider !== null} onClick={() => void scanProvider(provider.id)}><RefreshCw size={14}/>{busyProvider === provider.id ? "扫描中…" : "扫描索引"}</button>
        </footer>
      </article>)}
    </div>

    {!desktop && <div className="settings-warning">浏览器预览受第三方 CORS 限制，部分来源扫描会失败；Tauri 桌面版使用 allow-list 抓取器，只允许已登记的公考来源域名。</div>}

    <div className="public-source-toolbar">
      <div className="search-box"><Search size={16}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="筛选年份、地区、卷别或标题"/></div>
      <span>{filtered.length} / {candidates.length} 条</span>
    </div>

    <div className="public-source-list">
      {filtered.slice(0, 80).map(item => <article className="public-source-row" key={item.id}>
        <div className="public-source-main"><strong>{item.title}</strong><div>{item.year ? <span>{item.year}</span> : null}{item.region ? <span>{item.region}</span> : null}{item.paperVariant ? <span>{item.paperVariant}</span> : null}<span>{item.status}</span>{item.metadata?.recallVersion ? <span className="recall">回忆版</span> : null}</div></div>
        <a href={item.sourceUrl} target="_blank" rel="noreferrer" title="打开原始公开来源"><ExternalLink size={15}/></a>
      </article>)}
      {!filtered.length && <div className="public-source-empty">还没有来源候选。扫描一个已登记来源后，这里会出现按 URL 去重的申论真题来源。</div>}
      {filtered.length > 80 && <div className="public-source-more">当前只显示前 80 条；后续题库页会提供分页与地区/年份筛选。</div>}
    </div>
  </section>;
}
