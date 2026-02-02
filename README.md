# Sync App (macOS)

Sync App is a macOS desktop utility for **fast, incremental, and reliable backups**
powered by `rsync`. It gives you a clean, professional UI for selecting folders,
previewing changes, running syncs, and tracking everything with logs, history,
and notifications.

This project is built for people who want **simple, dependable backups** without
the complexity of enterprise tools — and without the slowdowns of Finder copies.

## What It Does
- **Incremental backups** by default (only what changed is copied)
- **Professional UI** with live progress and file stream
- **Profiles** to save and reuse common source/destination pairs
- **Scheduling** for automated daily/weekly syncs
- **Notifications** when a sync succeeds or fails (tap to open the log)
- **History** with timestamps, durations, total bytes, and average speed
- **Logs** for every run (per‑file logging with timestamps and speed)
- **Exclusions** with toggleable chips and custom patterns
- **Preview / Dry‑run** mode to validate a sync before writing any files

## Why It’s Useful
- Faster and more reliable than Finder for large or repeated syncs
- Great for external drive backups and archive workflows
- Keeps your workflow clean with exclusions and presets
- Gives clear insight into results and performance

## Core Features
### 1) Folders + Sync Engine
- Choose **Source** and **Destination** folders with a native picker.
- Uses `rsync` under the hood for speed and resilience.
- Optional **Preserve root folder** to copy the source folder itself.

### 2) Exclusion Patterns
- Exclude common rebuildable or system files (.git, node_modules, *.tmp, etc.)
- Built‑in patterns are toggleable chips with tooltips
- Add custom patterns in one click

### 3) Profiles
- Save named presets for fast reuse (e.g., “Work‑SSD”, “Photos‑Archive”)
- Apply or delete profiles at any time

### 4) Scheduling (with Profiles)
- Schedule **daily or weekly** syncs
- Choose **which profile** to run on schedule
- Works while the app is open

### 5) Notifications
- macOS notifications on success/failure
- Click notification to open the run log

### 6) History + Logs
- Full run history with timestamps, bytes, duration, and average speed
- Per‑file logs saved for each run
- One‑click access to log folder and log files

## Quick Start
```bash
npm install
npm start
```

Example sync:
- Source: `/Users/you/Documents/Work/`
- Destination: `/Volumes/BackupDrive/Work/`

Tip: enable **Preserve root folder** if you want the source folder itself created
inside the destination.

## Screenshots
Add screenshots to `docs/screenshots/` and link them here.

## Terms
The in‑app Terms of Use are stored in `terms-of-use.html`.

## Tech Stack
- Electron (desktop app runtime)
- Node.js (main process)
- HTML/CSS/JavaScript (renderer UI)
- rsync (file sync engine)

## Packages
- `electron`
- `electron-builder`
- `electron-updater`

## Requirements
- macOS with `rsync` available in PATH
- Node.js 18+

## Run Locally
```bash
npm install
npm start
```

## Build a Double‑Click App (macOS)
```bash
npm run dist
```

The `.dmg` installer will be created in `dist/`. You can drag the app into
`/Applications` and launch it with a double click.

## Release Notes
Release notes live in `release-notes.json` and are shown inside the app.

## Releases
Downloads: https://github.com/julian-mihai/sync-tool/releases

Release workflow (recommended):
```bash
# 1) Commit and push changes to main
git push origin main

# 2) Tag the version to trigger the Release build
git tag v2.0.0
git push origin v2.0.0
```
The workflow runs `npm run dist` on the GitHub runner and attaches the macOS
artifacts to the Release for that tag.

## Notes (Implementation Details)
- `rsync -a --human-readable --out-format=%n|||%l` is used for file tracking.
- Progress and file stream are shown in the UI.
- Logs are stored in `app.getPath("userData")` and can be opened from the UI.
- Run history is stored in `history.json` under the app data folder.
- Exclusions support built‑in chips plus custom additions.
- Auto‑update uses a ZIP build published to the update feed.
- The Update button checks for updates and installs when ready.
- Automatic update checks can be toggled in the UI (default ON).

## License
© 2026 Iulian Mihai. All rights reserved.

## Contributing
This project is not open for external contributions at this time.
