//! Sidecar process management for the apps/api binary.
//!
//! TODO M4: spawn and monitor the apps/api sidecar binary.
//! When implemented, this module will:
//!   1. Locate the bundled api binary next to the Tauri executable
//!   2. Spawn it with PORT=0, capture stdout to read "READY <port>"
//!   3. Monitor the process and restart on crash
//!   4. Kill it on app exit (SIGTERM / tauri::RunEvent::Exit)
