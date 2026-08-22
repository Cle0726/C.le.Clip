import { invoke } from "@tauri-apps/api/core";
import type { AiSettings, PromptMode } from "../types";
import { isTauriRuntime } from "./clipboard";

export const DEFAULT_AI_SETTINGS: AiSettings = {
  provider: "openai-compatible",
  endpoint: "https://api.openai.com/v1/chat/completions",
  model: "gpt-4.1-mini",
  hasApiKey: false,
};

export async function getAiSettings(): Promise<AiSettings> {
  if (!isTauriRuntime()) return DEFAULT_AI_SETTINGS;
  return invoke<AiSettings>("get_ai_settings");
}

export async function saveAiSettings(input: {
  endpoint: string;
  model: string;
  apiKey?: string;
}): Promise<AiSettings> {
  if (!isTauriRuntime()) {
    return {
      ...DEFAULT_AI_SETTINGS,
      endpoint: input.endpoint,
      model: input.model,
      hasApiKey: Boolean(input.apiKey),
    };
  }
  return invoke<AiSettings>("save_ai_settings", {
    settings: {
      endpoint: input.endpoint,
      model: input.model,
      apiKey: input.apiKey,
    },
  });
}

export async function optimizePromptWithAi(
  input: string,
  mode: PromptMode,
): Promise<string> {
  if (!isTauriRuntime()) {
    throw new Error("AI Provider 仅在桌面应用中可用");
  }
  return invoke<string>("optimize_prompt_ai", { input, mode });
}
