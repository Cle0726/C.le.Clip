# C.le. Clip architecture notes

## Clipboard pipeline

C.le. Clip keeps clipboard capture in the Rust desktop process instead of polling from React.

- Windows: `clipboard-rs` uses the native clipboard update listener (`WM_CLIPBOARDUPDATE`).
- macOS: `clipboard-rs` watches `NSPasteboard.changeCount` with a short interval.
- The watcher runs on a dedicated OS thread because clipboard handles are platform-bound.
- Captured items are normalized and persisted through the same `capture_clipboard_once` path used by manual capture.
- After a successful insert/update, Rust emits `clipboard://updated`; React updates incrementally.
- Browser/Vite preview keeps a low-frequency polling fallback because native events are unavailable there.

This design was chosen after studying established open-source clipboard managers, especially EcoPaste's separation between watcher, read/ingest, storage, and UI notification. C.le. Clip implements its own smaller pipeline rather than copying upstream source.

## AI Actions

Prompt Lab remains available, but the primary AI interaction is moving toward context-aware actions. The UI recommends actions from the selected clipboard content (for example prompt optimization, coding mode, translation, summarization, or code explanation). AI-only transformations are executed through the configured OpenAI-compatible provider, while prompt enhancement can still run locally.

## Next architecture steps

1. Add configurable privacy filters and source-app exclusions.
2. Move large images out of SQLite blobs into an app-managed image store.
3. Add SQLite FTS5 search when history grows beyond the MVP limit.
4. Add file/HTML/RTF payload types without changing the watcher-to-ingest contract.
5. Add a writeback guard with bounded expiry for richer multi-format copy/paste operations.
