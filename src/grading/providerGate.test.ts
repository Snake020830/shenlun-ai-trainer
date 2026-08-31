import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => false }));

import { hasValidProviderSmoke, providerConfigSignature, saveProviderSmokeGate } from "./providerGate";
import type { RemoteProviderPublicConfig } from "./remote/config";
import type { ProviderSmokeTestReport } from "./providerSmokeTest";

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(key: string) { return this.data.get(key) ?? null; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string) { this.data.delete(key); }
  setItem(key: string, value: string) { this.data.set(key, String(value)); }
}

const config: RemoteProviderPublicConfig = {
  id: "provider-1",
  label: "Provider",
  enabled: true,
  protocol: "openai-responses",
  baseUrl: "https://example.com/v1/",
  model: "model-a",
  secretRef: "grading-provider-api-key",
  timeoutMs: 120000,
  reasoningEffort: "high"
};

const report = { providerId: "remote:provider-1" } as ProviderSmokeTestReport;

beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: new MemoryStorage() });
});

describe("remote provider smoke gate", () => {
  it("binds the successful smoke test to the exact public configuration", async () => {
    await saveProviderSmokeGate(config, report);
    expect(providerConfigSignature(config)).toContain("model-a");
    expect(await hasValidProviderSmoke(config)).toBe(true);
    expect(await hasValidProviderSmoke({ ...config, model: "model-b" })).toBe(false);
  });
});
