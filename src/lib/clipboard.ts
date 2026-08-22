import { invoke } from "@tauri-apps/api/core";
import type { ClipboardItem } from "../types";

let lastBrowserText = "";

export function isTauriRuntime() {
  return "__TAURI_INTERNALS__" in window;
}

export async function listClipboardItems(limit = 200): Promise<ClipboardItem[]> {
  if (!isTauriRuntime()) return [];
  return invoke<ClipboardItem[]>("list_clipboard_items", { limit });
}

export async function captureClipboard(): Promise<ClipboardItem | null> {
  if (isTauriRuntime()) {
    return invoke<ClipboardItem | null>("capture_clipboard");
  }

  try {
    const text = await navigator.clipboard.readText();
    if (!text.trim() || text === lastBrowserText) return null;
    lastBrowserText = text;
    return {
      id: crypto.randomUUID(),
      kind: "text",
      text,
      imageDataUrl: null,
      createdAt: Date.now(),
      favorite: false,
    };
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
  lastBrowserText = text;
}

export async function copyClipboardItem(item: ClipboardItem): Promise<void> {
  if (isTauriRuntime()) {
    await invoke("copy_clipboard_item", { id: item.id });
    return;
  }
  if (item.text) await writeClipboardText(item.text);
}

export async function setClipboardFavorite(id: string, favorite: boolean): Promise<void> {
  if (!isTauriRuntime()) return;
  await invoke("set_clipboard_favorite", { id, favorite });
}

export async function deleteClipboardItem(id: string): Promise<void> {
  if (!isTauriRuntime()) return;
  await invoke("delete_clipboard_item", { id });
}

export async function clearClipboardHistory(keepFavorites = true): Promise<void> {
  if (!isTauriRuntime()) return;
  await invoke("clear_clipboard_history", { keep_favorites: keepFavorites });
}
