# Sync App (macOS)

Sync App is a macOS desktop utility for fast, incremental backups powered by `rsync`.
It provides a clean UI for selecting source/destination folders, running previews, and
tracking results with logs and history.

## Why It’s Useful
- Faster than Finder for large or repeated syncs
- Incremental by default (only copies changes)
- Built‑in preview and exclusion patterns
- Clear progress, logs, and run history

## Quick Start
```bash
npm install
npm start
```

Example sync:
- Source: `/Users/you/Documents/Work/`
- Destination: `/Volumes/BackupDrive/Work/`

Tip: enable “Preserve root folder” to copy the source folder itself into the destination.

## Screenshots
- Add screenshots to `docs/screenshots/` and link them here.

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

## Notes
- The app runs `rsync -a --human-readable --out-format=%n|||%l`.
- Progress and file stream are shown in the UI.
- A per-file log is saved in the app data folder on each run.
- Release notes live in `release-notes.json`.
- App icon is configured in `package.json` under `build.mac.icon`.
- Logs are stored in `app.getPath("userData")` and can be opened from the UI.
- Exclude patterns and preview mode are supported in the UI.
- Preserve root folder is supported to copy the source folder itself.
- Run history is stored in `history.json` under the app data folder.
- Auto-update uses a ZIP build published to the update feed.
- The Update button checks for updates and installs when ready.
- Automatic update checks can be toggled in the UI (default ON).

## Build a Double-Click App (macOS)
```bash
npm run dist
```

The `.dmg` installer will be created in `dist/`. You can drag the app into
`/Applications` and launch it with a double click.

## Releases
Tag a version to trigger GitHub Actions:
```bash
git tag v1.4.0
git push origin v1.4.0
```
The workflow builds macOS artifacts and attaches them to the GitHub Release.

## License
© 2026 Iulian Mihai. All rights reserved.

## Contributing
This project is not open for external contributions at this time.
