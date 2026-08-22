import { describe, expect, it } from "vitest";
import { groupPublicExamCandidates, publicExamIdentityKey, publicExamSourceQuality } from "./publicExamCatalog";
import type { PublicSourceCandidate } from "./publicSourceStore";

function candidate(overrides: Partial<PublicSourceCandidate> & Pick<PublicSourceCandidate, "id" | "title" | "sourceUrl">): PublicSourceCandidate {
  return {
    providerId: "gkzhenti-public",
    year: 2024,
    region: "国家",
    paperVariant: "副省级",
    sourceKind: "public-web",
    discoveredAt: "2026-08-22T14:00:00+08:00",
    status: "discovered",
    metadata: { recallVersion: false },
    ...overrides
  };
}

describe("public exam catalog grouping", () => {
  it("groups ordinary and contributed copies of the same year/region/variant", () => {
    const normal = candidate({
      id: "normal",
      title: "2024年国家公务员考试《申论》卷（副省级）",
      sourceUrl: "https://gwy.gkzhenti.cn/paper/normal"
    });
    const contributed = candidate({
      id: "contributed",
      title: "2024年国家公考《申论》题（副省级）（站友提供版）",
      sourceUrl: "https://gwy.gkzhenti.cn/paper/contributed"
    });

    expect(publicExamIdentityKey(normal)).toBe(publicExamIdentityKey(contributed));
    const groups = groupPublicExamCandidates([contributed, normal]);
    expect(groups).toHaveLength(1);
    expect(groups[0].preferred.id).toBe("normal");
    expect(groups[0].alternatives.map(item => item.id)).toEqual(["contributed"]);
  });

  it("does not merge different paper variants", () => {
    const a = candidate({ id: "a", title: "2025年浙江省公考《申论》题（A卷）", sourceUrl: "https://gwy.gkzhenti.cn/paper/a", year: 2025, region: "浙江", paperVariant: "A卷" });
    const b = candidate({ id: "b", title: "2025年浙江省公考《申论》题（B卷）", sourceUrl: "https://gwy.gkzhenti.cn/paper/b", year: 2025, region: "浙江", paperVariant: "B卷" });
    expect(groupPublicExamCandidates([a, b])).toHaveLength(2);
  });

  it("normalizes equivalent variant wording without collapsing distinct variants", () => {
    const executive = candidate({ id: "x", title: "2025年广东省公考《申论》题（行政执法卷）", sourceUrl: "https://gwy.gkzhenti.cn/paper/x", year: 2025, region: "广东", paperVariant: "行政执法卷" });
    const executiveShort = candidate({ id: "y", title: "2025年广东省公考《申论》题（行政执法）", sourceUrl: "https://gwy.gkzhenti.cn/paper/y", year: 2025, region: "广东", paperVariant: "行政执法" });
    const county = candidate({ id: "z", title: "2025年广东省公考《申论》题（县级卷）", sourceUrl: "https://gwy.gkzhenti.cn/paper/z", year: 2025, region: "广东", paperVariant: "县级" });
    expect(publicExamIdentityKey(executive)).toBe(publicExamIdentityKey(executiveShort));
    expect(publicExamIdentityKey(executive)).not.toBe(publicExamIdentityKey(county));
  });

  it("prefers non-recall sources but preserves imported-version state at group level", () => {
    const recall = candidate({
      id: "recall",
      title: "2025年国家公考《申论》题（副省级）（网友回忆版）",
      sourceUrl: "https://gwy.gkzhenti.cn/paper/recall",
      year: 2025,
      status: "imported",
      metadata: { recallVersion: true }
    });
    const normal = candidate({
      id: "normal",
      title: "2025年国家公务员考试《申论》卷（副省级）",
      sourceUrl: "https://gwy.gkzhenti.cn/paper/normal-2025",
      year: 2025
    });
    const groups = groupPublicExamCandidates([recall, normal]);
    expect(groups).toHaveLength(1);
    expect(groups[0].preferred.id).toBe("normal");
    expect(groups[0].hasImportedVersion).toBe(true);
    expect(publicExamSourceQuality(normal)).toBeGreaterThan(publicExamSourceQuality(recall));
  });
});
