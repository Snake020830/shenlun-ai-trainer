export type AppView = "today" | "library" | "practice" | "review" | "history" | "settings";

export interface MaterialBlock {
  id: string;
  label: string;
  content: string;
}

export interface Question {
  id: string;
  title: string;
  year: number;
  region: string;
  type: "概括归纳" | "提出对策" | "综合分析" | "贯彻执行" | "文章写作";
  difficulty: "基础" | "进阶" | "挑战";
  score: number;
  wordLimit: number;
  prompt: string;
  materials: MaterialBlock[];
  tags: string[];
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
}

export interface MockReview {
  score: number;
  maxScore: number;
  coverage: string;
  classification: string;
  expression: string;
  redundancy: string;
  summary: string;
  points: ReviewPoint[];
}

export interface TrainingRecord {
  id: string;
  questionId: string;
  title: string;
  score: number;
  maxScore: number;
  submittedAt: string;
  answer: string;
}
