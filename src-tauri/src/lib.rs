mod ai;
mod clipboard;
mod db;
mod system;
mod watcher;

use tauri::{Manager, WindowEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_data_dir)?;
            let db_path = app_data_dir.join("c-le-clip.sqlite3");
            db::init_database(&db_path).map_err(std::io::Error::other)?;
            app.manage(db::AppState::new(db_path));

            #[cfg(desktop)]
            {
                watcher::init(app.handle()).map_err(std::io::Error::other)?;
                system::setup_desktop(app)?;
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            clipboard::list_clipboard_items,
            clipboard::capture_clipboard,
            clipboard::write_clipboard_text,
            clipboard::copy_clipboard_item,
            clipboard::set_clipboard_favorite,
            clipboard::delete_clipboard_item,
            clipboard::clear_clipboard_history,
            system::hide_main_window,
            system::get_autostart_enabled,
            system::set_autostart_enabled,
            ai::get_ai_settings,
            ai::save_ai_settings,
            ai::optimize_prompt_ai,
            ai::run_ai_action,
        ])
        .run(tauri::generate_context!())
        .expect("error while running C.le. Clip");
}
