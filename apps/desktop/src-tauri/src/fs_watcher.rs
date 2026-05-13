//! File system watcher for the active project directory.
//!
//! TODO M1: watch the active project directory for external file changes.
//! When implemented, this module will:
//!   1. Accept a project path from the frontend via a Tauri command
//!   2. Use the notify crate (add to Cargo.toml at that point) to watch for changes
//!   3. Debounce events and emit them to the frontend via tauri::Emitter
