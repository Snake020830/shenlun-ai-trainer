import { describe, expect, it, vi } from "vitest";
import type { Question } from "../../types";
import { createRemoteWorkflowProvider } from "./remoteWorkflowProvider";
import type { RemoteJsonRequest, RemoteModelTransport } from "./config";

const essayQuestion: Question = {
  id: "essay-1",
  title: "申论文章写作测试",
  year: 2026,
  region: "国家",
  type: "文章写作",
  difficulty: "挑战",
  score: 35,
  wordLimit: 1200,
  prompt: "请围绕给定主题写一篇文章。",
  materials: [{ id: "m1", label: "材料1", content: "用于作文立意和论证的给定资料。" }],
  tags: ["公开真题"]
};

const smallQuestion: Question = {
  id: "small-1",
  title: "提出对策测试",
  year: 2026,
  region: "国家",
  type: "提出对策",
  difficulty: "进阶",
  score: 20,
  wordLimit: 300,
  prompt: "根据材料提出改进建议。",
  materials: [{ id: "m1", label: "材料1", content: "基层服务存在流程重复、信息共享不足的问题，需要优化流程并加强部门协同。" }],
  tags: ["公开真题"]
};

function transport(enabled = true): RemoteModelTransport {
  const completeJson = vi.fn(async () => ({ data: {} }));
  return {
    config: {
      id: "test-provider",
      label: "Test provider",
      enabled,
      protocol: "openai-responses",
      baseUrl: "https://example.com/v1",
      model: "test-model",
      secretRef: "test-key",
      timeoutMs: 10_000,
      reasoningEffort: "provider-default"
    },
    completeJson: completeJson as unknown as RemoteModelTransport["completeJson"]
  };
}

function validExtraction() {
  return {
    materialCandidates: [{
      id: "c1",
      materialId: "m1",
      elementType: "problem",
      claim: "信息共享不足",
      evidence: "信息共享不足",
      independentDimension: true
    }]
  };
}

function validRubric() {
  return {
    rubric: [{
      id: "r1",
      title: "加强信息共享与协同",
      elementType: "measure",
      candidateIds: ["c1"],
      evidence: ["信息共享不足"]
    }]
  };
}

function validMapping() {
  return {
    mappings: [{
      rubricPointId: "r1",
      status: "hit",
      errorCodes: [],
      diagnosis: "答案已提出加强部门信息共享。",
      answerExcerpt: "加强部门信息共享"
    }]
  };
}

function validWordBudget() {
  return {
    wordBudget: {
      charCount: 8,
      wordLimit: 300,
      overLimit: false,
      redundantExcerpts: [],
      lowValueExcerpts: [],
      compressionAdvice: []
    }
  };
}

describe("remote grading workflow boundaries", () => {
  it("fails before any model call when an essay is sent to the small-question workflow", async () => {
    const remote = transport();
    const provider = createRemoteWorkflowProvider(remote);

    await expect(provider.grade({ question: essayQuestion, answer: "这是一篇测试文章。" }))
      .rejects.toThrow("文章写作暂不使用当前");
    expect(remote.completeJson).not.toHaveBeenCalled();
  });

  it("still checks the provider enabled flag before question-type routing", async () => {
    const remote = transport(false);
    const provider = createRemoteWorkflowProvider(remote);

    await expect(provider.grade({ question: essayQuestion, answer: "这是一篇测试文章。" }))
      .rejects.toThrow("disabled");
    expect(remote.completeJson).not.toHaveBeenCalled();
  });

  it("repairs one structurally invalid stage response and continues the real workflow", async () => {
    const remote = transport();
    const extractionAttempts = { count: 0 };
    remote.completeJson = vi.fn(async request => {
      if (request.schemaName === "shenlun_material_extraction_v01") {
        extractionAttempts.count += 1;
        return { data: extractionAttempts.count === 1
          ? { materialCandidates: [{ ...validExtraction().materialCandidates[0], materialId: "wrong" }] }
          : validExtraction() };
      }
      if (request.schemaName === "shenlun_rubric_construction_v01") return { data: validRubric() };
      if (request.schemaName === "shenlun_answer_mapping_v01") return { data: validMapping() };
      if (request.schemaName === "shenlun_word_budget_v01") return { data: validWordBudget() };
      throw new Error(`unexpected schema ${request.schemaName}`);
    }) as unknown as RemoteModelTransport["completeJson"];

    const provider = createRemoteWorkflowProvider(remote);
    const result = await provider.grade({ question: smallQuestion, answer: "加强部门信息共享" });

    expect(extractionAttempts.count).toBe(2);
    expect(result.artifacts?.materialCandidates).toHaveLength(1);
    expect(result.artifacts?.mappings).toHaveLength(1);
  });

  it("starts DeepSeek Stage 3 in direct prompt-only JSON mode and keeps it on repair", async () => {
    const remote = transport();
    remote.config.protocol = "openai-chat-completions";
    remote.config.baseUrl = "https://api.deepseek.com";
    remote.config.model = "deepseek-v4-pro";
    const mappingRequests: RemoteJsonRequest[] = [];

    remote.completeJson = vi.fn(async request => {
      if (request.schemaName === "shenlun_material_extraction_v01") return { data: validExtraction() };
      if (request.schemaName === "shenlun_rubric_construction_v01") return { data: validRubric() };
      if (request.schemaName === "shenlun_word_budget_v01") return { data: validWordBudget() };
      if (request.schemaName === "shenlun_answer_mapping_v01") {
        mappingRequests.push(request);
        if (mappingRequests.length === 1) {
          throw new Error("Remote provider returned no structured text output (finish_reason=length; reasoning_tokens=4096).");
        }
        return { data: validMapping() };
      }
      throw new Error(`unexpected schema ${request.schemaName}`);
    }) as unknown as RemoteModelTransport["completeJson"];

    const provider = createRemoteWorkflowProvider(remote);
    const result = await provider.grade({ question: smallQuestion, answer: "加强部门信息共享" });

    expect(result.artifacts?.mappings).toHaveLength(1);
    expect(mappingRequests).toHaveLength(2);
    expect(mappingRequests[0]?.promptOnlyJson).toBe(true);
    expect(mappingRequests[0]?.disableThinking).toBe(true);
    expect(mappingRequests[0]?.temperature).toBe(0);
    expect(mappingRequests[0]?.maxOutputTokens).toBe(12_000);
    expect(mappingRequests[1]?.promptOnlyJson).toBe(true);
    expect(mappingRequests[1]?.disableThinking).toBe(true);
    expect(mappingRequests[1]?.maxOutputTokens).toBeGreaterThanOrEqual(12_000);
    expect(mappingRequests[1]?.instructions).toContain("结构化输出兼容回退");
  });

  it("names the failing stage after the repair attempt also fails", async () => {
    const remote = transport();
    remote.completeJson = vi.fn(async request => {
      if (request.schemaName === "shenlun_material_extraction_v01") {
        return { data: { materialCandidates: [{ ...validExtraction().materialCandidates[0], materialId: "wrong" }] } };
      }
      return { data: {} };
    }) as unknown as RemoteModelTransport["completeJson"];

    const provider = createRemoteWorkflowProvider(remote);
    await expect(provider.grade({ question: smallQuestion, answer: "加强部门信息共享" }))
      .rejects.toThrow("Stage 1 材料抽取失败");
    expect(remote.completeJson).toHaveBeenCalledTimes(2);
  });
});
