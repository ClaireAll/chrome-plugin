# Application assets

Platform-specific application and tray icons belong here:

- icon.icns for macOS
- icon.ico for Windows (electron-builder can derive it from icon.icns)
- codex-quota-icon.png is the source artwork for the current app icon
- tray/ for platform tray assets

The current macOS packaging uses `icon.icns`; release packages remain excluded
by the project `.gitignore`.
