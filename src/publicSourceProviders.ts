export type PublicSourceDiscoveryMode = "index-only" | "direct-web" | "mixed";

export interface PublicSourceProvider {
  id: string;
  name: string;
  indexUrl: string;
  discoveryMode: PublicSourceDiscoveryMode;
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
    coverage: "国考、省考、行测与申论公开来源索引",
    notes: "优先作为来源导航使用；保留原始出处，不把索引站内容当作真题正文。",
    autoFetchDefault: false
  },
  {
    id: "gkzhenti-public",
    name: "公开真题库",
    indexUrl: "https://gwy.gkzhenti.cn/",
    discoveryMode: "mixed",
    coverage: "国考、省考、申论整卷及网友回忆版来源",
    notes: "可用于发现具体试卷页面；正文是否自动导入需逐来源核验。",
    autoFetchDefault: false
  },
  {
    id: "132gk-shenlun",
    name: "132公考申论题库",
    indexUrl: "https://www.132gk.com/web/exercise/shenlun/exam",
    discoveryMode: "direct-web",
    coverage: "2008年以来多地区、多年份申论整卷索引",
    notes: "适合作为题目发现来源；导入正文前保留来源 URL 与回忆版标识。",
    autoFetchDefault: false
  },
  {
    id: "people-history",
    name: "人民网历史公考资料",
    indexUrl: "https://edu.people.com.cn/",
    discoveryMode: "direct-web",
    coverage: "部分历史国考、省考真题及解析公开页面",
    notes: "主要用于历史题来源核验和补充；保存具体页面 URL，不以站点首页代替出处。",
    autoFetchDefault: false
  }
];

export function getPublicSourceProvider(providerId: string): PublicSourceProvider | undefined {
  return PUBLIC_SOURCE_PROVIDERS.find(provider => provider.id === providerId);
}
