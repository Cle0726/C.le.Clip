export type ClipboardKind = "text";

export interface ClipboardItem {
  id: string;
  kind: ClipboardKind;
  text: string;
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
