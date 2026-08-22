export type PublicSourceDiscoveryMode = "index-only" | "direct-web" | "mixed";
export type PublicSourceTraversal = "single-page" | "shenlun-region-pages";

export interface PublicSourceProvider {
  id: string;
  name: string;
  indexUrl: string;
  discoveryMode: PublicSourceDiscoveryMode;
  traversal: PublicSourceTraversal;
  maxIndexPages: number;
  coverage: string;
  notes: string;
  autoFetchDefault: boolean;
}

/**
 * Provider registry contains only public index metadata, never third-party exam bodies.
 * A provider being listed here means it can be used to discover source URLs; it does
 * not imply that its content may be republished or bundled with the application.
 */
export const PUBLIC_SOURCE_PROVIDERS: PublicSourceProvider[] = [
  {
    id: "gwybs-source-index",
    name: "公务员笔试真题来源库",
    indexUrl: "https://www.gwybs.com/",
    discoveryMode: "index-only",
    traversal: "single-page",
    maxIndexPages: 1,
    coverage: "国考、省考、行测与申论公开来源索引",
    notes: "优先作为来源导航使用；保留原始出处，不把索引站内容当作真题正文。",
    autoFetchDefault: false
  },
  {
    id: "gkzhenti-public",
    name: "公开真题库",
    indexUrl: "https://gwy.gkzhenti.cn/paper?cls=%E7%94%B3%E8%AE%BA",
    discoveryMode: "mixed",
    traversal: "shenlun-region-pages",
    maxIndexPages: 40,
    coverage: "国考、联考及三十多个地区的历年申论整卷索引",
    notes: "总索引会继续扫描国考/联考/各地区申论页；只收集整卷元数据和原始 URL，正文按需本机导入。",
    autoFetchDefault: false
  },
  {
    id: "132gk-shenlun",
    name: "132公考申论题库",
    indexUrl: "https://www.132gk.com/web/exercise/shenlun/exam",
    discoveryMode: "direct-web",
    traversal: "single-page",
    maxIndexPages: 1,
    coverage: "2008年以来多地区、多年份申论整卷索引",
    notes: "适合作为题目发现来源；导入正文前保留来源 URL 与回忆版标识。",
    autoFetchDefault: false
  },
  {
    id: "people-history",
    name: "人民网历史公考资料",
    indexUrl: "https://edu.people.com.cn/",
    discoveryMode: "direct-web",
    traversal: "single-page",
    maxIndexPages: 1,
    coverage: "部分历史国考、省考真题及解析公开页面",
    notes: "主要用于历史题来源核验和补充；保存具体页面 URL，不以站点首页代替出处。",
    autoFetchDefault: false
  }
];

export function getPublicSourceProvider(providerId: string): PublicSourceProvider | undefined {
  return PUBLIC_SOURCE_PROVIDERS.find(provider => provider.id === providerId);
}
