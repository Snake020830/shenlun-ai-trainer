import type { GradingWorkflowArtifacts } from "../artifacts";
import { GRADING_RULESET_VERSION } from "../contracts";
import type { GradingProvider } from "../contracts";
import { assembleReview } from "../reviewAssembler";
import { equalRubricDiagnosticPolicy } from "../scorePolicy";
import type { ScorePolicy } from "../scorePolicy";
import {
  buildAnswerMappingRequest,
  buildMaterialExtractionRequest,
  buildReferenceCrossCheckRequest,
  buildRubricConstructionRequest,
  buildWordBudgetRequest
} from "../stagePrompts";
import {
  validateAnswerMapping,
  validateMaterialExtraction,
  validateReferenceCrossCheck,
  validateRubricConstruction,
  validateWordBudget
} from "../workflowValidation";
import type { RemoteJsonRequest, RemoteModelTransport, RemoteProviderPublicConfig } from "./config";

type StageName = "Stage 1 材料抽取" | "Stage 2 Rubric 构造" | "Stage 3 答案映射" | "Stage 4 表达与字数审计" | "Stage 5 参考答案交叉核验";

function errorText(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === "string" && error.trim()) return error.trim();
  return "未知错误";
}

function isDeepSeekConfig(config: RemoteProviderPublicConfig): boolean {
  try {
    return new URL(config.baseUrl).hostname.toLowerCase() === "api.deepseek.com";
  } catch {
    return false;
  }
}

function isEmptyStructuredOutput(error: unknown): boolean {
  return errorText(error).includes("no structured text output");
}

function repairRequest(
  request: RemoteJsonRequest,
  validationError: unknown,
  config: RemoteProviderPublicConfig
): RemoteJsonRequest {
  const deepSeekEmptyJson = isDeepSeekConfig(config) && isEmptyStructuredOutput(validationError);
  return {
    ...request,
    temperature: 0,
    ...(deepSeekEmptyJson ? {
      promptOnlyJson: true,
      disableThinking: true,
      maxOutputTokens: Math.max(request.maxOutputTokens ?? 0, 12_000)
    } : {}),
    instructions: `${request.instructions}\n\n上一次输出未通过应用的结构校验。请重新完成本阶段，不要解释错误，只返回一个符合约束的 JSON 对象。上一次校验错误：${errorText(validationError)}${deepSeekEmptyJson ? "\n本次为结构化输出兼容回退：直接生成最终 JSON，不要展开思考过程。" : ""}`
  };
}

async function runValidatedStage<T>(
  transport: RemoteModelTransport,
  stage: StageName,
  request: RemoteJsonRequest,
  validate: (value: unknown) => T
): Promise<T> {
  let firstError: unknown;
  try {
    const response = await transport.completeJson<unknown>(request);
    return validate(response.data);
  } catch (error) {
    firstError = error;
  }

  try {
    const response = await transport.completeJson<unknown>(repairRequest(request, firstError, transport.config));
    return validate(response.data);
  } catch (retryError) {
    throw new Error(`${stage}失败：${errorText(retryError)}`);
  }
}

export function createRemoteWorkflowProvider(
  transport: RemoteModelTransport,
  scorePolicy: ScorePolicy = equalRubricDiagnosticPolicy
): GradingProvider {
  return {
    id: `remote:${transport.config.id}`,
    kind: "remote",
    rulesetVersion: GRADING_RULESET_VERSION,
    async grade({ question, answer, referenceAnswer }) {
      if (!transport.config.enabled) {
        throw new Error("Remote grading provider is disabled.");
      }
      if (question.type === "文章写作") {
        throw new Error("文章写作暂不使用当前“小题材料点→rubric→逐点映射”远程评分流程。请等待专用作文论证评分 workflow；系统不会用小题规则生成误导性作文分数。");
      }

      const materialIds = new Set(question.materials.map(item => item.id));
      const extraction = await runValidatedStage(
        transport,
        "Stage 1 材料抽取",
        buildMaterialExtractionRequest(question),
        value => validateMaterialExtraction(value, materialIds)
      );

      const candidateIds = new Set(extraction.materialCandidates.map(item => item.id));
      const rubricOutput = await runValidatedStage(
        transport,
        "Stage 2 Rubric 构造",
        buildRubricConstructionRequest(question, extraction.materialCandidates),
        value => validateRubricConstruction(value, candidateIds)
      );
      const rubricIds = new Set(rubricOutput.rubric.map(item => item.id));

      const [mappingOutput, wordBudgetOutput] = await Promise.all([
        runValidatedStage(
          transport,
          "Stage 3 答案映射",
          buildAnswerMappingRequest(question, rubricOutput.rubric, answer),
          value => validateAnswerMapping(value, rubricIds)
        ),
        runValidatedStage(
          transport,
          "Stage 4 表达与字数审计",
          buildWordBudgetRequest(question, answer),
          value => validateWordBudget(value, question.wordLimit, answer.replace(/\s/g, "").length)
        )
      ]);

      let referenceCrossCheck: GradingWorkflowArtifacts["referenceCrossCheck"];
      if (referenceAnswer?.content.trim()) {
        const validatedReference = await runValidatedStage(
          transport,
          "Stage 5 参考答案交叉核验",
          buildReferenceCrossCheckRequest(question, rubricOutput.rubric, referenceAnswer),
          validateReferenceCrossCheck
        );
        referenceCrossCheck = {
          ...validatedReference.referenceCrossCheck,
          source: validatedReference.referenceCrossCheck.source ?? referenceAnswer.source
        };
      }

      const artifacts: GradingWorkflowArtifacts = {
        schemaVersion: "0.1.0",
        materialCandidates: extraction.materialCandidates,
        rubric: rubricOutput.rubric,
        mappings: mappingOutput.mappings,
        wordBudget: wordBudgetOutput.wordBudget,
        referenceCrossCheck
      };

      const review = assembleReview(question.score, artifacts, scorePolicy);
      return { review, artifacts };
    }
  };
}
