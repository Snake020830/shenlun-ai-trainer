import type { RemoteJsonRequest, RemoteJsonResponse, RemoteModelTransport, RemoteProviderPublicConfig } from "./config";
import { validatePublicProviderConfig } from "./config";
import { decodeRemoteJson, encodeRemoteCall } from "./protocol";

export interface SecureRemoteExecutionRequest {
  url: string;
  body: Record<string, unknown>;
  secretRef: string;
  timeoutMs: number;
}

export interface SecureRemoteExecutionResult {
  body: unknown;
  requestId?: string;
}

export interface SecureRemoteExecutor {
  postJson(request: SecureRemoteExecutionRequest): Promise<SecureRemoteExecutionResult>;
}

export function createRemoteModelTransport(
  config: RemoteProviderPublicConfig,
  executor: SecureRemoteExecutor
): RemoteModelTransport {
  validatePublicProviderConfig(config);

  return {
    config,
    async completeJson<T>(request: RemoteJsonRequest): Promise<RemoteJsonResponse<T>> {
      if (!config.enabled) throw new Error("Remote provider is disabled.");
      const encoded = encodeRemoteCall(config, request);
      const result = await executor.postJson({
        url: encoded.url,
        body: encoded.body,
        secretRef: config.secretRef,
        timeoutMs: config.timeoutMs
      });
      return decodeRemoteJson<T>(config, result.body, result.requestId);
    }
  };
}
