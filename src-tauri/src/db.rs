use base64::{engine::general_purpose::STANDARD, Engine as _};
use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{path::{Path, PathBuf}, sync::Mutex, time::{SystemTime, UNIX_EPOCH}};
use uuid::Uuid;

pub(crate) const HISTORY_LIMIT: i64 = 200;

pub(crate) struct AppState {
    pub(crate) db_path: PathBuf,
    last_fingerprint: Mutex<Option<String>>,
}

impl AppState {
    pub(crate) fn new(db_path: PathBuf) -> Self {
        Self {
            db_path,
            last_fingerprint: Mutex::new(None),
        }
    }

    pub(crate) fn is_last_fingerprint(&self, fingerprint: &str) -> bool {
        self.last_fingerprint
            .lock()
            .map(|current| current.as_deref() == Some(fingerprint))
            .unwrap_or(false)
    }

    pub(crate) fn set_last_fingerprint(&self, fingerprint: String) {
        if let Ok(mut current) = self.last_fingerprint.lock() {
            *current = Some(fingerprint);
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ClipboardItem {
    pub(crate) id: String,
    pub(crate) kind: String,
    pub(crate) text: Option<String>,
    pub(crate) image_data_url: Option<String>,
    pub(crate) created_at: i64,
    pub(crate) favorite: bool,
}

pub(crate) enum ClipboardPayload {
    Text(String),
    Image(Vec<u8>),
}

pub(crate) fn init_database(path: &Path) -> Result<(), String> {
    let connection = Connection::open(path).map_err(|error| error.to_string())?;
    connection
        .execute_batch(
            "
            PRAGMA journal_mode = WAL;
            PRAGMA foreign_keys = ON;

            CREATE TABLE IF NOT EXISTS clipboard_items (
                id TEXT PRIMARY KEY,
                kind TEXT NOT NULL,
                text TEXT,
                image_png BLOB,
                fingerprint TEXT NOT NULL UNIQUE,
                created_at INTEGER NOT NULL,
                favorite INTEGER NOT NULL DEFAULT 0
            );

            CREATE INDEX IF NOT EXISTS idx_clipboard_created_at
                ON clipboard_items(created_at DESC);

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            ",
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn connection(path: &Path) -> Result<Connection, String> {
    Connection::open(path).map_err(|error| error.to_string())
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

pub(crate) fn fingerprint(prefix: &str, bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(prefix.as_bytes());
    hasher.update([0]);
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

fn row_to_item(row: &Row<'_>) -> rusqlite::Result<ClipboardItem> {
    let image_png: Option<Vec<u8>> = row.get(3)?;
    Ok(ClipboardItem {
        id: row.get(0)?,
        kind: row.get(1)?,
        text: row.get(2)?,
        image_data_url: image_png.map(|bytes| {
            format!("data:image/png;base64,{}", STANDARD.encode(bytes))
        }),
        created_at: row.get(4)?,
        favorite: row.get::<_, i64>(5)? != 0,
    })
}

fn item_by_fingerprint(connection: &Connection, fingerprint: &str) -> Result<ClipboardItem, String> {
    connection
        .query_row(
            "SELECT id, kind, text, image_png, created_at, favorite
             FROM clipboard_items WHERE fingerprint = ?1",
            params![fingerprint],
            row_to_item,
        )
        .map_err(|error| error.to_string())
}

fn cleanup_history(connection: &Connection) -> Result<(), String> {
    connection
        .execute(
            "DELETE FROM clipboard_items
             WHERE favorite = 0
               AND id NOT IN (
                   SELECT id FROM clipboard_items
                   WHERE favorite = 0
                   ORDER BY created_at DESC
                   LIMIT ?1
               )",
            params![HISTORY_LIMIT],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

pub(crate) fn save_text(path: &Path, text: &str, fingerprint: &str) -> Result<ClipboardItem, String> {
    let connection = connection(path)?;
    let id = Uuid::new_v4().to_string();
    let created_at = now_millis();
    connection
        .execute(
            "INSERT INTO clipboard_items (id, kind, text, image_png, fingerprint, created_at, favorite)
             VALUES (?1, 'text', ?2, NULL, ?3, ?4, 0)
             ON CONFLICT(fingerprint) DO UPDATE SET
                 kind = 'text',
                 text = excluded.text,
                 image_png = NULL,
                 created_at = excluded.created_at",
            params![id, text, fingerprint, created_at],
        )
        .map_err(|error| error.to_string())?;
    cleanup_history(&connection)?;
    item_by_fingerprint(&connection, fingerprint)
}

pub(crate) fn save_image(path: &Path, png: &[u8], fingerprint: &str) -> Result<ClipboardItem, String> {
    let connection = connection(path)?;
    let id = Uuid::new_v4().to_string();
    let created_at = now_millis();
    connection
        .execute(
            "INSERT INTO clipboard_items (id, kind, text, image_png, fingerprint, created_at, favorite)
             VALUES (?1, 'image', NULL, ?2, ?3, ?4, 0)
             ON CONFLICT(fingerprint) DO UPDATE SET
                 kind = 'image',
                 text = NULL,
                 image_png = excluded.image_png,
                 created_at = excluded.created_at",
            params![id, png, fingerprint, created_at],
        )
        .map_err(|error| error.to_string())?;
    cleanup_history(&connection)?;
    item_by_fingerprint(&connection, fingerprint)
}

pub(crate) fn list_items(path: &Path, limit: i64) -> Result<Vec<ClipboardItem>, String> {
    let connection = connection(path)?;
    let mut statement = connection
        .prepare(
            "SELECT id, kind, text, image_png, created_at, favorite
             FROM clipboard_items
             ORDER BY created_at DESC
             LIMIT ?1",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map(params![limit], row_to_item)
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

pub(crate) fn set_favorite(path: &Path, id: &str, favorite: bool) -> Result<(), String> {
    let connection = connection(path)?;
    connection
        .execute(
            "UPDATE clipboard_items SET favorite = ?2 WHERE id = ?1",
            params![id, if favorite { 1 } else { 0 }],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

pub(crate) fn delete_item(path: &Path, id: &str) -> Result<(), String> {
    let connection = connection(path)?;
    connection
        .execute("DELETE FROM clipboard_items WHERE id = ?1", params![id])
        .map_err(|error| error.to_string())?;
    Ok(())
}

pub(crate) fn clear_items(path: &Path, keep_favorites: bool) -> Result<(), String> {
    let connection = connection(path)?;
    if keep_favorites {
        connection
            .execute("DELETE FROM clipboard_items WHERE favorite = 0", [])
            .map_err(|error| error.to_string())?;
    } else {
        connection
            .execute("DELETE FROM clipboard_items", [])
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

pub(crate) fn payload_by_id(path: &Path, id: &str) -> Result<ClipboardPayload, String> {
    let connection = connection(path)?;
    connection
        .query_row(
            "SELECT kind, text, image_png FROM clipboard_items WHERE id = ?1",
            params![id],
            |row| {
                let kind: String = row.get(0)?;
                if kind == "image" {
                    let png: Vec<u8> = row.get(2)?;
                    Ok(ClipboardPayload::Image(png))
                } else {
                    let text: String = row.get(1)?;
                    Ok(ClipboardPayload::Text(text))
                }
            },
        )
        .map_err(|error| error.to_string())
}

pub(crate) fn get_setting(path: &Path, key: &str) -> Result<Option<String>, String> {
    let connection = connection(path)?;
    connection
        .query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params![key],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())
}

pub(crate) fn set_setting(path: &Path, key: &str, value: &str) -> Result<(), String> {
    let connection = connection(path)?;
    connection
        .execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}
