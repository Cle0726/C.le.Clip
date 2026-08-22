use crate::{clipboard, db::{AppState, ClipboardItem}};
use clipboard_rs::{ClipboardHandler, ClipboardWatcher, ClipboardWatcherContext};
use std::{thread, time::Duration};
use tauri::{AppHandle, Emitter, Manager};

pub(crate) const CLIPBOARD_UPDATED_EVENT: &str = "clipboard://updated";
const MACOS_POLL_INTERVAL: Duration = Duration::from_millis(150);
const RETRY_DELAYS: [Duration; 3] = [
    Duration::from_millis(15),
    Duration::from_millis(35),
    Duration::from_millis(75),
];

pub(crate) fn init(app: &AppHandle) -> Result<(), String> {
    let app = app.clone();
    thread::Builder::new()
        .name("cle-clipboard-watcher".to_string())
        .spawn(move || {
            let mut watcher = match ClipboardWatcherContext::new_with_interval(MACOS_POLL_INTERVAL) {
                Ok(watcher) => watcher,
                Err(error) => {
                    eprintln!("C.le. Clip clipboard watcher init failed: {error}");
                    return;
                }
            };

            watcher.add_handler(ClipboardChangeHandler { app });
            watcher.start_watch();
        })
        .map_err(|error| error.to_string())?;

    Ok(())
}

struct ClipboardChangeHandler {
    app: AppHandle,
}

impl ClipboardChangeHandler {
    fn capture_with_retry(&self) -> Result<Option<ClipboardItem>, String> {
        let state = self.app.state::<AppState>();
        let mut result = clipboard::capture_clipboard_once(state.inner());

        for delay in RETRY_DELAYS {
            if result.is_ok() {
                return result;
            }
            thread::sleep(delay);
            result = clipboard::capture_clipboard_once(state.inner());
        }

        result
    }
}

impl ClipboardHandler for ClipboardChangeHandler {
    fn on_clipboard_change(&mut self) {
        match self.capture_with_retry() {
            Ok(Some(item)) => {
                if let Err(error) = self.app.emit(CLIPBOARD_UPDATED_EVENT, item) {
                    eprintln!("C.le. Clip clipboard event emit failed: {error}");
                }
            }
            Ok(None) => {}
            Err(error) => {
                eprintln!("C.le. Clip clipboard capture failed: {error}");
            }
        }
    }
}
