import type { EssayDimensionId, EssayEvidenceRef } from "../../types";

export const ESSAY_METHOD_ID = "yuan-dong-essay-evidence@1.0.0";
export const ESSAY_RULESET_VERSION = "essay-grading@1.0.0";
export const ESSAY_DIAGNOSTIC_DISCLAIMER = "依据袁东大作文课程提炼的训练诊断量表，不等同于官方阅卷细则或经校准的考试分数。";

export interface EssayEvidenceRule extends EssayEvidenceRef {
  dimensions: EssayDimensionId[];
  instruction: string;
}

const SOURCE = "《2027版大作文专项班》讲义与配套课程字幕";

export const YUAN_DONG_ESSAY_RULES: readonly EssayEvidenceRule[] = [
  {
    ruleId: "YD-THEME-01",
    title: "题干关键词决定文章主题",
    source: SOURCE,
    location: "核心方法·审题与主题类型",
    dimensions: ["thesis"],
    instruction: "先从题干提取关键词，判断单主题、双主题或多主题；标题、总论点不得偏离核心主题词。"
  },
  {
    ruleId: "YD-THESIS-02",
    title: "标题改写形成总论点",
    source: SOURCE,
    location: "核心方法·标题与总论点",
    dimensions: ["thesis", "structure"],
    instruction: "标题宜以题干关键词结合对策或影响表达，总论点应对标题作清晰、完整的句子化改写。"
  },
  {
    ruleId: "YD-SUBPOINT-03",
    title: "分论点按证据优先级提取",
    source: SOURCE,
    location: "核心方法·分论点来源",
    dimensions: ["thesis", "structure", "material"],
    instruction: "分论点来源优先级为题干、题干所在材料、全篇材料及客观小题；分论点之间须区分并共同支撑总论点。"
  },
  {
    ruleId: "YD-STRUCTURE-04",
    title: "总分总结构与篇幅配置",
    source: SOURCE,
    location: "理论课·文章结构",
    dimensions: ["structure"],
    instruction: "常规文章由开头、三段主体、结尾组成；约1000字通常五段，约1200字可根据内容采用四个分论点。"
  },
  {
    ruleId: "YD-INTRO-05",
    title: "开头四组件",
    source: SOURCE,
    location: "理论课·开头写法",
    dimensions: ["structure", "argument"],
    instruction: "开头依次完成名言或权威表达、主题影响、过渡、总论点；不要求机械套句，但必须尽快立论。"
  },
  {
    ruleId: "YD-ARGUMENT-06",
    title: "主体段完整论证链",
    source: SOURCE,
    location: "理论课·论证方法",
    dimensions: ["argument", "material"],
    instruction: "主体段按分论点、分析、事例、评论、回扣组织；论据之后必须解释其如何证明分论点。"
  },
  {
    ruleId: "YD-EVIDENCE-07",
    title: "要素、事例与名言论证",
    source: SOURCE,
    location: "理论课·论据选择",
    dimensions: ["argument", "material"],
    instruction: "可用背景、问题、原因、对策、影响等要素论证，也可用主体、做法、结果完整的事例或名言；论据领域须与观点匹配。"
  },
  {
    ruleId: "YD-CLOSING-08",
    title: "结尾回扣与升华",
    source: SOURCE,
    location: "理论课·结尾写法",
    dimensions: ["structure", "expression"],
    instruction: "结尾应呼应开头，回扣总论点和分论点，并以展望、号召或愿景完成收束。"
  },
  {
    ruleId: "YD-EXPRESSION-09",
    title: "规范、连贯与考场可执行",
    source: SOURCE,
    location: "练习课与作业讲评·表达要求",
    dimensions: ["expression"],
    instruction: "表达应准确、连贯、层次清楚，控制重复和空泛口号，并服从题目字数要求。"
  }
];

export const ESSAY_DIMENSION_WEIGHTS: Readonly<Record<EssayDimensionId, number>> = {
  thesis: 30,
  structure: 20,
  argument: 25,
  material: 15,
  expression: 10
};

export const ESSAY_DIMENSION_LABELS: Readonly<Record<EssayDimensionId, string>> = {
  thesis: "立意与总论点",
  structure: "结构与分论点",
  argument: "论证链条",
  material: "材料转化",
  expression: "语言与字数"
};

export function essayRulesForDimension(id: EssayDimensionId): EssayEvidenceRule[] {
  return YUAN_DONG_ESSAY_RULES.filter(rule => rule.dimensions.includes(id));
}

export function essayEvidencePrompt(): string {
  return YUAN_DONG_ESSAY_RULES.map(rule => `${rule.ruleId}｜${rule.title}：${rule.instruction}`).join("\n");
}
