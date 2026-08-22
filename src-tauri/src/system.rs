use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, AppHandle, Manager,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_global_shortcut::ShortcutState;

pub(crate) fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub(crate) fn setup_desktop(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    app.handle().plugin(tauri_plugin_autostart::init(
        MacosLauncher::LaunchAgent,
        None,
    ))?;

    let shortcut = if cfg!(target_os = "macos") {
        "super+shift+v"
    } else {
        "ctrl+shift+v"
    };

    app.handle().plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_shortcuts([shortcut])?
            .with_handler(|app, _shortcut, event| {
                if event.state == ShortcutState::Pressed {
                    show_main_window(app);
                }
            })
            .build(),
    )?;

    let open_item = MenuItem::with_id(app, "open", "打开 C.le. Clip", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open_item, &quit_item])?;

    let tray_builder = TrayIconBuilder::new()
        .tooltip("C.le. Clip")
        .menu(&menu)
        .menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        });

    let tray_builder = if let Some(icon) = app.default_window_icon() {
        tray_builder.icon(icon.clone())
    } else {
        tray_builder
    };
    tray_builder.build(app)?;

    Ok(())
}

#[tauri::command]
pub(crate) fn hide_main_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.hide().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn get_autostart_enabled(app: AppHandle) -> Result<bool, String> {
    app.autolaunch()
        .is_enabled()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn set_autostart_enabled(app: AppHandle, enabled: bool) -> Result<(), String> {
    let manager = app.autolaunch();
    if enabled {
        manager.enable().map_err(|error| error.to_string())
    } else {
        manager.disable().map_err(|error| error.to_string())
    }
}
