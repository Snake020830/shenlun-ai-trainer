import type { PaperLevel, Question } from "./types";

export const PAPER_LEVEL_OPTIONS: PaperLevel[] = [
  "国考副省级",
  "国考地市级",
  "国考行政执法类",
  "国考公安类",
  "省考省市级",
  "省考县乡级",
  "省考行政执法类",
  "省考公安类",
  "省考A类",
  "省考B类",
  "省考C类",
  "省考乡镇级",
  "其他/未标注"
];

function sourceText(region = "", variant = "", title = ""): string {
  return `${region} ${variant} ${title}`.normalize("NFKC").replace(/\s+/g, "");
}

/**
 * Classify from explicit paper metadata. A/B/C stay province-specific by
 * default; only mappings backed by a public exam notice are folded in here.
 */
export function inferPaperLevel(region = "", variant = "", title = ""): PaperLevel {
  const text = sourceText(region, variant, title);
  const national = /国家公务员|国家公考|国考|副省级|地市级|市地级|行政执法卷/.test(text) &&
    (region === "国家" || /国家公务员|国家公考|国考|副省级|地市级|市地级/.test(text));

  if (national && /行政执法/.test(text)) return "国考行政执法类";
  if (national && /副省级|副省卷/.test(text)) return "国考副省级";
  if (national && /地市级|地市卷|市地级/.test(text)) return "国考地市级";
  if (national && /公安/.test(text)) return "国考公安类";
  if (/行政执法/.test(text)) return "省考行政执法类";
  if (/公安/.test(text)) return "省考公安类";
  if (/乡镇/.test(text)) return "省考乡镇级";
  if (/县乡|县镇|县级/.test(text)) return "省考县乡级";
  if (/省市|省级|市级/.test(text)) return "省考省市级";
  // Jiangsu's published position classification uses C for township-level
  // positions, so those papers should follow the user's township exclusion.
  if (/江苏/.test(text) && /(?:^|[^A-Z])C(?:类|卷)/i.test(text)) return "省考乡镇级";
  if (/(?:^|[^A-Z])A(?:类|卷)/i.test(text)) return "省考A类";
  if (/(?:^|[^A-Z])B(?:类|卷)/i.test(text)) return "省考B类";
  if (/(?:^|[^A-Z])C(?:类|卷)/i.test(text)) return "省考C类";
  return "其他/未标注";
}

export function questionPaperId(question: Pick<Question, "id" | "paperId">): string | undefined {
  if (question.paperId?.trim()) return question.paperId;
  const publicMatch = question.id.match(/^publicq:([^:]+):task:/);
  return publicMatch ? `paper:${publicMatch[1]}` : undefined;
}

export function questionPaperLevel(question: Pick<Question, "region" | "title" | "paperLevel" | "paperVariant" | "tags">): PaperLevel {
  return question.paperLevel ?? inferPaperLevel(question.region, question.paperVariant, `${question.title} ${question.tags.join(" ")}`);
}

export function questionPaperTitle(question: Pick<Question, "title" | "paperTitle">): string {
  if (question.paperTitle?.trim()) return question.paperTitle;
  return question.title.replace(/\s*[·•]\s*第\s*\d+\s*题\s*$/u, "").trim();
}

export function isTownshipPaper(question: Pick<Question, "region" | "title" | "paperLevel" | "paperVariant" | "tags">): boolean {
  return questionPaperLevel(question) === "省考乡镇级"
    || /乡镇卷|乡镇级|乡镇机关/u.test(`${question.title} ${question.paperVariant ?? ""} ${question.tags.join(" ")}`);
}

export function taskNumber(question: Pick<Question, "taskIndex">, fallback = 0): number {
  return typeof question.taskIndex === "number" && question.taskIndex >= 0
    ? question.taskIndex + 1
    : fallback + 1;
}
