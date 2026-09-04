import { fetchPublicSourceText } from "./publicSourceDiscovery";

export type DailyArticleScope = "national" | "regional" | "anhui";
export type DailyArticleRole = "policy" | "case";
export const DAILY_ARTICLE_TARGET = 9;

export interface DailyReadingTheme {
  id: string;
  name: string;
  focus: string;
  keywords: string[];
  readingPrompt: string;
}

export interface DailyNewsArticle {
  id: string;
  title: string;
  url: string;
  source: string;
  providerName: string;
  publishedAt: string;
  scope: DailyArticleScope;
  role: DailyArticleRole;
  content: string;
  summary: string;
  score: number;
}

export interface DailyReadingPlan {
  date: string;
  theme: DailyReadingTheme;
  articles: DailyNewsArticle[];
  generatedAt: string;
  readArticleIds: string[];
}

interface DailyNewsProvider {
  id: string;
  name: string;
  indexUrl: string;
  scope: DailyArticleScope;
  allowedHosts: string[];
}

interface DailyNewsCandidate {
  title: string;
  url: string;
  provider: DailyNewsProvider;
  dateHint?: string;
}

export const DAILY_READING_THEMES: DailyReadingTheme[] = [
  { id: "lawful-enforcement", name: "规范执法与法治政府", focus: "执法权限、程序、裁量、监督与柔性执法", keywords: ["行政执法", "依法行政", "裁量", "执法监督", "柔性执法", "规范执法", "法治政府"], readingPrompt: "找出执法依据、程序约束、服务动作和监督闭环。" },
  { id: "business-market", name: "营商环境与市场监管", focus: "涉企检查、公平竞争、信用监管与服务型执法", keywords: ["营商环境", "市场监管", "涉企", "公平竞争", "信用监管", "企业服务", "经营主体"], readingPrompt: "辨认监管与服务如何统一，以及企业获得感从何而来。" },
  { id: "grassroots-service", name: "基层治理与群众工作", focus: "群众诉求、协同治理、网格服务与基层减负", keywords: ["基层治理", "群众诉求", "12345", "网格", "社区", "基层减负", "协同治理"], readingPrompt: "按“需求发现—协同处置—反馈评价”提炼治理链条。" },
  { id: "livelihood-rights", name: "民生服务与权益保护", focus: "就业、养老、消费、社会保障与公共服务", keywords: ["民生", "公共服务", "消费维权", "就业", "养老", "社会保障", "权益保护"], readingPrompt: "标出群众痛点、服务对象差异和便民举措。" },
  { id: "digital-governance", name: "数字政府与监管创新", focus: "数据协同、非现场监管、智能审批与风险预警", keywords: ["数字政府", "数字化", "数据共享", "非现场监管", "智慧监管", "风险预警", "政务服务"], readingPrompt: "画出数据怎样减少重复检查、提升响应和防控风险。" },
  { id: "ecology-rural", name: "生态治理与乡村振兴", focus: "污染治理、农业农村、生态价值与县域发展", keywords: ["生态", "环境治理", "乡村振兴", "农业农村", "绿色发展", "污染防治", "县域"], readingPrompt: "区分生态问题、治理主体、长效机制与发展成效。" },
  { id: "technology-industry", name: "科技创新与产业升级", focus: "关键技术、产业协同、数字化转型与新质生产力", keywords: ["科技创新", "产业升级", "数字化转型", "新质生产力", "关键技术", "产业链", "智能制造"], readingPrompt: "提取创新场景、协同机制、要素保障与转化成效。" },
  { id: "city-order", name: "城市治理与秩序维护", focus: "交通、夜市、物业、城市更新与精细治理", keywords: ["城市治理", "交通秩序", "夜市", "物业", "城市更新", "停车", "精细化治理"], readingPrompt: "观察规则刚性、执法温度和多主体共治如何平衡。" },
  { id: "culture-industry", name: "文化传承与产业发展", focus: "非遗、文旅、知识产权与产业服务", keywords: ["文化传承", "非遗", "文旅", "知识产权", "产业发展", "文化市场", "创新创业"], readingPrompt: "提取保护与发展的矛盾、运营机制及公共部门作用。" },
  { id: "anhui-practice", name: "安徽实践与区域协同", focus: "安徽基层案例、长三角协同和县域创新", keywords: ["安徽", "长三角", "县域", "一体化", "基层", "改革创新", "皖北"], readingPrompt: "把地方做法提炼为可迁移的主体、机制和成效。" }
];

export const DAILY_NEWS_PROVIDERS: DailyNewsProvider[] = [
  { id: "gov-news", name: "中国政府网·国务院要闻", indexUrl: "https://www.gov.cn/xinwen/index.htm", scope: "national", allowedHosts: ["www.gov.cn", "gov.cn"] },
  { id: "gov-policy", name: "中国政府网·政策", indexUrl: "https://www.gov.cn/zhengce/index.htm", scope: "national", allowedHosts: ["www.gov.cn", "gov.cn"] },
  { id: "gov-headlines", name: "中国政府网·要闻", indexUrl: "https://www.gov.cn/yaowen/liebiao/home_264.htm", scope: "national", allowedHosts: ["www.gov.cn", "gov.cn"] },
  { id: "xinhua-politics", name: "新华网·时政", indexUrl: "https://www.news.cn/politics/60zn/index.htm", scope: "national", allowedHosts: ["www.news.cn", "news.cn"] },
  { id: "xinhua-local", name: "新华网·地方", indexUrl: "https://www.news.cn/local/index.html", scope: "regional", allowedHosts: ["www.news.cn", "news.cn"] },
  { id: "xinhua-yangtze", name: "新华网·长三角", indexUrl: "https://csj.news.cn/index.htm", scope: "regional", allowedHosts: ["csj.news.cn"] },
  { id: "anhui-local", name: "安徽省政府网·安徽要闻", indexUrl: "https://www.ah.gov.cn/zwyw/jryw/index.html", scope: "anhui", allowedHosts: ["www.ah.gov.cn", "ah.gov.cn"] },
  { id: "anhui-focus", name: "安徽省政府网·政策与专题", indexUrl: "https://www.ah.gov.cn/zwyw/index.html", scope: "anhui", allowedHosts: ["www.ah.gov.cn", "ah.gov.cn"] }
];

const ADMIN_KEYWORDS = ["执法", "监管", "治理", "服务", "群众", "企业", "改革", "制度", "机制", "部门", "政策", "安全", "民生", "法治"];
const POLICY_KEYWORDS = ["条例", "办法", "规定", "意见", "通知", "政策", "制度", "规范", "部署", "实施方案", "工作要点"];
const CASE_KEYWORDS = ["探索", "实践", "案例", "一线", "社区", "街道", "县", "村", "窗口", "热线", "现场", "群众"];
const LOW_VALUE_TITLE = /会见|举行会谈|致贺信|出席.{0,8}(活动|会议)|启程|抵达|访问.{0,8}(国家|城市)/;

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getDailyReadingTheme(date = new Date()): DailyReadingTheme {
  const dayNumber = Math.floor(new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() / 86_400_000);
  return DAILY_READING_THEMES[((dayNumber % DAILY_READING_THEMES.length) + DAILY_READING_THEMES.length) % DAILY_READING_THEMES.length];
}

function normalizeText(value: string): string {
  return value.replace(/[\u00a0\s]+/g, " ").trim();
}

function titleSignature(value: string): string {
  return normalizeText(value).replace(/[\s，。、“”‘’：；—《》！？]/g, "").toLowerCase();
}

function stableId(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `daily-news-${(hash >>> 0).toString(16)}`;
}

function countKeywordHits(text: string, keywords: string[]): number {
  return keywords.reduce((sum, keyword) => sum + (text.includes(keyword) ? 1 : 0), 0);
}

function inferRole(text: string): DailyArticleRole {
  const policyHits = countKeywordHits(text, POLICY_KEYWORDS);
  const caseHits = countKeywordHits(text, CASE_KEYWORDS);
  return policyHits > caseHits ? "policy" : "case";
}

function parseDateHint(text: string): string | undefined {
  const match = text.match(/(20\d{2})[-年/.](\d{1,2})[-月/.](\d{1,2})日?/);
  if (!match) return undefined;
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function metaContent(document: Document, name: string): string {
  return normalizeText(document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content ?? "");
}

function firstMetaContent(document: Document, selectors: string[]): string {
  for (const selector of selectors) {
    const value = normalizeText(document.querySelector<HTMLMetaElement>(selector)?.content ?? "");
    if (value) return value;
  }
  return "";
}

function linksFromIndex(provider: DailyNewsProvider, html: string, fetchedUrl: string): DailyNewsCandidate[] {
  const document = new DOMParser().parseFromString(html, "text/html");
  const results: DailyNewsCandidate[] = [];
  const seen = new Set<string>();
  for (const anchor of document.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    const title = normalizeText(anchor.getAttribute("title") || anchor.textContent || "");
    if (title.length < 8 || title.length > 90) continue;
    let url: URL;
    try {
      url = new URL(anchor.getAttribute("href") ?? "", fetchedUrl);
    } catch {
      continue;
    }
    if (url.protocol !== "https:" || !provider.allowedHosts.includes(url.hostname.toLowerCase())) continue;
    if (/\/(?:index|list)\.(?:html?|shtml)$/i.test(url.pathname) || !/\.(?:html?|shtml)$/i.test(url.pathname)) continue;
    url.hash = "";
    const normalizedUrl = url.toString();
    if (seen.has(normalizedUrl)) continue;
    seen.add(normalizedUrl);
    results.push({
      title,
      url: normalizedUrl,
      provider,
      dateHint: parseDateHint(normalizeText(anchor.closest("li")?.textContent ?? anchor.parentElement?.textContent ?? ""))
    });
  }
  return results;
}

function extractArticle(candidate: DailyNewsCandidate, html: string): DailyNewsArticle | null {
  const document = new DOMParser().parseFromString(html, "text/html");
  const contentRoot = document.querySelector(".wzcon, .article-content, .pages_content, .TRS_Editor, #UCAP-CONTENT, article, [role='article'], .article, .content");
  if (!contentRoot) return null;
  const paragraphNodes = Array.from(contentRoot.querySelectorAll("p"));
  const paragraphs = paragraphNodes
    .map(paragraph => normalizeText(paragraph.textContent ?? ""))
    .filter(paragraph => paragraph.length >= 12 && !/^(打印|扫一扫|分享|责任编辑)/.test(paragraph));
  const fallbackParagraphs = paragraphNodes.length >= 2 ? paragraphs : normalizeText(contentRoot.textContent ?? "")
    .split(/\n+/)
    .map(paragraph => normalizeText(paragraph))
    .filter(paragraph => paragraph.length >= 12 && !/^(打印|扫一扫|分享|责任编辑)/.test(paragraph));
  const content = [...new Set(fallbackParagraphs)].join("\n\n").slice(0, 16_000);
  if (content.length < 260) return null;
  const title = metaContent(document, "ArticleTitle")
    || firstMetaContent(document, ["meta[property='og:title']", "meta[name='title']"])
    || normalizeText(document.querySelector("h1")?.textContent ?? "")
    || candidate.title;
  const source = metaContent(document, "ContentSource")
    || firstMetaContent(document, ["meta[name='source']", "meta[property='article:author']"])
    || candidate.provider.name;
  const publishedAt = parseDateHint(metaContent(document, "PubDate") || firstMetaContent(document, ["meta[name='publishdate']", "meta[property='article:published_time']"]) || candidate.dateHint || "") || candidate.dateHint || "";
  const role = inferRole(`${title} ${content.slice(0, 3000)}`);
  return {
    id: stableId(candidate.url),
    title,
    url: candidate.url,
    source,
    providerName: candidate.provider.name,
    publishedAt,
    scope: candidate.provider.scope,
    role,
    content,
    summary: `${content.slice(0, 190).replace(/\s+/g, " ")}${content.length > 190 ? "……" : ""}`,
    score: 0
  };
}

export function scoreDailyArticle(article: DailyNewsArticle, theme: DailyReadingTheme, referenceDate = new Date()): number {
  const text = `${article.title} ${article.content}`;
  const themeHits = countKeywordHits(text, theme.keywords);
  const adminHits = countKeywordHits(text, ADMIN_KEYWORDS);
  const structureHits = countKeywordHits(text, ["问题", "针对", "通过", "建立", "完善", "推动", "实现", "提升", "形成", "截至"]);
  const published = article.publishedAt ? new Date(`${article.publishedAt}T00:00:00`) : null;
  const rawAgeDays = published && !Number.isNaN(published.getTime()) ? (referenceDate.getTime() - published.getTime()) / 86_400_000 : 30;
  const ageDays = Math.max(0, rawAgeDays);
  const recency = rawAgeDays < -0.5 ? 0 : ageDays <= 3 ? 20 : ageDays <= 14 ? 17 : ageDays <= 45 ? 12 : ageDays <= 120 ? 6 : 0;
  const lengthScore = article.content.length >= 700 && article.content.length <= 8_000 ? 10 : article.content.length >= 400 ? 6 : 2;
  const titlePenalty = LOW_VALUE_TITLE.test(article.title) ? 30 : 0;
  const futurePenalty = rawAgeDays < -0.5 ? 60 : 0;
  return Math.max(0, Math.min(100, 25 + recency + Math.min(22, themeHits * 6) + Math.min(13, adminHits * 2) + Math.min(10, structureHits * 2) + lengthScore - titlePenalty - futurePenalty));
}

function preliminaryScore(candidate: DailyNewsCandidate, theme: DailyReadingTheme): number {
  return countKeywordHits(candidate.title, theme.keywords) * 8
    + countKeywordHits(candidate.title, ADMIN_KEYWORDS) * 3
    - (LOW_VALUE_TITLE.test(candidate.title) ? 12 : 0);
}

function chooseCandidatePool(articles: DailyNewsArticle[], size = DAILY_ARTICLE_TARGET): DailyNewsArticle[] {
  const sorted = [...articles].sort((a, b) => b.score - a.score);
  const selected: DailyNewsArticle[] = [];
  const addMany = (predicate: (article: DailyNewsArticle) => boolean, limit: number) => {
    for (const article of sorted) {
      if (selected.length >= size || selected.filter(predicate).length >= limit) break;
      if (!selected.some(item => item.id === article.id) && predicate(article)) selected.push(article);
    }
  };

  // The pool is intentionally central-source heavy while keeping regional
  // examples distributed across the country. The quotas are a content policy,
  // not a claim that every day's crawl will have exactly this composition.
  addMany(article => article.scope === "national" && article.role === "policy", 3);
  addMany(article => article.scope === "national" && article.role === "case", 3);
  addMany(article => article.scope === "regional" && article.role === "case", 1);
  addMany(article => article.scope === "regional" && article.role === "policy", 1);
  addMany(article => article.scope === "anhui", 1);
  for (const article of sorted) {
    if (selected.length >= size) break;
    if (!selected.some(item => item.id === article.id)) selected.push(article);
  }
  return selected;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
  return results;
}

export async function acquireDailyReadingPlan(
  date = new Date(),
  onProgress?: (message: string) => void
): Promise<DailyReadingPlan> {
  const theme = getDailyReadingTheme(date);
  onProgress?.("正在读取全国与地方权威栏目…");
  const indexes = await Promise.allSettled(DAILY_NEWS_PROVIDERS.map(async provider => {
    const response = await fetchPublicSourceText(provider.indexUrl);
    return linksFromIndex(provider, response.body, response.url);
  }));
  const candidates = indexes.flatMap(result => result.status === "fulfilled" ? result.value : []);
  const uniqueByTitle = new Map<string, DailyNewsCandidate>();
  for (const candidate of candidates) {
    const signature = titleSignature(candidate.title);
    if (!uniqueByTitle.has(signature)) uniqueByTitle.set(signature, candidate);
  }
  const unique = [...uniqueByTitle.values()]
    .sort((a, b) => preliminaryScore(b, theme) - preliminaryScore(a, theme))
    .slice(0, 64);
  if (!unique.length) throw new Error("权威栏目暂未返回可读取的文章链接，请稍后重试。");

  onProgress?.(`已找到 ${candidates.length} 条候选，正在核验正文质量…`);
  const fetched = await mapWithConcurrency(unique, 4, async candidate => {
    try {
      const response = await fetchPublicSourceText(candidate.url);
      return extractArticle(candidate, response.body);
    } catch {
      return null;
    }
  });
  const articles = fetched.filter((article): article is DailyNewsArticle => Boolean(article)).map(article => {
    const score = scoreDailyArticle(article, theme, date);
    return { ...article, score };
  }).filter(article => article.score >= 45);
  const pool = chooseCandidatePool(articles);
  if (pool.length < DAILY_ARTICLE_TARGET) throw new Error("今天通过质量门槛的候选素材不足九篇。系统没有用低质量会议稿凑数，请稍后刷新。");
  return {
    date: localDateKey(date),
    theme,
    articles: pool,
    generatedAt: new Date().toISOString(),
    readArticleIds: []
  };
}

export function dateKey(date = new Date()): string {
  return localDateKey(date);
}
