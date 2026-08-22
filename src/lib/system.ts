import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "./clipboard";

export async function hideMainWindow(): Promise<void> {
  if (!isTauriRuntime()) return;
  await invoke("hide_main_window");
}

export async function getAutostartEnabled(): Promise<boolean> {
  if (!isTauriRuntime()) return false;
  return invoke<boolean>("get_autostart_enabled");
}

export async function setAutostartEnabled(enabled: boolean): Promise<void> {
  if (!isTauriRuntime()) return;
  await invoke("set_autostart_enabled", { enabled });
}
