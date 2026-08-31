import { persistence } from "../storage";
import type { RemoteProviderPublicConfig } from "./remote/config";
import type { ProviderSmokeTestReport } from "./providerSmokeTest";

const SMOKE_GATE_KEY = "public:remote-provider-smoke.v1";

export interface ProviderSmokeGate {
  configSignature: string;
  report: ProviderSmokeTestReport;
}

export function providerConfigSignature(config: RemoteProviderPublicConfig): string {
  return JSON.stringify({
    id: config.id,
    protocol: config.protocol,
    baseUrl: config.baseUrl.trim().replace(/\/$/, ""),
    model: config.model.trim(),
    secretRef: config.secretRef.trim(),
    timeoutMs: config.timeoutMs,
    reasoningEffort: config.reasoningEffort
  });
}

export async function loadProviderSmokeGate(): Promise<ProviderSmokeGate | null> {
  const stored = await persistence.getPublicSetting<unknown>(SMOKE_GATE_KEY, null);
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return null;
  const data = stored as Record<string, unknown>;
  if (typeof data.configSignature !== "string" || !data.report || typeof data.report !== "object" || Array.isArray(data.report)) return null;
  const report = data.report as Record<string, unknown>;
  if (typeof report.providerId !== "string" || !report.providerId.trim()) return null;
  return { configSignature: data.configSignature, report: data.report as ProviderSmokeTestReport };
}

export async function hasValidProviderSmoke(config: RemoteProviderPublicConfig): Promise<boolean> {
  const gate = await loadProviderSmokeGate();
  return gate?.configSignature === providerConfigSignature(config) && Boolean(gate.report.providerId?.trim());
}

export async function saveProviderSmokeGate(config: RemoteProviderPublicConfig, report: ProviderSmokeTestReport): Promise<void> {
  await persistence.setPublicSetting(SMOKE_GATE_KEY, {
    configSignature: providerConfigSignature(config),
    report
  } satisfies ProviderSmokeGate);
}
