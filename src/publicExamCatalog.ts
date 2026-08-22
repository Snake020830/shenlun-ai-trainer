import type { PublicSourceCandidate } from "./publicSourceStore";

export interface PublicExamCandidateGroup {
  key: string;
  year: number;
  region: string;
  paperVariant?: string;
  preferred: PublicSourceCandidate;
  alternatives: PublicSourceCandidate[];
  members: PublicSourceCandidate[];
  hasImportedVersion: boolean;
}

function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/[（）()【】\[\]《》〈〉“”"'·•]/g, "")
    .toLowerCase();
}

export function normalizePaperVariant(value: string | undefined): string {
  if (!value) return "";
  return normalizeText(value)
    .replace(/行政执法卷/g, "行政执法")
    .replace(/副省卷/g, "副省级")
    .replace(/地市卷/g, "地市级")
    .replace(/市地级/g, "地市级")
    .replace(/a类/g, "a卷")
    .replace(/b类/g, "b卷")
    .replace(/c类/g, "c卷");
}

function normalizedTitleStem(title: string): string {
  return normalizeText(title)
    .replace(/(?:网友|考生|站友)(?:回忆|提供|整理)?版?/g, "")
    .replace(/回忆版/g, "")
    .replace(/完整版|真题版/g, "")
    .replace(/国家公务员考试|国家公务员|国家公考/g, "国考")
    .replace(/公务员考试|公务员公考|公考/g, "")
    .replace(/申论/g, "")
    .replace(/真题|试卷|题目|题|卷/g, "")
    .replace(/\d{4}年?/g, "");
}

export function publicExamIdentityKey(candidate: PublicSourceCandidate): string {
  const year = candidate.year ?? 0;
  const region = normalizeText(candidate.region ?? "未知地区");
  const variant = normalizePaperVariant(candidate.paperVariant);
  const fallbackStem = variant ? "" : normalizedTitleStem(candidate.title);
  return [year, region, variant || fallbackStem || "默认卷"].join("|");
}

export function publicExamSourceQuality(candidate: PublicSourceCandidate): number {
  let score = 100;
  const title = candidate.title;
  const recall = Boolean(candidate.metadata?.recallVersion) || /(网友|考生|回忆)/.test(title);
  const contributed = /(站友|网友|考生).*(提供|整理)|站友提供/.test(title);

  if (candidate.sourceKind !== "public-web") score -= 30;
  if (recall) score -= 25;
  if (contributed) score -= 12;
  if (/完整版/.test(title)) score += 2;
  if (candidate.status === "rejected") score -= 100;
  return score;
}

function compareCandidateQuality(left: PublicSourceCandidate, right: PublicSourceCandidate): number {
  const quality = publicExamSourceQuality(right) - publicExamSourceQuality(left);
  if (quality !== 0) return quality;
  if (left.status === "imported" && right.status !== "imported") return -1;
  if (right.status === "imported" && left.status !== "imported") return 1;
  return left.sourceUrl.localeCompare(right.sourceUrl);
}

export function groupPublicExamCandidates(candidates: PublicSourceCandidate[]): PublicExamCandidateGroup[] {
  const groups = new Map<string, PublicSourceCandidate[]>();
  for (const candidate of candidates) {
    if (typeof candidate.year !== "number") continue;
    const key = publicExamIdentityKey(candidate);
    const current = groups.get(key) ?? [];
    current.push(candidate);
    groups.set(key, current);
  }

  return [...groups.entries()].map(([key, rawMembers]) => {
    const members = [...rawMembers].sort(compareCandidateQuality);
    const preferred = members[0];
    return {
      key,
      year: preferred.year as number,
      region: preferred.region ?? "未知地区",
      ...(preferred.paperVariant ? { paperVariant: preferred.paperVariant } : {}),
      preferred,
      alternatives: members.slice(1),
      members,
      hasImportedVersion: members.some(item => item.status === "imported")
    };
  }).sort((left, right) => {
    if (right.year !== left.year) return right.year - left.year;
    const region = left.region.localeCompare(right.region, "zh-CN");
    if (region !== 0) return region;
    return (left.paperVariant ?? "").localeCompare(right.paperVariant ?? "", "zh-CN");
  });
}
