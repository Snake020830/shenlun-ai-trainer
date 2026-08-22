import { persistence } from "../storage";
import {
  DEFAULT_REMOTE_PROVIDER_CONFIG,
  validatePublicProviderConfig
} from "./remote/config";
import type { ReasoningEffort, RemoteProviderPublicConfig, RemoteProtocol } from "./remote/config";

const PROVIDER_CONFIG_KEY = "public:remote-provider.v1";
const PROTOCOLS = new Set<RemoteProtocol>(["openai-responses", "openai-chat-completions"]);
const REASONING_EFFORTS = new Set<ReasoningEffort>([
  "provider-default",
  "low",
  "medium",
  "high",
  "xhigh"
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function sanitizePublicConfig(value: unknown): RemoteProviderPublicConfig {
  const raw = asRecord(value) ?? {};
  const protocol = typeof raw.protocol === "string" && PROTOCOLS.has(raw.protocol as RemoteProtocol)
    ? raw.protocol as RemoteProtocol
    : DEFAULT_REMOTE_PROVIDER_CONFIG.protocol;
  const reasoningEffort = typeof raw.reasoningEffort === "string" && REASONING_EFFORTS.has(raw.reasoningEffort as ReasoningEffort)
    ? raw.reasoningEffort as ReasoningEffort
    : DEFAULT_REMOTE_PROVIDER_CONFIG.reasoningEffort;

  return {
    id: typeof raw.id === "string" ? raw.id : DEFAULT_REMOTE_PROVIDER_CONFIG.id,
    label: typeof raw.label === "string" ? raw.label : DEFAULT_REMOTE_PROVIDER_CONFIG.label,
    enabled: raw.enabled === true,
    protocol,
    baseUrl: typeof raw.baseUrl === "string" ? raw.baseUrl : DEFAULT_REMOTE_PROVIDER_CONFIG.baseUrl,
    model: typeof raw.model === "string" ? raw.model : DEFAULT_REMOTE_PROVIDER_CONFIG.model,
    secretRef: typeof raw.secretRef === "string" ? raw.secretRef : DEFAULT_REMOTE_PROVIDER_CONFIG.secretRef,
    timeoutMs: typeof raw.timeoutMs === "number" && Number.isFinite(raw.timeoutMs)
      ? raw.timeoutMs
      : DEFAULT_REMOTE_PROVIDER_CONFIG.timeoutMs,
    reasoningEffort
  };
}

export async function loadRemoteProviderConfig(): Promise<RemoteProviderPublicConfig> {
  const stored = await persistence.getPublicSetting<unknown>(PROVIDER_CONFIG_KEY, null);
  return sanitizePublicConfig(stored);
}

export async function saveRemoteProviderConfig(config: RemoteProviderPublicConfig): Promise<void> {
  const sanitized = sanitizePublicConfig(config);
  validatePublicProviderConfig(sanitized);
  await persistence.setPublicSetting(PROVIDER_CONFIG_KEY, sanitized);
}

export async function resetRemoteProviderConfig(): Promise<void> {
  // Persist the canonical default rather than depending on a separate delete API.
  // This keeps reset behavior identical across SQLite and localStorage backends.
  await persistence.setPublicSetting(PROVIDER_CONFIG_KEY, DEFAULT_REMOTE_PROVIDER_CONFIG);
}

export { sanitizePublicConfig };