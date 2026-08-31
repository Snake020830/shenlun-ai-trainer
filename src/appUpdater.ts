import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { check, type Update } from "@tauri-apps/plugin-updater";

export interface AppUpdateState {
  available: Update | null;
  checking: boolean;
  installing: boolean;
  error: string | null;
  install: () => Promise<void>;
  dismiss: () => void;
}

export function useAppUpdater(): AppUpdateState {
  const [available, setAvailable] = useState<Update | null>(null);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    const timer = window.setTimeout(() => {
      setChecking(true);
      void check()
        .then(update => {
          if (!disposed) setAvailable(update);
        })
        .catch(updateError => {
          if (!disposed) {
            console.warn("Failed to check for app updates.", updateError);
          }
        })
        .finally(() => {
          if (!disposed) setChecking(false);
        });
    }, 2500);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, []);

  async function install(): Promise<void> {
    if (!available || installing) return;
    setInstalling(true);
    setError(null);
    try {
      await available.downloadAndInstall();
    } catch (installError) {
      console.error("Failed to install app update.", installError);
      setError("更新失败，请稍后重试");
      setInstalling(false);
    }
  }

  return {
    available,
    checking,
    installing,
    error,
    install,
    dismiss: () => setAvailable(null)
  };
}
