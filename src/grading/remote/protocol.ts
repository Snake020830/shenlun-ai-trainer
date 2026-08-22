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

export function encodeRemoteCall(
  config: RemoteProviderPublicConfig,
  request: RemoteJsonRequest
): EncodedRemoteCall {
  if (config.protocol === "openai-responses") {
    return {
      url: endpoint(config.baseUrl, "responses"),
      body: {
        model: config.model,
        instructions: request.instructions,
        input: request.input,
        store: false,
        ...responsesReasoning(config),
        ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
        text: {
          format: request.jsonSchema
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

  // Compatibility mode deliberately omits reasoning controls. OpenAI-compatible
  // Chat Completions providers vary widely in whether and how they expose them.
  return {
    url: endpoint(config.baseUrl, "chat/completions"),
    body: {
      model: config.model,
      messages: [
        { role: "system", content: request.instructions },
        { role: "user", content: request.input }
      ],
      store: false,
      ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
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
    }
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function extractChatText(raw: Record<string, unknown>): string | null {
  const choices = raw.choices;
  if (!Array.isArray(choices) || !choices.length) return null;
  const first = asRecord(choices[0]);
  const message = first ? asRecord(first.message) : null;
  return message && typeof message.content === "string" ? message.content : null;
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

export function decodeRemoteJson<T>(
  config: RemoteProviderPublicConfig,
  raw: unknown,
  providerRequestId?: string
): RemoteJsonResponse<T> {
  const record = asRecord(raw);
  if (!record) throw new Error("Remote provider returned a non-object response.");

  const refusal = typeof record.refusal === "string" ? record.refusal : null;
  if (refusal) throw new Error("Remote provider refused the grading request.");

  const text = config.protocol === "openai-responses"
    ? extractResponsesText(record)
    : extractChatText(record);
  if (!text?.trim()) throw new Error("Remote provider returned no structured text output.");

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