import { describe, expect, it } from "vitest";
import type { RemoteProviderPublicConfig } from "./config";
import { decodeRemoteJson, encodeRemoteCall } from "./protocol";

function config(protocol: RemoteProviderPublicConfig["protocol"], overrides: Partial<RemoteProviderPublicConfig> = {}): RemoteProviderPublicConfig {
  return {
    id: "test",
    label: "Test",
    enabled: true,
    protocol,
    baseUrl: "https://api.example.com/v1",
    model: "model-x",
    secretRef: "secret-x",
    timeoutMs: 30_000,
    reasoningEffort: "provider-default",
    ...overrides
  };
}

const request = {
  instructions: "return JSON",
  input: "data",
  schemaName: "test_schema",
  jsonSchema: { type: "object", properties: { ok: { type: "boolean" } } }
};

describe("remote protocol codec", () => {
  it("encodes Responses with store=false and json_schema", () => {
    const call = encodeRemoteCall(config("openai-responses"), request);
    expect(call.url).toBe("https://api.example.com/v1/responses");
    expect(call.body.store).toBe(false);
    expect(call.body.reasoning).toBeUndefined();
    expect(call.body.text).toEqual({
      format: {
        type: "json_schema",
        name: "test_schema",
        schema: request.jsonSchema,
        strict: false
      }
    });
  });

  it("adds reasoning effort only to Responses when explicitly configured", () => {
    const responses = encodeRemoteCall(config("openai-responses", { reasoningEffort: "high" }), request);
    expect(responses.body.reasoning).toEqual({ effort: "high" });

    const chat = encodeRemoteCall(config("openai-chat-completions", { reasoningEffort: "high" }), request);
    expect(chat.body.reasoning).toBeUndefined();
    expect(chat.body.reasoning_effort).toBeUndefined();
  });

  it("encodes generic Chat Completions with store=false and json_schema", () => {
    const call = encodeRemoteCall(config("openai-chat-completions"), request);
    expect(call.url).toBe("https://api.example.com/v1/chat/completions");
    expect(call.body.store).toBe(false);
    expect(call.body.response_format).toEqual({
      type: "json_schema",
      json_schema: {
        name: "test_schema",
        schema: request.jsonSchema,
        strict: false
      }
    });
  });

  it("encodes DeepSeek Chat Completions with json_object, output budget, and a JSON example", () => {
    const call = encodeRemoteCall(config("openai-chat-completions", {
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-pro"
    }), {
      ...request,
      maxOutputTokens: 12_000,
      jsonExample: { ok: true }
    });

    expect(call.url).toBe("https://api.deepseek.com/chat/completions");
    expect(call.body.store).toBeUndefined();
    expect(call.body.max_tokens).toBe(12_000);
    expect(call.body.response_format).toEqual({ type: "json_object" });
    const messages = call.body.messages as Array<{ role: string; content: string }>;
    expect(messages[0]?.content).toContain("合法 JSON 对象");
    expect(messages[0]?.content).toContain(JSON.stringify(request.jsonSchema));
    expect(messages[0]?.content).toContain("JSON 输出示例");
    expect(messages[0]?.content).toContain("{\"ok\":true}");
  });

  it("can fall back to prompt-only JSON with DeepSeek thinking disabled", () => {
    const call = encodeRemoteCall(config("openai-chat-completions", {
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-pro"
    }), {
      ...request,
      maxOutputTokens: 12_000,
      promptOnlyJson: true,
      disableThinking: true
    });

    expect(call.body.response_format).toBeUndefined();
    expect(call.body.thinking).toEqual({ type: "disabled" });
    expect(call.body.max_tokens).toBe(12_000);
  });

  it("decodes Chat Completions JSON content", () => {
    const result = decodeRemoteJson<{ ok: boolean }>(config("openai-chat-completions"), {
      model: "model-x",
      choices: [{ message: { content: "{\"ok\":true}" } }]
    }, "req-1");
    expect(result.data).toEqual({ ok: true });
    expect(result.providerRequestId).toBe("req-1");
  });

  it("decodes array-based Chat Completions text content from compatible providers", () => {
    const result = decodeRemoteJson<{ ok: boolean }>(config("openai-chat-completions"), {
      choices: [{ message: { content: [{ type: "text", text: "{\"ok\":true}" }] } }]
    });
    expect(result.data).toEqual({ ok: true });
  });

  it("decodes Responses output_text content", () => {
    const result = decodeRemoteJson<{ ok: boolean }>(config("openai-responses"), {
      model: "model-x",
      output: [{
        type: "message",
        content: [{ type: "output_text", text: "{\"ok\":true}" }]
      }]
    });
    expect(result.data).toEqual({ ok: true });
  });

  it("reports Chat Completions finish reason when structured content is empty", () => {
    expect(() => decodeRemoteJson(config("openai-chat-completions"), {
      choices: [{ finish_reason: "length", message: { content: "" } }],
      usage: {
        completion_tokens: 4096,
        completion_tokens_details: { reasoning_tokens: 3900 }
      }
    })).toThrow("finish_reason=length; completion_tokens=4096; reasoning_tokens=3900");
  });

  it("reports Responses incomplete reason when structured content is empty", () => {
    expect(() => decodeRemoteJson(config("openai-responses"), {
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" },
      output: []
    })).toThrow("status=incomplete; incomplete_reason=max_output_tokens");
  });

  it("fails closed on invalid JSON", () => {
    expect(() => decodeRemoteJson(config("openai-chat-completions"), {
      choices: [{ message: { content: "```json not-valid ```" } }]
    })).toThrow("invalid JSON");
  });
});
