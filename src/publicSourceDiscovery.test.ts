import { describe, expect, it } from "vitest";
import {
  discoverSecondaryIndexUrlsFromLinks,
  discoverShenlunCandidatesFromLinks
} from "./publicSourceDiscovery";
import { getPublicSourceProvider } from "./publicSourceProviders";

const provider = getPublicSourceProvider("gkzhenti-public");
if (!provider) throw new Error("Primary public source provider is missing.");

describe("public source discovery", () => {
  it("extracts Shenlun exam metadata and ignores unrelated links", () => {
    const candidates = discoverShenlunCandidatesFromLinks(provider, [
      {
        href: "/paper/2025-dishi#top",
        title: "2025年国家公考《申论》题（地市级）（网友回忆版）"
      },
      {
        href: "/paper/2025-dishi#duplicate",
        title: "2025年国家公考《申论》题（地市级）（网友回忆版）"
      },
      {
        href: "/paper/2025-guangdong",
        title: "2025年广东省公考《申论》题（行政执法卷）"
      },
      {
        href: "/paper/line-test",
        title: "2025年国家公务员考试《行测》题"
      }
    ], "https://gwy.gkzhenti.cn/paper?cls=%E7%94%B3%E8%AE%BA", "2026-08-22T13:00:00+08:00");

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({
      year: 2025,
      region: "国家",
      paperVariant: "地市级",
      sourceKind: "public-web",
      status: "discovered"
    });
    expect(candidates[0].metadata?.recallVersion).toBe(true);
    expect(candidates[0].sourceUrl).toBe("https://gwy.gkzhenti.cn/paper/2025-dishi");

    expect(candidates[1]).toMatchObject({
      year: 2025,
      region: "广东",
      paperVariant: "行政执法卷/行政执法"
    });
  });

  it("discovers only same-host Shenlun region index pages", () => {
    const urls = discoverSecondaryIndexUrlsFromLinks(provider, [
      { href: "/paper?cls=申论&province=广东", title: "广东" },
      { href: "/paper?province=江苏&cls=申论", title: "江苏" },
      { href: "/paper?cls=行测&province=广东", title: "广东行测" },
      { href: "https://example.com/paper?cls=申论&province=浙江", title: "外站" },
      { href: "/paper?cls=申论", title: "无地区" }
    ]);

    expect(urls).toEqual([
      "https://gwy.gkzhenti.cn/paper?cls=%E7%94%B3%E8%AE%BA&province=%E5%B9%BF%E4%B8%9C",
      "https://gwy.gkzhenti.cn/paper?province=%E6%B1%9F%E8%8B%8F&cls=%E7%94%B3%E8%AE%BA"
    ]);
  });

  it("recognizes common national and provincial paper variants", () => {
    const candidates = discoverShenlunCandidatesFromLinks(provider, [
      { href: "/paper/a", title: "2024年国家公务员考试《申论》卷（副省级）" },
      { href: "/paper/b", title: "2025年公务员多省联考《申论》题（河南县级卷）" },
      { href: "/paper/c", title: "2025年浙江省公考《申论》题（A卷）" }
    ]);

    expect(candidates[0].region).toBe("国家");
    expect(candidates[0].paperVariant).toContain("副省级");
    expect(candidates[1].region).toBe("河南");
    expect(candidates[1].paperVariant).toContain("县级");
    expect(candidates[2].region).toBe("浙江");
    expect(candidates[2].paperVariant).toBe("A卷");
  });
});
