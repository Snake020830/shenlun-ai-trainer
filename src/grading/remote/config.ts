export type RemoteProtocol = "openai-chat-completions" | "openai-responses";

export interface RemoteProviderPublicConfig {
  id: string;
  label: string;
  enabled: boolean;
  protocol: RemoteProtocol;
  baseUrl: string;
  model: string;
  secretRef: string;
  timeoutMs: number;
}

export interface SecretResolver {
  resolve(secretRef: string): Promise<string | null>;
}

export interface RemoteJsonRequest {
  instructions: string;
  input: string;
  schemaName: string;
  jsonSchema?: Record<string, unknown>;
  temperature?: number;
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
  protocol: "openai-chat-completions",
  baseUrl: "",
  model: "",
  secretRef: "grading-provider-api-key",
  timeoutMs: 120_000
};

export function validatePublicProviderConfig(config: RemoteProviderPublicConfig): void {
  if (!config.enabled) return;
  if (!config.id.trim()) throw new Error("Remote provider id is required.");
  if (!config.model.trim()) throw new Error("Remote provider model is required.");
  if (!config.secretRef.trim()) throw new Error("Remote provider secretRef is required.");
  if (!Number.isFinite(config.timeoutMs) || config.timeoutMs < 1_000) {
    throw new Error("Remote provider timeoutMs must be at least 1000ms.");
  }

  let url: URL;
  try {
    url = new URL(config.baseUrl);
  } catch {
    throw new Error("Remote provider baseUrl must be a valid absolute URL.");
  }

  const localDevelopment = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(localDevelopment && url.protocol === "http:")) {
    throw new Error("Remote provider must use HTTPS except for localhost development.");
  }
}
