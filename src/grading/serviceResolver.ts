import { isTauri } from "@tauri-apps/api/core";
import { createGradingService } from "./contracts";
import { mockGradingProvider } from "./mockProvider";
import { loadRemoteProviderConfig } from "./providerSettings";
import { createRemoteWorkflowProvider } from "./remote/remoteWorkflowProvider";
import { tauriSecureRemoteExecutor } from "./remote/tauriExecutor";
import { createRemoteModelTransport } from "./remote/transport";

export async function resolveGradingService() {
  const config = await loadRemoteProviderConfig();
  if (!config.enabled) return createGradingService(mockGradingProvider);

  if (!isTauri()) {
    throw new Error("Remote AI grading is enabled but requires the Tauri desktop runtime.");
  }

  const transport = createRemoteModelTransport(config, tauriSecureRemoteExecutor);
  const provider = createRemoteWorkflowProvider(transport);
  return createGradingService(provider);
}
