import type { Question } from "./types";

export type QuestionTheme = "科技创新" | "乡村振兴" | "基层治理" | "文化建设" | "生态文明" | "民生服务" | "营商环境" | "其他";

export const QUESTION_THEMES: Array<"全部主题" | QuestionTheme> = ["全部主题", "科技创新", "乡村振兴", "基层治理", "文化建设", "生态文明", "民生服务", "营商环境", "其他"];

const THEME_RULES: Array<[Exclude<QuestionTheme, "其他">, RegExp]> = [
  ["科技创新", /科技|创新|数字|人工智能|研发|产业升级|新质生产力/],
  ["乡村振兴", /乡村|农村|农业|农民|扶贫|帮扶|三农|县域/],
  ["基层治理", /基层|治理|社区|改革|协同|政务|群众/],
  ["文化建设", /文化|文旅|艺术|民乐|传承|文明/],
  ["生态文明", /生态|环保|环境|绿色|低碳|污染/],
  ["民生服务", /民生|就业|教育|医疗|养老|住房|服务/],
  ["营商环境", /营商|企业|审批|市场|项目|产业|金融/]
];

export function inferQuestionThemes(question: Question): QuestionTheme[] {
  const haystack = `${question.title} ${question.tags.join(" ")} ${question.prompt}`;
  const matches = THEME_RULES.filter(([, rule]) => rule.test(haystack)).map(([theme]) => theme);
  return matches.length ? matches : ["其他"];
}
