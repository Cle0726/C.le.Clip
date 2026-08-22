import { invoke } from "@tauri-apps/api/core";

function isTauriRuntime() {
  return "__TAURI_INTERNALS__" in window;
}

export async function readClipboardText(): Promise<string | null> {
  if (isTauriRuntime()) {
    return invoke<string | null>("read_clipboard_text");
  }

  try {
    return (await navigator.clipboard.readText()) || null;
  } catch {
    return null;
  }
}

export async function writeClipboardText(text: string): Promise<void> {
  if (isTauriRuntime()) {
    await invoke("write_clipboard_text", { text });
    return;
  }

  await navigator.clipboard.writeText(text);
}
