export type ClipboardKind = "text" | "image";

export interface ClipboardItem {
  id: string;
  kind: ClipboardKind;
  text: string | null;
  imageDataUrl: string | null;
  createdAt: number;
  favorite: boolean;
}

export type PromptMode =
  | "smart"
  | "concise"
  | "detailed"
  | "coding"
  | "writing"
  | "image"
  | "analysis";

export interface AiSettings {
  provider: string;
  endpoint: string;
  model: string;
  hasApiKey: boolean;
}
