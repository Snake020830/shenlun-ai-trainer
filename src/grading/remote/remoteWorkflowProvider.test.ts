import { describe, expect, it, vi } from "vitest";
import type { Question } from "../../types";
import { createRemoteWorkflowProvider } from "./remoteWorkflowProvider";
import type { RemoteModelTransport } from "./config";

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
});
