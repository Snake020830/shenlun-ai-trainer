import type { AnswerMappingArtifact, RubricPointArtifact } from "./artifacts";

export interface ScorePolicyInput {
  maxScore: number;
  rubric: RubricPointArtifact[];
  mappings: AnswerMappingArtifact[];
}

export interface ScorePolicyResult {
  score: number;
  policyId: string;
  calibrationStatus: "uncalibrated" | "validated";
}

export interface ScorePolicy {
  id: string;
  calibrationStatus: "uncalibrated" | "validated";
  score(input: ScorePolicyInput): ScorePolicyResult;
}

const STATUS_WEIGHT: Record<AnswerMappingArtifact["status"], number> = {
  hit: 1,
  partial: 0.5,
  missed: 0
};

export const equalRubricDiagnosticPolicy: ScorePolicy = {
  id: "equal-rubric-diagnostic@0.1.0",
  calibrationStatus: "uncalibrated",
  score({ maxScore, rubric, mappings }) {
    if (!rubric.length) {
      return { score: 0, policyId: this.id, calibrationStatus: this.calibrationStatus };
    }
    const mappingById = new Map(mappings.map(item => [item.rubricPointId, item]));
    const earnedRatio = rubric.reduce((sum, point) => {
      const mapping = mappingById.get(point.id);
      return sum + (mapping ? STATUS_WEIGHT[mapping.status] : 0);
    }, 0) / rubric.length;

    return {
      score: Number((maxScore * earnedRatio).toFixed(1)),
      policyId: this.id,
      calibrationStatus: this.calibrationStatus
    };
  }
};
