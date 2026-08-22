import { isTauri } from "@tauri-apps/api/core";
import { invoke } from "@tauri-apps/api/core";
import type { PublicSourceProvider } from "./publicSourceProviders";
import { publicSourceStore, type PublicSourceCandidate } from "./publicSourceStore";

export interface PublicSourceFetchResponse {
  url: string;
  contentType?: string | null;
  body: string;
}

const REGION_NAMES = [
  "国家", "北京", "天津", "河北", "山西", "内蒙古", "辽宁", "吉林", "黑龙江", "上海", "江苏", "浙江", "安徽",
  "福建", "江西", "山东", "河南", "湖北", "湖南", "广东", "广西", "海南", "重庆", "四川", "贵州", "云南", "西藏",
  "陕西", "甘肃", "青海", "宁夏", "新疆", "广州", "深圳", "联考"
];

const VARIANT_PATTERNS = [
  "副省级", "省级", "地市级", "市地级", "行政执法", "县乡", "县级", "乡镇", "省市", "A卷", "B卷", "C卷", "通用卷", "普通选调"
];

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stableId(providerId: string, url: string): string {
  let hash = 2166136261;
  const input = `${providerId}|${url}`;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `public-${providerId}-${(hash >>> 0).toString(16)}`;
}

function inferYear(title: string): number | undefined {
  const match = title.match(/(?:20\d{2}|19\d{2})/);
  if (!match) return undefined;
  const year = Number(match[0]);
  return year >= 2000 && year <= 2100 ? year : undefined;
}

function inferRegion(title: string): string | undefined {
  return REGION_NAMES.find(region => title.includes(region));
}

function inferPaperVariant(title: string): string | undefined {
  const matched = VARIANT_PATTERNS.filter(pattern => title.includes(pattern));
  return matched.length ? matched.join("/") : undefined;
}

function looksLikeShenlunTitle(title: string): boolean {
  return title.includes("申论") && /(真题|试卷|考试|公考|公务员|联考|国考|省考|题)/.test(title);
}

function sourceKindFromUrl(url: URL): "public-web" | "public-pdf" {
  return /\.pdf(?:$|[?#])/i.test(url.href) ? "public-pdf" : "public-web";
}

export async function fetchPublicSourceText(url: string): Promise<PublicSourceFetchResponse> {
  if (isTauri()) {
    return invoke<PublicSourceFetchResponse>("fetch_public_source_text", {
      request: { url, timeoutMs: 20_000 }
    });
  }

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "error",
      headers: { Accept: "text/html,application/xhtml+xml,text/plain;q=0.9" }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.text();
    if (body.length > 4 * 1024 * 1024) throw new Error("response exceeded 4 MB");
    return {
      url: response.url || url,
      contentType: response.headers.get("content-type"),
      body
    };
  } catch (error) {
    throw new Error(
      `浏览器预览无法直接读取该公开来源（通常是 CORS 限制）。桌面版会通过受限 Tauri 抓取器读取。${error instanceof Error ? ` ${error.message}` : ""}`
    );
  }
}

export function discoverShenlunCandidatesFromHtml(
  provider: PublicSourceProvider,
  html: string,
  fetchedUrl = provider.indexUrl,
  discoveredAt = new Date().toISOString()
): PublicSourceCandidate[] {
  const document = new DOMParser().parseFromString(html, "text/html");
  const baseUrl = new URL(fetchedUrl);
  const seen = new Set<string>();
  const results: PublicSourceCandidate[] = [];

  for (const anchor of Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
    const title = normalizeWhitespace(anchor.textContent ?? "");
    if (!looksLikeShenlunTitle(title)) continue;

    let url: URL;
    try {
      url = new URL(anchor.getAttribute("href") ?? "", baseUrl);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(url.protocol)) continue;
    url.hash = "";
    const sourceUrl = url.toString();
    if (seen.has(sourceUrl)) continue;
    seen.add(sourceUrl);

    const recallVersion = /(网友|考生|回忆)(?:版|整理)?/.test(title);
    results.push({
      id: stableId(provider.id, sourceUrl),
      providerId: provider.id,
      title,
      sourceUrl,
      ...(inferYear(title) ? { year: inferYear(title) } : {}),
      ...(inferRegion(title) ? { region: inferRegion(title) } : {}),
      ...(inferPaperVariant(title) ? { paperVariant: inferPaperVariant(title) } : {}),
      sourceKind: sourceKindFromUrl(url),
      accessNote: recallVersion ? "标题标记为网友/考生回忆来源。" : "公开可访问来源候选，导入前需核验正文与题型。",
      discoveredAt,
      status: "discovered",
      metadata: {
        originIndexUrl: fetchedUrl,
        recallVersion
      }
    });
  }
  return results;
}

export async function discoverProviderCandidates(provider: PublicSourceProvider): Promise<PublicSourceCandidate[]> {
  const response = await fetchPublicSourceText(provider.indexUrl);
  const candidates = discoverShenlunCandidatesFromHtml(provider, response.body, response.url);
  for (const candidate of candidates) {
    await publicSourceStore.upsertCandidate(candidate);
  }
  return candidates;
}
