import type { RemoteJsonRequest, RemoteProviderPublicConfig, RemoteJsonResponse } from "./config";

export interface EncodedRemoteCall {
  url: string;
  body: Record<string, unknown>;
}

function endpoint(baseUrl: string, path: string): string {
  const normalized = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(path.replace(/^\//, ""), normalized).toString();
}

function responsesReasoning(config: RemoteProviderPublicConfig): Record<string, unknown> {
  if (config.reasoningEffort === "provider-default") return {};
  return { reasoning: { effort: config.reasoningEffort } };
}

function isDeepSeekBaseUrl(baseUrl: string): boolean {
  try {
    return new URL(baseUrl).hostname.toLowerCase() === "api.deepseek.com";
  } catch {
    return false;
  }
}

function deepSeekJsonInstructions(request: RemoteJsonRequest): string {
  if (!request.jsonSchema) return request.instructions;
  const example = request.jsonExample === undefined
    ? ""
    : `\n\nJSON 输出示例（仅示意结构；不得复制示例中的占位 ID 或示意值，必须使用本次输入中的真实数据）：\n${JSON.stringify(request.jsonExample)}`;
  return `${request.instructions}\n\n请只输出合法 JSON 对象，不要使用 Markdown 代码块或附加解释。输出必须严格遵循以下 JSON Schema：\n${JSON.stringify(request.jsonSchema)}${example}`;
}

export function encodeRemoteCall(
  config: RemoteProviderPublicConfig,
  request: RemoteJsonRequest
): EncodedRemoteCall {
  const deepSeek = isDeepSeekBaseUrl(config.baseUrl);

  if (config.protocol === "openai-responses") {
    const promptOnlyJson = deepSeek && request.promptOnlyJson;
    return {
      url: endpoint(config.baseUrl, "responses"),
      body: {
        model: config.model,
        instructions: promptOnlyJson ? deepSeekJsonInstructions(request) : request.instructions,
        input: request.input,
        store: false,
        ...(deepSeek && request.disableThinking
          ? { reasoning: { effort: "none" } }
          : responsesReasoning(config)),
        ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
        ...(request.maxOutputTokens === undefined ? {} : { max_output_tokens: request.maxOutputTokens }),
        text: {
          format: promptOnlyJson
            ? { type: "text" }
            : request.jsonSchema
              ? {
                  type: "json_schema",
                  name: request.schemaName,
                  schema: request.jsonSchema,
                  strict: false
                }
              : { type: "json_object" }
        }
      }
    };
  }

  const deepSeekResponseFormat = deepSeek && request.promptOnlyJson
    ? {}
    : deepSeek
      ? { response_format: { type: "json_object" } }
      : {
          response_format: request.jsonSchema
            ? {
                type: "json_schema",
                json_schema: {
                  name: request.schemaName,
                  schema: request.jsonSchema,
                  strict: false
                }
              }
            : { type: "json_object" }
        };

  // Compatibility mode deliberately omits generic reasoning controls because
  // OpenAI-compatible Chat Completions providers vary widely. DeepSeek is handled
  // explicitly: its current API supports thinking control and max_tokens, and its
  // JSON Output mode is known to occasionally return an empty content field.
  return {
    url: endpoint(config.baseUrl, "chat/completions"),
    body: {
      model: config.model,
      messages: [
        { role: "system", content: deepSeek ? deepSeekJsonInstructions(request) : request.instructions },
        { role: "user", content: request.input }
      ],
      ...(deepSeek ? {} : { store: false }),
      ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
      ...(deepSeek && request.maxOutputTokens !== undefined ? { max_tokens: request.maxOutputTokens } : {}),
      ...(deepSeek && request.disableThinking ? { thinking: { type: "disabled" } } : {}),
      ...deepSeekResponseFormat
    }
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function extractTextValue(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return null;
  const texts: string[] = [];
  for (const partValue of value) {
    const part = asRecord(partValue);
    if (!part) continue;
    if (typeof part.text === "string") texts.push(part.text);
    else if (typeof part.content === "string") texts.push(part.content);
  }
  return texts.length ? texts.join("") : null;
}

function firstChatChoice(raw: Record<string, unknown>): Record<string, unknown> | null {
  const choices = raw.choices;
  if (!Array.isArray(choices) || !choices.length) return null;
  return asRecord(choices[0]);
}

function extractChatText(raw: Record<string, unknown>): string | null {
  const first = firstChatChoice(raw);
  const message = first ? asRecord(first.message) : null;
  return message ? extractTextValue(message.content) : null;
}

function extractResponsesText(raw: Record<string, unknown>): string | null {
  if (typeof raw.output_text === "string") return raw.output_text;
  const output = raw.output;
  if (!Array.isArray(output)) return null;

  const texts: string[] = [];
  for (const itemValue of output) {
    const item = asRecord(itemValue);
    if (!item || item.type !== "message" || !Array.isArray(item.content)) continue;
    for (const partValue of item.content) {
      const part = asRecord(partValue);
      if (part?.type === "output_text" && typeof part.text === "string") texts.push(part.text);
    }
  }
  return texts.length ? texts.join("") : null;
}

function chatRefusal(raw: Record<string, unknown>): string | null {
  const first = firstChatChoice(raw);
  const message = first ? asRecord(first.message) : null;
  return message && typeof message.refusal === "string" ? message.refusal : null;
}

function emptyOutputDetail(config: RemoteProviderPublicConfig, raw: Record<string, unknown>): string {
  const details: string[] = [];
  if (config.protocol === "openai-chat-completions") {
    const first = firstChatChoice(raw);
    if (first && typeof first.finish_reason === "string") details.push(`finish_reason=${first.finish_reason}`);
    const usage = asRecord(raw.usage);
    if (usage && typeof usage.completion_tokens === "number") details.push(`completion_tokens=${usage.completion_tokens}`);
    const tokenDetails = usage ? asRecord(usage.completion_tokens_details) : null;
    if (tokenDetails && typeof tokenDetails.reasoning_tokens === "number") details.push(`reasoning_tokens=${tokenDetails.reasoning_tokens}`);
  } else {
    if (typeof raw.status === "string") details.push(`status=${raw.status}`);
    const incomplete = asRecord(raw.incomplete_details);
    if (incomplete && typeof incomplete.reason === "string") details.push(`incomplete_reason=${incomplete.reason}`);
    const error = asRecord(raw.error);
    if (error && typeof error.code === "string") details.push(`error_code=${error.code}`);
  }
  return details.length ? ` (${details.join("; ")})` : "";
}

export function decodeRemoteJson<T>(
  config: RemoteProviderPublicConfig,
  raw: unknown,
  providerRequestId?: string
): RemoteJsonResponse<T> {
  const record = asRecord(raw);
  if (!record) throw new Error("Remote provider returned a non-object response.");

  const refusal = typeof record.refusal === "string" ? record.refusal : chatRefusal(record);
  if (refusal) throw new Error("Remote provider refused the grading request.");

  const text = config.protocol === "openai-responses"
    ? extractResponsesText(record)
    : extractChatText(record);
  if (!text?.trim()) {
    throw new Error(`Remote provider returned no structured text output${emptyOutputDetail(config, record)}.`);
  }

  let data: T;
  try {
    data = JSON.parse(text) as T;
  } catch {
    throw new Error("Remote provider returned invalid JSON.");
  }

  return {
    data,
    providerRequestId,
    model: typeof record.model === "string" ? record.model : config.model
  };
}
