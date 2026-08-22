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

  it("encodes Chat Completions with store=false and json_schema", () => {
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

  it("decodes Chat Completions JSON content", () => {
    const result = decodeRemoteJson<{ ok: boolean }>(config("openai-chat-completions"), {
      model: "model-x",
      choices: [{ message: { content: "{\"ok\":true}" } }]
    }, "req-1");
    expect(result.data).toEqual({ ok: true });
    expect(result.providerRequestId).toBe("req-1");
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

  it("fails closed on invalid JSON", () => {
    expect(() => decodeRemoteJson(config("openai-chat-completions"), {
      choices: [{ message: { content: "```json not-valid ```" } }]
    })).toThrow("invalid JSON");
  });
});