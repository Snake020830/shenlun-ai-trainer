export type AppView = "today" | "library" | "import" | "practice" | "review" | "history" | "record" | "settings";

export interface MaterialBlock {
  id: string;
  label: string;
  content: string;
}

export interface QuestionReferenceAnswer {
  content: string;
  source?: string;
}

export type QuestionType = "概括归纳" | "提出对策" | "综合分析" | "贯彻执行" | "文章写作";
export type Difficulty = "基础" | "进阶" | "挑战";

export interface Question {
  id: string;
  title: string;
  year: number;
  region: string;
  type: QuestionType;
  difficulty: Difficulty;
  score: number;
  wordLimit: number;
  prompt: string;
  materials: MaterialBlock[];
  tags: string[];
  referenceAnswer?: QuestionReferenceAnswer;
  source?: "builtin" | "local";
  createdAt?: string;
}

export interface Draft {
  questionId: string;
  answer: string;
  updatedAt: string;
}

export interface ReviewPoint {
  title: string;
  status: "hit" | "partial" | "missed";
  evidence: string;
  suggestion?: string;
  errorCodes?: string[];
}

export interface ReviewReferenceCrossCheck {
  source?: string;
  blindRubricMissingDimensions: string[];
  referenceOnlyDimensions: string[];
  mergeDifferences: string[];
  notes: string[];
}

export interface StructuredReview {
  score: number;
  maxScore: number;
  coverage: string;
  classification: string;
  expression: string;
  redundancy: string;
  summary: string;
  points: ReviewPoint[];
  referenceCrossCheck?: ReviewReferenceCrossCheck;
  engine?: string;
  providerId?: string;
  rulesetVersion?: string;
  generatedAt?: string;
  scoringPolicy?: string;
  calibrationStatus?: "mock" | "uncalibrated" | "validated";
}

// Backward-compatible alias for V0.1 files and historical review snapshots.
// New provider code should use StructuredReview.
export type MockReview = StructuredReview;

export interface TrainingRecord {
  id: string;
  questionId: string;
  title: string;
  score: number;
  maxScore: number;
  submittedAt: string;
  submittedAtIso?: string;
  answer: string;
  review?: StructuredReview;
}

export interface StructuredMaterialInput {
  label: string;
  content: string;
}

export interface LocalQuestionInput {
  title: string;
  year: number;
  region: string;
  type: QuestionType;
  difficulty: Difficulty;
  score: number;
  wordLimit: number;
  prompt: string;
  /** Manual/compatibility persistence path. Public importers preserve the whole exam material order here. */
  materialText: string;
  /** Reserved structured import path for the later PDF/OCR/storage upgrade. */
  materials?: StructuredMaterialInput[];
  tags: string[];
  referenceAnswerContent?: string;
  referenceAnswerSource?: string;
}
