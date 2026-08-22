use crate::db::{
    self, AppState, ClipboardItem, ClipboardPayload, HISTORY_LIMIT,
};
use arboard::{Clipboard, ImageData};
use image::{DynamicImage, ImageFormat, RgbaImage};
use std::{borrow::Cow, io::Cursor};
use tauri::State;

const MAX_IMAGE_BYTES: usize = 40 * 1024 * 1024;

fn image_fingerprint(width: usize, height: usize, rgba: &[u8]) -> String {
    db::fingerprint(&format!("image:{width}x{height}"), rgba)
}

fn encode_png(width: usize, height: usize, rgba: Vec<u8>) -> Result<Vec<u8>, String> {
    let image = RgbaImage::from_raw(width as u32, height as u32, rgba)
        .ok_or_else(|| "无法读取剪贴板图片像素".to_string())?;
    let mut output = Cursor::new(Vec::new());
    DynamicImage::ImageRgba8(image)
        .write_to(&mut output, ImageFormat::Png)
        .map_err(|error| error.to_string())?;
    Ok(output.into_inner())
}

#[tauri::command]
pub(crate) fn list_clipboard_items(
    state: State<'_, AppState>,
    limit: Option<i64>,
) -> Result<Vec<ClipboardItem>, String> {
    db::list_items(&state.db_path, limit.unwrap_or(HISTORY_LIMIT).clamp(1, HISTORY_LIMIT))
}

#[tauri::command]
pub(crate) fn capture_clipboard(
    state: State<'_, AppState>,
) -> Result<Option<ClipboardItem>, String> {
    let mut clipboard = Clipboard::new().map_err(|error| error.to_string())?;

    if let Ok(image) = clipboard.get_image() {
        let width = image.width;
        let height = image.height;
        let rgba = image.bytes.into_owned();
        if rgba.len() <= MAX_IMAGE_BYTES {
            let fingerprint = image_fingerprint(width, height, &rgba);
            if state.is_last_fingerprint(&fingerprint) {
                return Ok(None);
            }
            let png = encode_png(width, height, rgba)?;
            let item = db::save_image(&state.db_path, &png, &fingerprint)?;
            state.set_last_fingerprint(fingerprint);
            return Ok(Some(item));
        }
    }

    match clipboard.get_text() {
        Ok(text) if !text.trim().is_empty() => {
            let fingerprint = db::fingerprint("text", text.as_bytes());
            if state.is_last_fingerprint(&fingerprint) {
                return Ok(None);
            }
            let item = db::save_text(&state.db_path, &text, &fingerprint)?;
            state.set_last_fingerprint(fingerprint);
            Ok(Some(item))
        }
        Ok(_) | Err(arboard::Error::ContentNotAvailable) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
pub(crate) fn write_clipboard_text(
    state: State<'_, AppState>,
    text: String,
) -> Result<(), String> {
    let mut clipboard = Clipboard::new().map_err(|error| error.to_string())?;
    clipboard
        .set_text(text.clone())
        .map_err(|error| error.to_string())?;
    state.set_last_fingerprint(db::fingerprint("text", text.as_bytes()));
    Ok(())
}

#[tauri::command]
pub(crate) fn copy_clipboard_item(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let payload = db::payload_by_id(&state.db_path, &id)?;
    let mut clipboard = Clipboard::new().map_err(|error| error.to_string())?;

    match payload {
        ClipboardPayload::Text(text) => {
            clipboard
                .set_text(text.clone())
                .map_err(|error| error.to_string())?;
            state.set_last_fingerprint(db::fingerprint("text", text.as_bytes()));
        }
        ClipboardPayload::Image(png) => {
            let decoded = image::load_from_memory(&png)
                .map_err(|error| error.to_string())?
                .to_rgba8();
            let width = decoded.width() as usize;
            let height = decoded.height() as usize;
            let rgba = decoded.into_raw();
            let fingerprint = image_fingerprint(width, height, &rgba);
            clipboard
                .set_image(ImageData {
                    width,
                    height,
                    bytes: Cow::Owned(rgba),
                })
                .map_err(|error| error.to_string())?;
            state.set_last_fingerprint(fingerprint);
        }
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn set_clipboard_favorite(
    state: State<'_, AppState>,
    id: String,
    favorite: bool,
) -> Result<(), String> {
    db::set_favorite(&state.db_path, &id, favorite)
}

#[tauri::command]
pub(crate) fn delete_clipboard_item(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    db::delete_item(&state.db_path, &id)
}

#[tauri::command]
pub(crate) fn clear_clipboard_history(
    state: State<'_, AppState>,
    keep_favorites: bool,
) -> Result<(), String> {
    db::clear_items(&state.db_path, keep_favorites)
}
