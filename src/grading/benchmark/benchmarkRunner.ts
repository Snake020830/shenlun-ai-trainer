import type { Question } from "../../types";
import { gradeAnswerDetailed } from "../index";
import { loadRemoteProviderConfig } from "../providerSettings";
import type { RemoteProviderPublicConfig } from "../remote/config";
import { createBenchmarkModelRun } from "./modelRun";
import { saveBenchmarkModelRun } from "./modelRunStore";
import type { BenchmarkModelRun, GradingBenchmarkCase } from "./types";

export interface BenchmarkRunOptions {
  useReferenceCrossCheck?: boolean;
}

interface BenchmarkRunnerDependencies {
  loadConfig: () => Promise<RemoteProviderPublicConfig>;
  gradeDetailed: typeof gradeAnswerDetailed;
  saveRun: typeof saveBenchmarkModelRun;
  createRunId: () => string;
}

const defaultDependencies: BenchmarkRunnerDependencies = {
  loadConfig: loadRemoteProviderConfig,
  gradeDetailed: gradeAnswerDetailed,
  saveRun: saveBenchmarkModelRun,
  createRunId: () => `run-${crypto.randomUUID()}`
};

// Stage prompts only serialize id/type/score/wordLimit/prompt/materials.
// These neutral metadata fields satisfy the product Question type without entering model input.
export function questionFromBenchmarkCase(testCase: GradingBenchmarkCase): Question {
  return {
    id: testCase.question.id,
    title: testCase.question.title,
    year: 0,
    region: "benchmark-frozen-snapshot",
    type: testCase.question.type as Question["type"],
    difficulty: "进阶",
    score: testCase.question.maxScore,
    wordLimit: testCase.question.wordLimit,
    prompt: testCase.question.prompt,
    materials: testCase.question.materials.map(item => ({ ...item })),
    tags: [...testCase.tags],
    source: "local"
  };
}

export function createBenchmarkExperimentRunner(
  dependencies: BenchmarkRunnerDependencies = defaultDependencies
) {
  return async function runBenchmarkCase(
    testCase: GradingBenchmarkCase,
    options: BenchmarkRunOptions = {}
  ): Promise<BenchmarkModelRun> {
    if (testCase.annotationStatus !== "adjudicated") {
      throw new Error("Benchmark experiments require an adjudicated human-gold case.");
    }

    const config = await dependencies.loadConfig();
    if (!config.enabled) {
      throw new Error("Remote grading must be explicitly enabled before running a benchmark experiment.");
    }

    const useReferenceCrossCheck = Boolean(options.useReferenceCrossCheck);
    if (useReferenceCrossCheck && !testCase.question.referenceAnswer) {
      throw new Error("Reference cross-check was requested but this benchmark case has no reference answer.");
    }

    const output = await dependencies.gradeDetailed({
      question: questionFromBenchmarkCase(testCase),
      answer: testCase.answer,
      referenceAnswer: useReferenceCrossCheck ? testCase.question.referenceAnswer : undefined
    });
    if (!output.artifacts) {
      throw new Error("Benchmark experiments require full workflow artifacts; review-only output is not accepted.");
    }

    const run = createBenchmarkModelRun(testCase.id, output, {
      runId: dependencies.createRunId(),
      model: config.model,
      protocol: config.protocol,
      reasoningEffort: config.reasoningEffort
    });
    if (run.referenceCrossCheckUsed !== useReferenceCrossCheck) {
      throw new Error("Benchmark run reference-cross-check provenance does not match the requested experiment condition.");
    }

    await dependencies.saveRun(run);
    return run;
  };
}

export const runBenchmarkCase = createBenchmarkExperimentRunner();
