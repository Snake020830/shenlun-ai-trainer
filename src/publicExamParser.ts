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

const CHINESE_ORDINAL = "[一二三四五六七八九十]";
const NUMBER_TOKEN = "[0-9０-９一二三四五六七八九十]+";
const TASK_EXPLICIT = new RegExp(`^\\s*(?:第\\s*)?(${CHINESE_ORDINAL})\\s*题\\s*(?:[、.．:：])?\\s*(.*)$`, "u");
const TASK_CHINESE_PUNCT = new RegExp(`^\\s*(${CHINESE_ORDINAL})\\s*[、.．:：]\\s*(.*)$`, "u");
const TASK_CHINESE_PAREN = new RegExp(`^\\s*[（(]\\s*(${CHINESE_ORDINAL})\\s*[）)]\\s*(.*)$`, "u");
const TASK_NUMERIC_STANDALONE = /^\s*(\d{1,2})\s*[、.．:：]?\s*$/u;
const MATERIAL_HEADING = /^\s*材料\s*([0-9０-９一二三四五六七八九十]+)(?:\([^)]*\))?\s*(?:[：:])?\s*$/u;
const SITE_FOOTER_MARKERS = ["欢迎使用公开真题库", "备案编号：", "网站版本：", "若有网络数据相关投诉举报"];

interface IndexedLine {
  line: string;
  index: number;
  start: number;
}

interface ParsedTaskHeading {
  ordinal: string;
  inlinePrompt: string;
}

function normalizeText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function indexedLines(value: string): IndexedLine[] {
  let offset = 0;
  return value.split("\n").map((line, index) => {
    const current = { line, index, start: offset };
    offset += line.length + 1;
    return current;
  });
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

function hasScoreMarker(value: string): boolean {
  return /[（(]\s*\d{1,3}\s*分\s*[）)]/u.test(value);
}

function parseTaskHeading(line: string): ParsedTaskHeading | null {
  const explicit = line.match(TASK_EXPLICIT);
  if (explicit) return { ordinal: explicit[1], inlinePrompt: explicit[2]?.trim() ?? "" };

  const punct = line.match(TASK_CHINESE_PUNCT);
  if (punct) {
    const inlinePrompt = punct[2]?.trim() ?? "";
    if (!inlinePrompt || hasScoreMarker(inlinePrompt)) return { ordinal: punct[1], inlinePrompt };
  }

  const parenthesized = line.match(TASK_CHINESE_PAREN);
  if (parenthesized) {
    const inlinePrompt = parenthesized[2]?.trim() ?? "";
    if (!inlinePrompt || hasScoreMarker(inlinePrompt)) return { ordinal: parenthesized[1], inlinePrompt };
  }

  const numeric = line.match(TASK_NUMERIC_STANDALONE);
  return numeric ? { ordinal: numeric[1], inlinePrompt: "" } : null;
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
  const subQuestionLimits = [...text.matchAll(/第[一二三四五六七八九十\d]+问[^。；\n]{0,60}?(?:不超过|不多于)\s*(\d{1,4})\s*个?字/gu)]
    .map(match => Number(match[1]))
    .filter(Number.isFinite);
  if (subQuestionLimits.length >= 2) return subQuestionLimits.reduce((sum, value) => sum + value, 0);

  const range = text.match(/(?:字数|总字数|篇幅)?\s*(?:控制在)?\s*(\d{2,4})\s*[-—~～至]\s*(\d{2,4})\s*字/u);
  if (range) return Math.max(Number(range[1]), Number(range[2]));

  const upper = [...text.matchAll(/(?:不超过|不多于)\s*(\d{1,4})\s*个?字/gu)].map(match => Number(match[1]));
  if (upper.length) return Math.max(...upper);

  const within = text.match(/(?:字数|总字数|篇幅)?\s*(?:控制在)?\s*(\d{2,4})\s*字以内/u);
  if (within) return Number(within[1]);

  const about = text.match(/(?:篇幅|字数|总字数)?\s*(\d{2,4})\s*字左右/u);
  if (about) return Number(about[1]);
  return null;
}

function addMaterialRange(result: Set<number>, startToken: string, endToken: string): void {
  const start = normalizeNumberToken(startToken);
  const end = normalizeNumberToken(endToken);
  if (!start || !end || end < start || end - start > 20) return;
  for (let value = start; value <= end; value += 1) result.add(value);
}

function normalizeMaterialReferenceNoise(text: string): string {
  return text
    .replace(/给[ \t\u3000]*定[ \t\u3000]*资[ \t\u3000]*料/gu, "给定资料")
    .replace(/给[ \t\u3000]*定[ \t\u3000]*材[ \t\u3000]*料/gu, "给定材料")
    .replace(/资[ \t\u3000]+料(?=[ \t\u3000]*[“"']?[ \t\u3000]*[0-9０-９一二三四五六七八九十])/gu, "资料")
    .replace(/材[ \t\u3000]+料(?=[ \t\u3000]*[“"']?[ \t\u3000]*[0-9０-９一二三四五六七八九十])/gu, "材料");
}

function extractMaterialNumbers(text: string): number[] {
  const normalized = normalizeMaterialReferenceNoise(text);
  const result = new Set<number>();
  const rangePattern = new RegExp(`(?:给定)?(?:资料|材料)\\s*[“\"']?\\s*(${NUMBER_TOKEN})\\s*(?:[～~—-]|至)\\s*(${NUMBER_TOKEN})`, "gu");
  for (const match of normalized.matchAll(rangePattern)) addMaterialRange(result, match[1], match[2]);

  const patterns = [
    /给定资料\s*[“"']?\s*([0-9０-９一二三四五六七八九十]+)/gu,
    /给定材料\s*[“"']?\s*([0-9０-９一二三四五六七八九十]+)/gu,
    /资料\s*([0-9０-９一二三四五六七八九十]+)/gu,
    /材料\s*([0-9０-９一二三四五六七八九十]+)/gu
  ];
  for (const pattern of patterns) {
    for (const match of normalized.matchAll(pattern)) {
      const number = normalizeNumberToken(match[1]);
      if (number) result.add(number);
    }
  }
  return [...result].sort((left, right) => left - right);
}

export function inferPublicQuestionType(prompt: string): QuestionType {
  if (/(写一篇文章|撰写一篇|自拟题目|自选角度.*写|议论性文章|议论文|文章)/u.test(prompt)) return "文章写作";
  if (/(拟写|撰写|提案|讲话稿|发言稿|发言|通知|建议书|工作方案|简报|公开信|倡议书|回复|汇报|调查报告|短评|感谢信|新闻稿|宣传稿|编者按|导言)/u.test(prompt)) return "贯彻执行";
  if (/(提出.*(?:建议|对策|措施)|给出.*(?:建议|对策)|怎么办|如何解决|进一步.*建议|改进建议)/u.test(prompt)) return "提出对策";
  if (/(分析|理解|看法|你怎么看|谈谈.*(?:含义|关系|认识|看法)|解释|评价|评析|评述|为什么|观点)/u.test(prompt)) return "综合分析";
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

function taskFromBody(bodyInput: string, taskIndex: number, ordinal: string): ParsedPublicExamTask | null {
  const body = normalizeText(bodyInput);
  if (!body) return null;
  const requirementIndex = body.search(/(?:^|\n)要求[：:]/u);
  const prompt = normalizeText(requirementIndex >= 0 ? body.slice(0, requirementIndex) : body);
  const requirements = normalizeText(
    requirementIndex >= 0
      ? body.slice(requirementIndex).replace(/^\s*(?:要求[：:]\s*)+/u, "")
      : ""
  );
  if (!prompt) return null;

  const combined = `${prompt}\n${requirements}`;
  const score = extractScore(combined);
  const wordLimit = extractWordLimit(combined);
  const materialNumbers = extractMaterialNumbers(prompt);
  const questionType = inferPublicQuestionType(prompt);
  const warnings: string[] = [];
  const hasNestedScoredSubQuestions = /(?:^|\n)\s*\d{1,2}[.．、]\s*[^\n]*[（(]\s*\d{1,3}\s*分\s*[）)]/u.test(body);
  if (hasNestedScoredSubQuestions) warnings.push("检测到大题内嵌多个计分小问；当前版本不自动拆分，需人工核验。");
  if (!score) warnings.push("未识别分值，导入前必须人工确认。");
  if (!wordLimit) {
    if (/(?:不少于|至少)\s*\d{2,4}\s*字/u.test(combined)) {
      warnings.push("仅识别到最低字数要求，没有可靠的答题上限；当前版本不自动导入。");
    } else {
      warnings.push("未识别字数限制，导入前必须人工确认。");
    }
  }
  if (!materialNumbers.length && questionType !== "文章写作") warnings.push("未识别明确材料编号；默认导入整卷材料，需人工核验。");
  const tags = ["公开真题", questionType];
  if (/(成效.*建议|建议.*成效|问题.*建议|概括.*提出|原因.*对策|分析.*对策)/u.test(prompt)) tags.push("复合题");

  return {
    taskIndex,
    ordinal,
    prompt,
    requirements,
    score,
    wordLimit,
    materialNumbers,
    questionType,
    tags,
    warnings
  };
}

function parseHeadinglessScoredTasks(cleanText: string): ParsedPublicExamTask[] {
  const lines = cleanText.split("\n");
  const scoreLines = lines
    .map((line, index) => ({ line, index }))
    .filter(item => hasScoreMarker(item.line));

  if (scoreLines.length < 2) return [];
  if (scoreLines.some(item => /^\s*(?:\d{1,2}[.．、]|[（(]\s*\d{1,2}\s*[）)])/.test(item.line))) return [];

  const tasks: ParsedPublicExamTask[] = [];
  for (let position = 0; position < scoreLines.length; position += 1) {
    const current = scoreLines[position];
    const next = scoreLines[position + 1];
    const body = normalizeText(lines.slice(current.index, next?.index ?? lines.length).join("\n"));
    if (!/(?:^|\n)要求[：:]/u.test(body)) return [];
    const task = taskFromBody(body, position, String(position + 1));
    if (!task) return [];
    tasks.push(task);
  }
  return tasks;
}

function parseTasks(text: string): ParsedPublicExamTask[] {
  const cleanText = trimSiteFooter(text);
  const lines = cleanText.split("\n");
  const headings = lines
    .map((line, index) => ({ index, heading: parseTaskHeading(line) }))
    .filter((item): item is { index: number; heading: ParsedTaskHeading } => Boolean(item.heading));

  if (!headings.length) return parseHeadinglessScoredTasks(cleanText);

  return headings.map((current, position) => {
    const next = headings[position + 1];
    const tailLines = lines.slice(current.index + 1, next?.index ?? lines.length);
    const rawBody = current.heading.inlinePrompt
      ? [current.heading.inlinePrompt, ...tailLines].join("\n")
      : tailLines.join("\n");
    return taskFromBody(rawBody, position, current.heading.ordinal);
  }).filter((task): task is ParsedPublicExamTask => Boolean(task));
}

function inferSectionBoundaries(normalized: string): { materialStart: number | null; taskStart: number | null } {
  const lines = indexedLines(normalized);
  const materialHeadings = lines.filter(item => MATERIAL_HEADING.test(item.line));
  if (!materialHeadings.length) return { materialStart: null, taskStart: null };

  const firstMaterial = materialHeadings[0];
  const lastMaterial = materialHeadings[materialHeadings.length - 1];
  const possibleTasks = lines
    .map(item => ({ ...item, heading: item.index > lastMaterial.index ? parseTaskHeading(item.line) : null }))
    .filter((item): item is IndexedLine & { heading: ParsedTaskHeading } => Boolean(item.heading));

  if (possibleTasks.length < 2) return { materialStart: firstMaterial.start, taskStart: null };

  const firstTask = possibleTasks[0];
  const probe = firstTask.heading.inlinePrompt || lines
    .slice(firstTask.index + 1, Math.min(lines.length, firstTask.index + 5))
    .map(item => item.line)
    .join("\n");
  if (!hasScoreMarker(probe)) {
    return { materialStart: firstMaterial.start, taskStart: null };
  }
  return { materialStart: firstMaterial.start, taskStart: firstTask.start };
}

export function parseGkzhentiExamText(text: string, candidate?: PublicSourceCandidate): ParsedPublicExam {
  const normalized = normalizeText(text);
  const materialSectionMatch = normalized.match(/(?:^|\n)(?:二[、.．]\s*)?给定(?:资料|材料)\s*(?:\n|$)/u);
  const taskSectionMatch = normalized.match(/(?:^|\n)(?:三[、.．]\s*)?作答要求\s*(?:\n|$)/u);
  const inferred = inferSectionBoundaries(normalized);
  const warnings: string[] = [];

  const materialStart = materialSectionMatch?.index !== undefined
    ? materialSectionMatch.index + materialSectionMatch[0].length
    : inferred.materialStart;
  const taskBoundary = taskSectionMatch?.index !== undefined
    ? taskSectionMatch.index
    : inferred.taskStart;
  const taskStart = taskSectionMatch?.index !== undefined
    ? taskSectionMatch.index + taskSectionMatch[0].length
    : inferred.taskStart;

  if (materialStart === null) warnings.push("未找到明确材料章节或可验证的“材料N”序列。解析结果不可直接导入。");
  if (taskStart === null) warnings.push("未找到“作答要求”章节，也无法可靠推断连续题号边界。解析结果不可直接导入。");

  const materialText = materialStart === null
    ? ""
    : normalized.slice(materialStart, taskBoundary ?? normalized.length);
  const taskText = taskStart === null ? "" : trimSiteFooter(normalized.slice(taskStart));
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
