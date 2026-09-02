import type { EssayDrillDraft, EssayDrillDraftEntry } from "./essayDrillStore";
import type { Draft, TrainingRecord } from "./types";

export interface InProgressPractice {
  questionId: string;
  updatedAt: string;
  answerChars: number;
  answerPreview: string;
  essayStepCount: number;
  hasFullAnswer: boolean;
  hasEssayDrill: boolean;
}

const ESSAY_STEP_CONTENT = [
  (draft: EssayDrillDraft) => `${draft.theme.quickTitle} ${draft.theme.quickText}`,
  (draft: EssayDrillDraft) => draft.outline.quickText,
  (draft: EssayDrillDraft) => draft.paragraph.quickText,
  (draft: EssayDrillDraft) => draft.evidence.quickText,
  (draft: EssayDrillDraft) => draft.closing.quickText
];

function timeValue(value?: string): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function essayDrillCompletedStepCount(draft: EssayDrillDraft): number {
  return ESSAY_STEP_CONTENT.filter(read => read(draft).trim().length > 0).length;
}

export function buildInProgressPractices(
  drafts: Draft[],
  essayDrafts: EssayDrillDraftEntry[],
  history: TrainingRecord[]
): InProgressPractice[] {
  const answerByQuestion = new Map(
    drafts.filter(draft => draft.answer.trim()).map(draft => [draft.questionId, draft])
  );
  const essayByQuestion = new Map(
    essayDrafts
      .map(entry => ({ ...entry, stepCount: essayDrillCompletedStepCount(entry.draft) }))
      .filter(entry => entry.stepCount > 0)
      .map(entry => [entry.questionId, entry])
  );
  const latestSubmission = new Map<string, number>();
  history.forEach(record => {
    const submitted = timeValue(record.submittedAtIso ?? record.submittedAt);
    latestSubmission.set(record.questionId, Math.max(latestSubmission.get(record.questionId) ?? 0, submitted));
  });

  return [...new Set([...answerByQuestion.keys(), ...essayByQuestion.keys()])]
    .map(questionId => {
      const answerDraft = answerByQuestion.get(questionId);
      const essayEntry = essayByQuestion.get(questionId);
      const answerUpdated = timeValue(answerDraft?.updatedAt);
      const essayUpdated = timeValue(essayEntry?.draft.updatedAt);
      const updatedAt = answerUpdated >= essayUpdated
        ? answerDraft?.updatedAt ?? essayEntry?.draft.updatedAt ?? ""
        : essayEntry?.draft.updatedAt ?? answerDraft?.updatedAt ?? "";
      return {
        questionId,
        updatedAt,
        answerChars: answerDraft?.answer.replace(/\s/g, "").length ?? 0,
        answerPreview: answerDraft?.answer.trim().replace(/\s+/g, " ").slice(0, 100) ?? "",
        essayStepCount: essayEntry?.stepCount ?? 0,
        hasFullAnswer: Boolean(answerDraft),
        hasEssayDrill: Boolean(essayEntry)
      };
    })
    .filter(item => timeValue(item.updatedAt) > (latestSubmission.get(item.questionId) ?? 0))
    .sort((left, right) => timeValue(right.updatedAt) - timeValue(left.updatedAt));
}
