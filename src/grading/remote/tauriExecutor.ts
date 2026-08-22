import { invoke, isTauri } from "@tauri-apps/api/core";
import type { SecureRemoteExecutionRequest, SecureRemoteExecutionResult, SecureRemoteExecutor } from "./transport";

export interface ProviderSecretStore {
  save(secretRef: string, secret: string): Promise<void>;
  delete(secretRef: string): Promise<void>;
}

function requireTauri(): void {
  if (!isTauri()) throw new Error("Secure provider operations require the Tauri desktop runtime.");
}

export const tauriProviderSecretStore: ProviderSecretStore = {
  async save(secretRef, secret) {
    requireTauri();
    await invoke("store_provider_secret", { secretRef, secret });
  },
  async delete(secretRef) {
    requireTauri();
    await invoke("delete_provider_secret", { secretRef });
  }
};

export const tauriSecureRemoteExecutor: SecureRemoteExecutor = {
  async postJson(request: SecureRemoteExecutionRequest): Promise<SecureRemoteExecutionResult> {
    requireTauri();
    return invoke<SecureRemoteExecutionResult>("secure_post_json", { request });
  }
};
