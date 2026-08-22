import { describe, expect, it } from "vitest";
import type { RemoteProviderPublicConfig } from "./config";
import { validatePublicProviderConfig } from "./config";

function config(overrides: Partial<RemoteProviderPublicConfig> = {}): RemoteProviderPublicConfig {
  return {
    id: "provider",
    label: "Provider",
    enabled: true,
    protocol: "openai-responses",
    baseUrl: "https://api.example.com/v1/",
    model: "model-x",
    secretRef: "grading-provider-api-key",
    timeoutMs: 120_000,
    ...overrides
  };
}

describe("remote provider public config validation", () => {
  it("accepts HTTPS and localhost HTTP", () => {
    expect(() => validatePublicProviderConfig(config())).not.toThrow();
    expect(() => validatePublicProviderConfig(config({ baseUrl: "http://localhost:11434/v1/" }))).not.toThrow();
  });

  it("rejects insecure non-local HTTP", () => {
    expect(() => validatePublicProviderConfig(config({ baseUrl: "http://api.example.com/v1/" })))
      .toThrow("must use HTTPS");
  });

  it("rejects credentials embedded in the URL", () => {
    expect(() => validatePublicProviderConfig(config({ baseUrl: "https://user:pass@api.example.com/v1/" })))
      .toThrow("must not contain embedded credentials");
  });

  it("rejects unsafe secret references and excessive timeouts", () => {
    expect(() => validatePublicProviderConfig(config({ secretRef: "../../api key" })))
      .toThrow("secretRef is invalid");
    expect(() => validatePublicProviderConfig(config({ timeoutMs: 999_999 })))
      .toThrow("between 1000ms and 300000ms");
  });

  it("allows an incomplete disabled config because it cannot make requests", () => {
    expect(() => validatePublicProviderConfig(config({
      enabled: false,
      baseUrl: "",
      model: ""
    }))).not.toThrow();
  });
});
