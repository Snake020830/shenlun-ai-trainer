import { isTauri } from "@tauri-apps/api/core";
import { createGradingService } from "./contracts";
import { loadGradingStyleProfile } from "./gradingStyleSettings";
import { mockGradingProvider } from "./mockProvider";
import { loadRemoteProviderConfig } from "./providerSettings";
import { hasValidProviderSmoke } from "./providerGate";
import { createRemoteWorkflowProvider } from "./remote/remoteWorkflowProvider";
import { tauriSecureRemoteExecutor } from "./remote/tauriExecutor";
import { createRemoteModelTransport } from "./remote/transport";

export async function resolveGradingService() {
  const [config, gradingStyle] = await Promise.all([loadRemoteProviderConfig(), loadGradingStyleProfile()]);
  if (!config.enabled) return createGradingService(mockGradingProvider);

  if (!isTauri()) {
    throw new Error("Remote AI grading is enabled but requires the Tauri desktop runtime.");
  }
  if (!(await hasValidProviderSmoke(config))) {
    throw new Error("Remote AI grading is not available until the current provider configuration passes a full smoke test.");
  }

  const transport = createRemoteModelTransport(config, tauriSecureRemoteExecutor);
  const provider = createRemoteWorkflowProvider(transport, undefined, gradingStyle.prompt);
  return createGradingService(provider);
}
