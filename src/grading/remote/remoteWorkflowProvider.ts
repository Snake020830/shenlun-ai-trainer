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
import type { RemoteModelTransport } from "./config";

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

      const materialIds = new Set(question.materials.map(item => item.id));
      const extractionResponse = await transport.completeJson<unknown>(buildMaterialExtractionRequest(question));
      const extraction = validateMaterialExtraction(extractionResponse.data, materialIds);

      const candidateIds = new Set(extraction.materialCandidates.map(item => item.id));
      const rubricResponse = await transport.completeJson<unknown>(
        buildRubricConstructionRequest(question, extraction.materialCandidates)
      );
      const rubricOutput = validateRubricConstruction(rubricResponse.data, candidateIds);
      const rubricIds = new Set(rubricOutput.rubric.map(item => item.id));

      const [mappingResponse, wordBudgetResponse] = await Promise.all([
        transport.completeJson<unknown>(buildAnswerMappingRequest(question, rubricOutput.rubric, answer)),
        transport.completeJson<unknown>(buildWordBudgetRequest(question, answer))
      ]);
      const mappingOutput = validateAnswerMapping(mappingResponse.data, rubricIds);
      const actualCharCount = answer.replace(/\s/g, "").length;
      const wordBudgetOutput = validateWordBudget(
        wordBudgetResponse.data,
        question.wordLimit,
        actualCharCount
      );

      let referenceCrossCheck: GradingWorkflowArtifacts["referenceCrossCheck"];
      if (referenceAnswer?.content.trim()) {
        const referenceResponse = await transport.completeJson<unknown>(
          buildReferenceCrossCheckRequest(question, rubricOutput.rubric, referenceAnswer)
        );
        const validatedReference = validateReferenceCrossCheck(referenceResponse.data);
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
