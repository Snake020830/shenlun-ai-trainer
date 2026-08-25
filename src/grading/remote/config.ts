export type RemoteProtocol = "openai-chat-completions" | "openai-responses";
export type ReasoningEffort = "provider-default" | "low" | "medium" | "high" | "xhigh";

export interface RemoteProviderPublicConfig {
  id: string;
  label: string;
  enabled: boolean;
  protocol: RemoteProtocol;
  baseUrl: string;
  model: string;
  secretRef: string;
  timeoutMs: number;
  reasoningEffort: ReasoningEffort;
}

export interface RemoteJsonRequest {
  instructions: string;
  input: string;
  schemaName: string;
  jsonSchema?: Record<string, unknown>;
  jsonExample?: unknown;
  temperature?: number;
  maxOutputTokens?: number;
  promptOnlyJson?: boolean;
  disableThinking?: boolean;
}

export interface RemoteJsonResponse<T = unknown> {
  data: T;
  providerRequestId?: string;
  model?: string;
}

export interface RemoteModelTransport {
  readonly config: RemoteProviderPublicConfig;
  completeJson<T>(request: RemoteJsonRequest): Promise<RemoteJsonResponse<T>>;
}

export const DEFAULT_REMOTE_PROVIDER_CONFIG: RemoteProviderPublicConfig = {
  id: "remote-default",
  label: "Remote provider",
  enabled: false,
  protocol: "openai-responses",
  baseUrl: "",
  model: "",
  secretRef: "grading-provider-api-key",
  timeoutMs: 120_000,
  reasoningEffort: "provider-default"
};

const REASONING_EFFORTS = new Set<ReasoningEffort>([
  "provider-default",
  "low",
  "medium",
  "high",
  "xhigh"
]);

export function validatePublicProviderConfig(config: RemoteProviderPublicConfig): void {
  if (!config.enabled) return;
  if (!config.id.trim()) throw new Error("Remote provider id is required.");
  if (!config.model.trim()) throw new Error("Remote provider model is required.");
  if (!/^[A-Za-z0-9._-]{1,96}$/.test(config.secretRef)) {
    throw new Error("Remote provider secretRef is invalid.");
  }
  if (!Number.isFinite(config.timeoutMs) || config.timeoutMs < 1_000 || config.timeoutMs > 300_000) {
    throw new Error("Remote provider timeoutMs must be between 1000ms and 300000ms.");
  }
  if (!REASONING_EFFORTS.has(config.reasoningEffort)) {
    throw new Error("Remote provider reasoningEffort is invalid.");
  }

  let url: URL;
  try {
    url = new URL(config.baseUrl);
  } catch {
    throw new Error("Remote provider baseUrl must be a valid absolute URL.");
  }
  if (url.username || url.password) {
    throw new Error("Remote provider baseUrl must not contain embedded credentials.");
  }

  const localDevelopment = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(localDevelopment && url.protocol === "http:")) {
    throw new Error("Remote provider must use HTTPS except for localhost development.");
  }
}
