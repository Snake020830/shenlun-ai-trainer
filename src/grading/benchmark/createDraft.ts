import type { Question } from "../../types";
import type { GradingBenchmarkCase } from "./types";

export interface CreateBenchmarkDraftOptions {
  caseId: string;
  source?: string;
  tags?: string[];
  createdAt?: string;
  trainingRecordId?: string;
}

export function createBenchmarkDraft(
  question: Question,
  answer: string,
  options: CreateBenchmarkDraftOptions
): GradingBenchmarkCase {
  if (!options.caseId.trim()) throw new Error("Benchmark draft caseId is required.");
  if (!answer.trim()) throw new Error("Benchmark draft answer is required.");
  const createdAt = options.createdAt ?? new Date().toISOString();

  return {
    schemaVersion: "0.1.0",
    id: options.caseId.trim(),
    tags: [...new Set([...(options.tags ?? []), question.type, ...question.tags])],
    annotationStatus: "draft",
    question: {
      id: question.id,
      title: question.title,
      type: question.type,
      maxScore: question.score,
      wordLimit: question.wordLimit,
      prompt: question.prompt,
      materials: question.materials.map(material => ({
        id: material.id,
        label: material.label,
        content: material.content
      })),
      referenceAnswer: question.referenceAnswer
        ? { ...question.referenceAnswer }
        : undefined
    },
    answer,
    gold: {
      materialPoints: [],
      rubric: [],
      mappings: [],
      humanScores: []
    },
    provenance: {
      source: options.source ?? `${question.source ?? "unknown"}:${question.id}`,
      ...(options.trainingRecordId?.trim() ? { trainingRecordId: options.trainingRecordId.trim() } : {}),
      createdAt,
      annotatedAt: undefined,
      adjudicationNotes: `Draft created ${createdAt}; gold fields require independent human annotation.`
    }
  };
}
