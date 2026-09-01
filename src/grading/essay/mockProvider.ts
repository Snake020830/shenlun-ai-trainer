import type { EssayDimensionId, Question } from "../../types";
import type { GradingRequest } from "../contracts";
import { assembleEssayReview } from "./assembler";
import type { EssayDimensionAssessment, EssayEvaluationOutput, EssayGradingArtifacts, EssayTaskAnalysisOutput } from "./artifacts";
import { ESSAY_DIMENSION_WEIGHTS, ESSAY_RULESET_VERSION, essayRulesForDimension } from "./evidence";
import type { EssayGradingProvider } from "./provider";

function paragraphs(answer: string): string[] {
  const split = answer.split(/\n+/).map(item => item.trim()).filter(Boolean);
  return split.length > 1 ? split : answer.split(/(?<=[。！？])/).map(item => item.trim()).filter(Boolean);
}

function dimension(id: EssayDimensionId, ratio: number, finding: string, evidence: string, action: string): EssayDimensionAssessment {
  return {
    id,
    score: Number((ESSAY_DIMENSION_WEIGHTS[id] * ratio).toFixed(1)),
    finding,
    answerEvidence: evidence || "模拟检查未能稳定识别对应原文。",
    action,
    evidenceRuleIds: essayRulesForDimension(id).slice(0, 2).map(rule => rule.ruleId)
  };
}

function taskAnalysis(question: Question): EssayTaskAnalysisOutput {
  const keywords = question.prompt.match(/[\u4e00-\u9fff]{2,8}/g)?.slice(0, 3) ?? ["题干主题"];
  return {
    themeType: keywords.length >= 3 ? "multi" : keywords.length === 2 ? "double" : "single",
    topicKeywords: keywords,
    proposedThesis: `围绕“${keywords.join("、")}”形成明确总论点。`,
    subpointCandidates: [
      { claim: "从题干核心关系提炼第一个分论点", source: "prompt", sourceEvidence: question.prompt.slice(0, 80) },
      { claim: "从命题材料提炼第二个分论点", source: "prompt-material", sourceEvidence: question.materials[0]?.content.slice(0, 80) || question.prompt }
    ],
    taskEvidence: question.prompt
  };
}

function evaluation(question: Question, answer: string): EssayEvaluationOutput {
  const blocks = paragraphs(answer);
  const charCount = answer.replace(/\s/g, "").length;
  const title = blocks[0]?.slice(0, 30) || "未识别标题";
  const hasStructure = blocks.length >= 4;
  const hasArgument = /(例如|譬如|实践|某地|这说明|由此|因此|可见)/.test(answer);
  const hasMaterial = /(材料|资料|实践|某地|某村|某市)/.test(answer);
  const lengthRatio = Math.min(1, charCount / Math.max(1, question.wordLimit * 0.75));
  return {
    summary: "当前为本地模拟诊断，仅用于验证独立作文流程和界面；启用并通过远程模型自检后才能生成基于全文语义的课程证据诊断。",
    dimensions: [
      dimension("thesis", blocks.length ? 0.62 : 0.2, "模拟器仅检查是否存在可识别标题与正文。", title, "在标题和开头明确写出题干主题词及总论点。"),
      dimension("structure", hasStructure ? 0.7 : 0.38, `识别到约 ${blocks.length} 个段落单元。`, blocks.slice(0, 2).join(" / "), "按开头—主体分论点—结尾重新分段。"),
      dimension("argument", hasArgument ? 0.68 : 0.35, "模拟器检查论据提示词和分析回扣词。", blocks[1]?.slice(0, 80) || title, "任选一段补齐分析—事例—评论—回扣。"),
      dimension("material", hasMaterial ? 0.65 : 0.32, "模拟器未做真实材料语义比对。", blocks.find(item => /(材料|实践|某地)/.test(item))?.slice(0, 80) || title, "把一则材料事实改写为主体—做法—结果，并说明证明关系。"),
      dimension("expression", Math.max(0.3, lengthRatio * 0.75), `当前约 ${charCount} 字。`, blocks.at(-1)?.slice(0, 80) || title, charCount > question.wordLimit ? "先压缩重复表达并回到字数上限内。" : "检查重复、空泛口号与段间衔接。")
    ],
    structureTrace: {
      title,
      centralThesis: blocks[1]?.slice(0, 100) || "模拟检查未稳定识别总论点",
      subpoints: blocks.slice(2, Math.min(blocks.length - 1, 5)).map(item => item.slice(0, 60)),
      paragraphCount: Math.max(1, blocks.length),
      introductionAssessment: hasStructure ? "已形成独立开头单元。" : "段落不足，无法确认开头四组件。",
      conclusionAssessment: blocks.length >= 5 ? "已形成独立结尾单元。" : "未稳定识别独立结尾。"
    },
    revisedOutline: {
      title: `以${taskAnalysis(question).topicKeywords[0]}推动发展`,
      thesis: taskAnalysis(question).proposedThesis,
      subpoints: taskAnalysis(question).subpointCandidates.map(item => item.claim),
      paragraphPlan: ["开头：引题—影响—过渡—总论点", "主体一：分论点—分析—事例—评论—回扣", "主体二：分论点—分析—事例—评论—回扣", "结尾：回扣总分论点并展望"]
    }
  };
}

export const mockEssayGradingProvider: EssayGradingProvider = {
  id: "mock-essay-v1",
  kind: "mock",
  rulesetVersion: ESSAY_RULESET_VERSION,
  async grade({ question, answer }: GradingRequest) {
    if (question.type !== "文章写作") throw new Error("Essay Grader only accepts 文章写作 questions.");
    const artifacts: EssayGradingArtifacts = {
      schemaVersion: "1.0.0",
      taskAnalysis: taskAnalysis(question),
      evaluation: evaluation(question, answer),
      answerCharCount: answer.replace(/\s/g, "").length,
      wordLimit: question.wordLimit
    };
    return { review: assembleEssayReview(question.score, artifacts), artifacts };
  }
};
