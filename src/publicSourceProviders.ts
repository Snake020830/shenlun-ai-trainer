export type PublicSourceDiscoveryMode = "index-only" | "direct-web" | "mixed";
export type PublicSourceTraversal = "single-page" | "shenlun-region-pages";
export type PublicSourceRole = "primary-structured" | "discovery-only" | "cross-check";

export interface PublicSourceProvider {
  id: string;
  name: string;
  indexUrl: string;
  discoveryMode: PublicSourceDiscoveryMode;
  traversal: PublicSourceTraversal;
  role: PublicSourceRole;
  maxIndexPages: number;
  coverage: string;
  notes: string;
  autoFetchDefault: boolean;
}

/**
 * Provider registry contains only public index metadata, never third-party exam bodies.
 * A provider being listed here means it can be used to discover source URLs; it does
 * not imply that its content may be republished or bundled with the application.
 *
 * `primary-structured` means the current parser is explicitly tested against that
 * provider's page structure. Other providers are discovery/cross-check sources only.
 *
 * Product scope: discovery keeps a rolling 10-calendar-year Shenlun window. Older
 * pages may remain useful as parser regression fixtures, but they are not part of
 * the normal training catalog.
 */
export const PUBLIC_SOURCE_PROVIDERS: PublicSourceProvider[] = [
  {
    id: "gkzhenti-public",
    name: "公开真题库",
    indexUrl: "https://gwy.gkzhenti.cn/paper?cls=%E7%94%B3%E8%AE%BA",
    discoveryMode: "mixed",
    traversal: "shenlun-region-pages",
    role: "primary-structured",
    maxIndexPages: 40,
    coverage: "近10年国考、联考及各地区申论整卷索引",
    notes: "当前主结构化来源：总索引继续扫描国考/联考/各地区申论页；实际候选只保留滚动最近10年，整卷导入前仍需人工预览确认。",
    autoFetchDefault: false
  },
  {
    id: "132gk-shenlun",
    name: "132公考申论题库",
    indexUrl: "https://www.132gk.com/web/exercise/shenlun/exam",
    discoveryMode: "direct-web",
    traversal: "single-page",
    role: "cross-check",
    maxIndexPages: 1,
    coverage: "近10年多地区、多年份申论整卷与解析页面",
    notes: "作为标题、材料和题目交叉核验来源；页面同时混排答案解析等内容，当前不直接自动写入正式题库。",
    autoFetchDefault: false
  },
  {
    id: "gwybs-source-index",
    name: "公务员笔试真题来源库",
    indexUrl: "https://www.gwybs.com/",
    discoveryMode: "index-only",
    traversal: "single-page",
    role: "discovery-only",
    maxIndexPages: 1,
    coverage: "近10年国考、省考申论公开来源索引",
    notes: "仅作为来源导航和补充发现；保留原始出处，不把索引页内容当作真题正文。",
    autoFetchDefault: false
  },
  {
    id: "people-history",
    name: "人民网公考资料",
    indexUrl: "https://edu.people.com.cn/",
    discoveryMode: "direct-web",
    traversal: "single-page",
    role: "cross-check",
    maxIndexPages: 1,
    coverage: "近10年部分国考、省考真题及解析公开页面",
    notes: "用于来源核验和补充，不作为当前自动整卷解析主源。",
    autoFetchDefault: false
  }
];

export function getPublicSourceProvider(providerId: string): PublicSourceProvider | undefined {
  return PUBLIC_SOURCE_PROVIDERS.find(provider => provider.id === providerId);
}