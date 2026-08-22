use arboard::Clipboard;

#[tauri::command]
fn read_clipboard_text() -> Result<Option<String>, String> {
    let mut clipboard = Clipboard::new().map_err(|error| error.to_string())?;
    match clipboard.get_text() {
        Ok(text) if !text.is_empty() => Ok(Some(text)),
        Ok(_) => Ok(None),
        Err(arboard::Error::ContentNotAvailable) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn write_clipboard_text(text: String) -> Result<(), String> {
    let mut clipboard = Clipboard::new().map_err(|error| error.to_string())?;
    clipboard.set_text(text).map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            read_clipboard_text,
            write_clipboard_text
        ])
        .run(tauri::generate_context!())
        .expect("error while running C.le. Clip");
}
