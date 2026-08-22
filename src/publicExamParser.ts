import type { QuestionType } from "./types";
import type { PublicSourceCandidate } from "./publicSourceStore";

export interface ParsedPublicExamMaterial {
  sourceNumber: number;
  label: string;
  content: string;
}

export interface ParsedPublicExamTask {
  taskIndex: number;
  ordinal: string;
  prompt: string;
  requirements: string;
  score: number | null;
  wordLimit: number | null;
  materialNumbers: number[];
  questionType: QuestionType;
  tags: string[];
  warnings: string[];
}

export interface ParsedPublicExam {
  title: string;
  materials: ParsedPublicExamMaterial[];
  tasks: ParsedPublicExamTask[];
  warnings: string[];
}

const CHINESE_NUMBERS: Record<string, number> = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10
};

const TASK_ORDINAL = /^\s*([一二三四五六七八九十]|\d{1,2})[、.．]\s*$/u;
const MATERIAL_HEADING = /^\s*材料\s*([0-9０-９一二三四五六七八九十]+)(?:\([^)]*\))?\s*$/u;
const SITE_FOOTER_MARKERS = ["欢迎使用公开真题库", "备案编号：", "网站版本：", "若有网络数据相关投诉举报"];

function normalizeText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function trimSiteFooter(value: string): string {
  let end = value.length;
  for (const marker of SITE_FOOTER_MARKERS) {
    const index = value.indexOf(marker);
    if (index >= 0) end = Math.min(end, index);
  }
  return normalizeText(value.slice(0, end));
}

function normalizeNumberToken(token: string): number | null {
  const ascii = token.replace(/[０-９]/g, char => String(char.charCodeAt(0) - 0xfee0));
  if (/^\d+$/.test(ascii)) return Number(ascii);
  if (CHINESE_NUMBERS[ascii]) return CHINESE_NUMBERS[ascii];
  if (ascii.startsWith("十") && CHINESE_NUMBERS[ascii.slice(1)]) return 10 + CHINESE_NUMBERS[ascii.slice(1)];
  if (ascii.endsWith("十") && CHINESE_NUMBERS[ascii.slice(0, -1)]) return CHINESE_NUMBERS[ascii.slice(0, -1)] * 10;
  const [tens, ones] = ascii.split("十");
  if (tens && ones && CHINESE_NUMBERS[tens] && CHINESE_NUMBERS[ones]) return CHINESE_NUMBERS[tens] * 10 + CHINESE_NUMBERS[ones];
  return null;
}

function stripHtmlToText(html: string): string {
  if (typeof DOMParser === "undefined") return normalizeText(html.replace(/<[^>]+>/g, "\n"));
  const document = new DOMParser().parseFromString(html, "text/html");
  document.querySelectorAll("script,style,noscript,svg,nav,footer").forEach(node => node.remove());

  const blockTags = new Set(["ADDRESS", "ARTICLE", "ASIDE", "BLOCKQUOTE", "BR", "DIV", "DL", "DT", "DD", "FIGCAPTION", "FIGURE", "H1", "H2", "H3", "H4", "H5", "H6", "HR", "LI", "MAIN", "OL", "P", "PRE", "SECTION", "TABLE", "TBODY", "TD", "TH", "THEAD", "TR", "UL"]);
  const chunks: string[] = [];

  function visit(node: Node): void {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      if (text) chunks.push(text);
      return;
    }
    if (!(node instanceof Element)) return;
    const isBlock = blockTags.has(node.tagName);
    if (isBlock && chunks.length && !chunks.at(-1)?.endsWith("\n")) chunks.push("\n");
    if (node.tagName === "BR") {
      chunks.push("\n");
      return;
    }
    node.childNodes.forEach(visit);
    if (isBlock && !chunks.at(-1)?.endsWith("\n")) chunks.push("\n");
  }

  visit(document.body);
  return normalizeText(chunks.join(""));
}

function extractScore(text: string): number | null {
  const match = text.match(/[（(]\s*(\d{1,3})\s*分\s*[）)]/u);
  return match ? Number(match[1]) : null;
}

function extractWordLimit(text: string): number | null {
  const upper = text.match(/不超过\s*(\d{2,4})\s*字/u);
  if (upper) return Number(upper[1]);

  const range = text.match(/(?:字数\s*)?(\d{2,4})\s*[-—~～至]\s*(\d{2,4})\s*字/u);
  if (range) return Math.max(Number(range[1]), Number(range[2]));

  const about = text.match(/(?:不少于|至少)\s*(\d{2,4})\s*字/u);
  if (about) return Number(about[1]);
  return null;
}

function extractMaterialNumbers(text: string): number[] {
  const result = new Set<number>();
  const patterns = [
    /给定资料\s*[“"']?\s*([0-9０-９一二三四五六七八九十]+)/gu,
    /给定材料\s*[“"']?\s*([0-9０-９一二三四五六七八九十]+)/gu,
    /资料\s*([0-9０-９一二三四五六七八九十]+)/gu
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const number = normalizeNumberToken(match[1]);
      if (number) result.add(number);
    }
  }
  return [...result].sort((left, right) => left - right);
}

export function inferPublicQuestionType(prompt: string): QuestionType {
  if (/(写一篇文章|自拟题目|自选角度.*写|文章)/u.test(prompt)) return "文章写作";
  if (/(拟写|撰写|提案|讲话稿|发言稿|通知|建议书|工作方案|简报|公开信|倡议书|回复)/u.test(prompt)) return "贯彻执行";
  if (/(提出.*(?:建议|对策|措施)|给出.*(?:建议|对策)|怎么办|如何解决|进一步.*建议)/u.test(prompt)) return "提出对策";
  if (/(分析|理解|谈谈.*(?:含义|关系|认识)|解释|评价|为什么|观点)/u.test(prompt)) return "综合分析";
  return "概括归纳";
}

function parseMaterials(text: string): ParsedPublicExamMaterial[] {
  const lines = text.split("\n");
  const headings = lines
    .map((line, index) => ({ index, match: line.match(MATERIAL_HEADING) }))
    .filter((item): item is { index: number; match: RegExpMatchArray } => Boolean(item.match));
  const materials: ParsedPublicExamMaterial[] = [];
  for (let position = 0; position < headings.length; position += 1) {
    const current = headings[position];
    const next = headings[position + 1];
    const sourceNumber = normalizeNumberToken(current.match[1]) ?? position + 1;
    const content = normalizeText(lines.slice(current.index + 1, next?.index ?? lines.length).join("\n"));
    if (!content) continue;
    materials.push({ sourceNumber, label: `材料${sourceNumber}`, content });
  }
  return materials;
}

function parseTasks(text: string): ParsedPublicExamTask[] {
  const cleanText = trimSiteFooter(text);
  const lines = cleanText.split("\n");
  const ordinals = lines
    .map((line, index) => ({ index, match: line.match(TASK_ORDINAL) }))
    .filter((item): item is { index: number; match: RegExpMatchArray } => Boolean(item.match));

  return ordinals.map((current, position) => {
    const next = ordinals[position + 1];
    const body = normalizeText(lines.slice(current.index + 1, next?.index ?? lines.length).join("\n"));
    const requirementIndex = body.search(/(?:^|\n)要求[：:]/u);
    const prompt = normalizeText(requirementIndex >= 0 ? body.slice(0, requirementIndex) : body);
    const requirements = normalizeText(requirementIndex >= 0 ? body.slice(requirementIndex).replace(/^\s*要求[：:]\s*/u, "") : "");
    const combined = `${prompt}\n${requirements}`;
    const score = extractScore(prompt);
    const wordLimit = extractWordLimit(combined);
    const materialNumbers = extractMaterialNumbers(prompt);
    const questionType = inferPublicQuestionType(prompt);
    const warnings: string[] = [];
    if (!score) warnings.push("未识别分值，导入前必须人工确认。");
    if (!wordLimit) warnings.push("未识别字数限制，导入前必须人工确认。");
    if (!materialNumbers.length && questionType !== "文章写作") warnings.push("未识别明确材料编号；默认导入整卷材料，需人工核验。");
    const tags = ["公开真题", questionType];
    if (/成效.*建议|建议.*成效|问题.*建议|概括.*提出/u.test(prompt)) tags.push("复合题");

    return {
      taskIndex: position,
      ordinal: current.match[1],
      prompt,
      requirements,
      score,
      wordLimit,
      materialNumbers,
      questionType,
      tags,
      warnings
    };
  }).filter(task => task.prompt.length > 0);
}

export function parseGkzhentiExamText(text: string, candidate?: PublicSourceCandidate): ParsedPublicExam {
  const normalized = normalizeText(text);
  const materialSectionMatch = normalized.match(/(?:^|\n)(?:二[、.．]\s*)?给定(?:资料|材料)\s*(?:\n|$)/u);
  const taskSectionMatch = normalized.match(/(?:^|\n)(?:三[、.．]\s*)?作答要求\s*(?:\n|$)/u);
  const warnings: string[] = [];

  if (!materialSectionMatch || materialSectionMatch.index === undefined) warnings.push("未找到“给定材料/给定资料”章节。解析结果不可直接导入。");
  if (!taskSectionMatch || taskSectionMatch.index === undefined) warnings.push("未找到“作答要求”章节。解析结果不可直接导入。");

  const materialStart = materialSectionMatch?.index === undefined ? 0 : materialSectionMatch.index + materialSectionMatch[0].length;
  const taskStart = taskSectionMatch?.index === undefined ? normalized.length : taskSectionMatch.index + taskSectionMatch[0].length;
  const materialText = normalized.slice(materialStart, taskSectionMatch?.index ?? normalized.length);
  const taskText = trimSiteFooter(normalized.slice(taskStart));
  const materials = parseMaterials(materialText);
  const tasks = parseTasks(taskText);

  if (!materials.length) warnings.push("未识别任何“材料N”块。解析结果不可直接导入。");
  if (!tasks.length) warnings.push("未识别任何作答题。解析结果不可直接导入。");

  const titleLine = normalized.split("\n").find(line => /\d{4}.*申论/u.test(line));
  return {
    title: candidate?.title ?? titleLine ?? "公开申论整卷",
    materials,
    tasks,
    warnings
  };
}

export function parseGkzhentiExamHtml(html: string, candidate?: PublicSourceCandidate): ParsedPublicExam {
  return parseGkzhentiExamText(stripHtmlToText(html), candidate);
}

export function canImportParsedPublicExam(exam: ParsedPublicExam): boolean {
  if (exam.warnings.length) return false;
  if (!exam.materials.length || !exam.tasks.length) return false;
  return exam.tasks.every(task => task.score !== null && task.wordLimit !== null && task.warnings.length === 0);
}
