use crate::db::{self, AppState};
use keyring::Entry;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Duration;
use tauri::State;

const KEYRING_SERVICE: &str = "com.cle.clip.ai";
const KEYRING_USER: &str = "api-key";
const DEFAULT_ENDPOINT: &str = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL: &str = "gpt-4.1-mini";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AiSettings {
    provider: String,
    endpoint: String,
    model: String,
    has_api_key: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SaveAiSettings {
    endpoint: String,
    model: String,
    api_key: Option<String>,
}

fn keyring_entry() -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|error| error.to_string())
}

fn read_api_key() -> Result<Option<String>, String> {
    let entry = keyring_entry()?;
    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

fn write_api_key(value: &str) -> Result<(), String> {
    let entry = keyring_entry()?;
    if value.trim().is_empty() {
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(error.to_string()),
        }
    } else {
        entry.set_password(value.trim()).map_err(|error| error.to_string())
    }
}

fn load_settings(path: &std::path::Path) -> Result<AiSettings, String> {
    let endpoint = db::get_setting(path, "ai.endpoint")?
        .unwrap_or_else(|| DEFAULT_ENDPOINT.to_string());
    let model = db::get_setting(path, "ai.model")?
        .unwrap_or_else(|| DEFAULT_MODEL.to_string());
    let has_api_key = read_api_key()?.is_some();
    Ok(AiSettings {
        provider: "openai-compatible".to_string(),
        endpoint,
        model,
        has_api_key,
    })
}

#[tauri::command]
pub(crate) fn get_ai_settings(state: State<'_, AppState>) -> Result<AiSettings, String> {
    load_settings(&state.db_path)
}

#[tauri::command]
pub(crate) fn save_ai_settings(
    state: State<'_, AppState>,
    settings: SaveAiSettings,
) -> Result<AiSettings, String> {
    let endpoint = settings.endpoint.trim();
    let model = settings.model.trim();
    if !(endpoint.starts_with("https://") || endpoint.starts_with("http://")) {
        return Err("AI Endpoint 必须以 http:// 或 https:// 开头".to_string());
    }
    if model.is_empty() {
        return Err("请填写模型名称".to_string());
    }

    db::set_setting(&state.db_path, "ai.endpoint", endpoint)?;
    db::set_setting(&state.db_path, "ai.model", model)?;
    if let Some(api_key) = settings.api_key.as_deref() {
        write_api_key(api_key)?;
    }
    load_settings(&state.db_path)
}

fn mode_instruction(mode: &str) -> &'static str {
    match mode {
        "concise" => "Make it concise, direct, and actionable without losing important constraints.",
        "detailed" => "Make it detailed, structured, and explicit about context, constraints, steps, and output format.",
        "coding" => "Optimize it for a software engineering task with technical constraints, edge cases, deliverables, and validation steps.",
        "writing" => "Optimize it for writing by making audience, purpose, tone, structure, and deliverable explicit.",
        "image" => "Optimize it for image generation with subject, scene, composition, viewpoint, lighting, materials, and visual mood.",
        "analysis" => "Optimize it for rigorous analysis with facts, assumptions, alternatives, evidence, risks, and conclusion criteria.",
        _ => "Improve clarity, context, constraints, and output format while preserving the user's original intent.",
    }
}

async fn request_completion(
    settings: &AiSettings,
    api_key: Option<String>,
    system_prompt: &str,
    user_prompt: String,
) -> Result<String, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(45))
        .build()
        .map_err(|error| error.to_string())?;

    let payload = json!({
        "model": settings.model,
        "messages": [
            { "role": "system", "content": system_prompt },
            { "role": "user", "content": user_prompt }
        ],
        "temperature": 0.2
    });

    let mut request = client.post(&settings.endpoint).json(&payload);
    if let Some(api_key) = api_key.filter(|value| !value.trim().is_empty()) {
        request = request.bearer_auth(api_key);
    }

    let response = request.send().await.map_err(|error| error.to_string())?;
    let status = response.status();
    let body: Value = response.json().await.map_err(|error| error.to_string())?;

    if !status.is_success() {
        let message = body
            .pointer("/error/message")
            .and_then(Value::as_str)
            .unwrap_or("AI 请求失败");
        return Err(format!("{} ({})", message, status));
    }

    body.pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .ok_or_else(|| "AI 返回内容为空".to_string())
}

#[tauri::command]
pub(crate) async fn optimize_prompt_ai(
    state: State<'_, AppState>,
    input: String,
    mode: String,
) -> Result<String, String> {
    if input.trim().is_empty() {
        return Err("没有可优化的内容".to_string());
    }

    let settings = load_settings(&state.db_path)?;
    let api_key = read_api_key()?;
    request_completion(
        &settings,
        api_key,
        "You are C.le. Clip's prompt optimizer. Rewrite the user's original prompt into a stronger prompt. Preserve intent and language. Return only the optimized prompt, with no commentary or analysis.",
        format!(
            "Optimization instruction: {}\n\nOriginal prompt:\n{}",
            mode_instruction(&mode),
            input.trim()
        ),
    )
    .await
}

#[tauri::command]
pub(crate) async fn run_ai_action(
    state: State<'_, AppState>,
    input: String,
    action: String,
) -> Result<String, String> {
    if input.trim().is_empty() {
        return Err("没有可处理的内容".to_string());
    }

    let system_prompt = match action.as_str() {
        "translate" => "You are C.le. Clip's translation action. If the input is primarily Chinese, translate it into natural English; otherwise translate it into natural Simplified Chinese. Preserve code blocks, URLs, names, numbers, and formatting when possible. Return only the translation.",
        "summarize" => "You are C.le. Clip's summarization action. Summarize the input clearly and compactly in the same language as the input. Preserve important facts, constraints, names, numbers, and action items. Return only the summary.",
        "explain-code" => "You are C.le. Clip's code explanation action. Explain what the code does, its important control flow, likely edge cases, and any obvious risks. Use the same language as the surrounding input when possible. Be concise and return only the explanation.",
        _ => return Err("不支持的 AI Action".to_string()),
    };

    let settings = load_settings(&state.db_path)?;
    let api_key = read_api_key()?;
    request_completion(
        &settings,
        api_key,
        system_prompt,
        input.trim().to_string(),
    )
    .await
}
