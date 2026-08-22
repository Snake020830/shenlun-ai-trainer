import { describe, expect, it } from "vitest";
import { sanitizePublicConfig } from "./providerSettings";
import { DEFAULT_REMOTE_PROVIDER_CONFIG } from "./remote/config";

describe("public provider config sanitization", () => {
  it("keeps only the public provider allow-list", () => {
    const raw = {
      id: "p1",
      label: "Provider 1",
      enabled: true,
      protocol: "openai-responses",
      baseUrl: "https://api.example.com/v1/",
      model: "model-x",
      secretRef: "grading-provider-api-key",
      timeoutMs: 45_000,
      apiKey: "must-not-survive",
      bearerToken: "must-not-survive-either"
    };

    const sanitized = sanitizePublicConfig(raw) as unknown as Record<string, unknown>;
    expect(sanitized.id).toBe("p1");
    expect(sanitized.model).toBe("model-x");
    expect(sanitized.apiKey).toBeUndefined();
    expect(sanitized.bearerToken).toBeUndefined();
    expect(Object.keys(sanitized).sort()).toEqual([
      "baseUrl", "enabled", "id", "label", "model", "protocol", "secretRef", "timeoutMs"
    ].sort());
  });

  it("falls back when protocol and numeric values are malformed", () => {
    const sanitized = sanitizePublicConfig({
      protocol: "made-up-protocol",
      timeoutMs: "forever"
    });
    expect(sanitized.protocol).toBe(DEFAULT_REMOTE_PROVIDER_CONFIG.protocol);
    expect(sanitized.timeoutMs).toBe(DEFAULT_REMOTE_PROVIDER_CONFIG.timeoutMs);
    expect(sanitized.enabled).toBe(false);
  });
});
