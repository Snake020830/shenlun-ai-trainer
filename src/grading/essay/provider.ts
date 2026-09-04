import type { Question } from "../../types";
import { validateReview } from "../contracts";
import type { GradingRequest } from "../contracts";
import type { RemoteJsonRequest, RemoteModelTransport } from "../remote/config";
import { assembleEssayReview } from "./assembler";
import type { EssayGradingArtifacts, EssayEvaluationOutput, EssayTaskAnalysisOutput } from "./artifacts";
import { ESSAY_RULESET_VERSION } from "./evidence";
import { buildEssayEvaluationRequest, buildEssayTaskAnalysisRequest } from "./prompts";
import { validateEssayEvaluation, validateEssayTaskAnalysis } from "./validation";

export interface EssayGradingProviderOutput {
  review: ReturnType<typeof assembleEssayReview>;
  artifacts: EssayGradingArtifacts;
}

export interface EssayGradingProvider {
  id: string;
  kind: "mock" | "remote" | "local";
  rulesetVersion: string;
  grade(request: GradingRequest): Promise<EssayGradingProviderOutput>;
}

function ensureEssay(question: Question): void {
  if (question.type !== "文章写作") throw new Error("Essay Grader only accepts 文章写作 questions.");
}

function errorText(error: unknown): string {
  return error instanceof Error && error.message.trim() ? error.message.trim() : String(error);
}

async function runStage<T>(transport: RemoteModelTransport, request: RemoteJsonRequest, validate: (value: unknown) => T, label: string): Promise<T> {
  let firstError: unknown;
  try {
    const response = await transport.completeJson<unknown>(request);
    return validate(response.data);
  } catch (error) {
    firstError = error;
  }
  try {
    const response = await transport.completeJson<unknown>({
      ...request,
      temperature: 0,
      promptOnlyJson: true,
      disableThinking: true,
      maxOutputTokens: Math.max(request.maxOutputTokens ?? 0, 12_000),
      instructions: `${request.instructions}\n上一次输出未通过结构校验。请直接重做并只返回 JSON。校验错误：${errorText(firstError)}`
    });
    return validate(response.data);
  } catch (error) {
    throw new Error(`${label}失败：${errorText(error)}`);
  }
}

export function createRemoteEssayGradingProvider(transport: RemoteModelTransport, customStyle = ""): EssayGradingProvider {
  return {
    id: `remote-essay:${transport.config.id}`,
    kind: "remote",
    rulesetVersion: ESSAY_RULESET_VERSION,
    async grade({ question, answer }) {
      if (!transport.config.enabled) throw new Error("Remote essay grading provider is disabled.");
      ensureEssay(question);
      const taskAnalysis = await runStage<EssayTaskAnalysisOutput>(
        transport,
        buildEssayTaskAnalysisRequest(question),
        validateEssayTaskAnalysis,
        "作文 Stage 1 审题建构"
      );
      const evaluation = await runStage<EssayEvaluationOutput>(
        transport,
        buildEssayEvaluationRequest(question, taskAnalysis, answer, customStyle),
        validateEssayEvaluation,
        "作文 Stage 2 文章诊断"
      );
      const artifacts: EssayGradingArtifacts = {
        schemaVersion: "1.0.0",
        taskAnalysis,
        evaluation,
        answerCharCount: answer.replace(/\s/g, "").length,
        wordLimit: question.wordLimit
      };
      return { review: assembleEssayReview(question.score, artifacts), artifacts };
    }
  };
}

export function createEssayGradingService(provider: EssayGradingProvider) {
  return {
    provider,
    async gradeDetailed(request: GradingRequest): Promise<EssayGradingProviderOutput> {
      ensureEssay(request.question);
      if (!request.answer.trim()) throw new Error("Cannot grade an empty essay.");
      const output = await provider.grade(request);
      const review = validateReview(output.review, request.question.score);
      if (!review.essayReview) throw new Error("Essay grading result is missing essayReview details.");
      return {
        ...output,
        review: {
          ...review,
          engine: review.engine ?? `${provider.id}:${provider.rulesetVersion}`,
          providerId: review.providerId ?? provider.id,
          rulesetVersion: review.rulesetVersion ?? provider.rulesetVersion,
          generatedAt: review.generatedAt ?? new Date().toISOString()
        }
      };
    },
    async grade(request: GradingRequest) {
      return (await this.gradeDetailed(request)).review;
    }
  };
}
