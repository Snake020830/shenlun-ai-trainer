import type { Question, QuestionType, StructuredReview, TrainingRecord } from "../types";
import type { GradingRequest } from "./contracts";

export const GRADER_REGRESSION_PLAN_VERSION = "shenlun-regression-plan@0.1.0";

export interface ShenlunRegressionCase {
  id: string;
  question: Question;
  answer: string;
  baselineReview?: StructuredReview;
  submittedAtIso?: string;
}

const TYPE_ORDER: QuestionType[] = ["概括归纳", "综合分析", "提出对策", "贯彻执行", "文章写作"];

function recordTimestamp(record: TrainingRecord): number {
  const value = record.submittedAtIso ? Date.parse(record.submittedAtIso) : Date.parse(record.submittedAt);
  return Number.isFinite(value) ? value : 0;
}

function isRealQuestion(question: Question): boolean {
  return question.source === "local" && question.materials.length > 0 && question.prompt.trim().length > 0;
}

export function selectShenlunRegressionCases(
  questions: Question[],
  records: TrainingRecord[],
  targetSize = 15
): ShenlunRegressionCase[] {
  const cappedTarget = Math.max(5, Math.min(20, Math.floor(targetSize)));
  const questionById = new Map(questions.filter(isRealQuestion).map(question => [question.id, question]));
  const latestByQuestion = new Map<string, TrainingRecord>();

  for (const record of [...records].sort((left, right) => recordTimestamp(right) - recordTimestamp(left))) {
    if (!record.answer.trim() || !questionById.has(record.questionId)) continue;
    if (!latestByQuestion.has(record.questionId)) latestByQuestion.set(record.questionId, record);
  }

  const buckets = new Map<QuestionType, ShenlunRegressionCase[]>(TYPE_ORDER.map(type => [type, []]));
  for (const record of latestByQuestion.values()) {
    const question = questionById.get(record.questionId);
    if (!question) continue;
    buckets.get(question.type)?.push({
      id: `regression:${record.id}`,
      question,
      answer: record.answer,
      baselineReview: record.review,
      submittedAtIso: record.submittedAtIso
    });
  }

  for (const bucket of buckets.values()) {
    bucket.sort((left, right) => {
      const publicPriority = Number(right.question.id.startsWith("publicq:")) - Number(left.question.id.startsWith("publicq:"));
      if (publicPriority !== 0) return publicPriority;
      return (Date.parse(right.submittedAtIso ?? "") || 0) - (Date.parse(left.submittedAtIso ?? "") || 0);
    });
  }

  const selected: ShenlunRegressionCase[] = [];
  let round = 0;
  while (selected.length < cappedTarget) {
    let added = false;
    for (const type of TYPE_ORDER) {
      const item = buckets.get(type)?.[round];
      if (!item) continue;
      selected.push(item);
      added = true;
      if (selected.length >= cappedTarget) break;
    }
    if (!added) break;
    round += 1;
  }
  return selected;
}

export function regressionCaseToGradingRequest(item: ShenlunRegressionCase): GradingRequest {
  return {
    question: item.question,
    answer: item.answer,
    referenceAnswer: item.question.referenceAnswer
  };
}

export function summarizeRegressionCoverage(cases: ShenlunRegressionCase[]) {
  const byType = Object.fromEntries(TYPE_ORDER.map(type => [type, cases.filter(item => item.question.type === type).length])) as Record<QuestionType, number>;
  return {
    planVersion: GRADER_REGRESSION_PLAN_VERSION,
    total: cases.length,
    publicQuestionCount: cases.filter(item => item.question.id.startsWith("publicq:")).length,
    withBaselineReview: cases.filter(item => Boolean(item.baselineReview)).length,
    byType,
    readyForSmokeReplay: cases.length >= 10 && TYPE_ORDER.filter(type => byType[type] > 0).length >= 4
  };
}
