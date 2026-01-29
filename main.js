const { app, BrowserWindow, ipcMain, dialog, screen, shell } = require("electron");
const { autoUpdater } = require("electron-updater");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

let mainWindow = null;
let rsyncProcess = null;
let saveWindowStateTimer = null;
const MAX_OUTPUT_LINES = 60;
let rsyncVersionCache = null;
const LOG_SEPARATOR = "|||";
const MAX_HISTORY_ENTRIES = 50;
const DEFAULT_UPDATE_URL =
  "https://claudiaconversations.blob.core.windows.net/sync-app";
let updateReady = false;
const rsyncPaths = [
  "/opt/homebrew/bin/rsync",
  "/usr/local/bin/rsync",
  "/usr/bin/rsync",
];

function resolveRsyncPath() {
  for (const candidate of rsyncPaths) {
    try {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    } catch (error) {
      // Ignore filesystem errors and continue.
    }
  }
  return "/usr/bin/rsync";
}

const resolvedRsyncPath = resolveRsyncPath();

const defaultWindowSize = {
  width: 936,
  height: 676,
  minWidth: 720,
  minHeight: 520,
};

function getWindowStatePath() {
  return path.join(app.getPath("userData"), "window-state.json");
}

function loadWindowState() {
  try {
    const raw = fs.readFileSync(getWindowStatePath(), "utf8");
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) {
      return parsed;
    }
  } catch (error) {
    return null;
  }

  return null;
}

function saveWindowState(bounds) {
  try {
    fs.writeFileSync(getWindowStatePath(), JSON.stringify(bounds));
  } catch (error) {
    // Best-effort: ignore persistence errors.
  }
}

function parseRsyncVersion(output) {
  const match = output.match(/rsync\s+version\s+(\d+)\.(\d+)\.(\d+)/i);
  if (!match) {
    return null;
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function getRsyncVersion() {
  if (rsyncVersionCache) {
    return Promise.resolve(rsyncVersionCache);
  }

  return new Promise((resolve) => {
    const child = spawn(resolvedRsyncPath, ["--version"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (data) => {
      output += data.toString();
    });
    child.stderr.on("data", (data) => {
      output += data.toString();
    });
    child.on("close", () => {
      rsyncVersionCache = parseRsyncVersion(output);
      resolve(rsyncVersionCache);
    });
    child.on("error", () => resolve(null));
  });
}

function supportsProgress2(version) {
  if (!version) {
    return false;
  }
  if (version.major > 3) {
    return true;
  }
  if (version.major === 3 && version.minor >= 1) {
    return true;
  }
  return false;
}

function getLogFilePath() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(app.getPath("userData"), `sync-log-${stamp}.log`);
}

function getHistoryFilePath() {
  return path.join(app.getPath("userData"), "history.json");
}

function loadHistory() {
  try {
    const raw = fs.readFileSync(getHistoryFilePath(), "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function saveHistory(entries) {
  try {
    fs.writeFileSync(getHistoryFilePath(), JSON.stringify(entries, null, 2));
  } catch (error) {
    // Best-effort: ignore persistence errors.
  }
}

function addHistoryEntry(entry) {
  const existing = loadHistory();
  const next = [entry, ...existing].slice(0, MAX_HISTORY_ENTRIES);
  saveHistory(next);
  return next;
}

function formatSpeed(bytesPerSecond) {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) {
    return "n/a";
  }
  const mbPerSecond = bytesPerSecond / (1024 * 1024);
  return `${mbPerSecond.toFixed(2)} MB/s`;
}

function parseOutFormat(line) {
  const parts = line.split(LOG_SEPARATOR);
  if (parts.length < 2) {
    return null;
  }
  const sizeRaw = parts.pop()?.trim();
  const size = Number(sizeRaw);
  if (Number.isNaN(size)) {
    return null;
  }
  const name = parts.join(LOG_SEPARATOR).trim();
  if (!name) {
    return null;
  }
  return { name, size };
}

function isInformationalLine(line) {
  const lower = line.toLowerCase();
  return (
    lower.startsWith("sending ") ||
    lower.startsWith("receiving ") ||
    lower.startsWith("sent ") ||
    lower.startsWith("total size") ||
    lower.startsWith("created directory") ||
    lower.startsWith("rsync:")
  );
}

function normalizeExcludePatterns(patterns) {
  if (!Array.isArray(patterns)) {
    return [];
  }
  const sanitized = [];
  for (const raw of patterns) {
    if (typeof raw !== "string") {
      continue;
    }
    const trimmed = raw.trim();
    if (!trimmed) {
      continue;
    }
    if (trimmed.length > 120) {
      continue;
    }
    if (trimmed.includes("..") || trimmed.includes("\0")) {
      continue;
    }
    if (!/^[a-zA-Z0-9._\-*/?\[\]{}!@+~\s]+$/.test(trimmed)) {
      continue;
    }
    sanitized.push(trimmed);
  }
  return sanitized.slice(0, 50);
}

function buildErrorSummary(lines, code) {
  const joined = lines.join(" ").toLowerCase();
  if (joined.includes("permission denied") || joined.includes("operation not permitted")) {
    return {
      title: "Permission denied",
      suggestion:
        "Grant Full Disk Access to the app and verify drive permissions.",
    };
  }
  if (joined.includes("no such file or directory")) {
    return {
      title: "Missing folder",
      suggestion: "Re-check the source and destination paths.",
    };
  }
  if (joined.includes("no space left on device")) {
    return {
      title: "Disk is full",
      suggestion: "Free up space on the destination drive and try again.",
    };
  }
  if (joined.includes("connection unexpectedly closed")) {
    return {
      title: "Connection closed",
      suggestion: "If syncing over network, check connectivity and retry.",
    };
  }
  return {
    title: "Sync failed",
    suggestion:
      code !== null && code !== undefined
        ? `Rsync exited with code ${code}. Check the log for details.`
        : "Check the log for details and try again.",
  };
}

function getUpdateUrl() {
  return process.env.SYNC_APP_UPDATE_URL || DEFAULT_UPDATE_URL;
}

ipcMain.handle("get-app-info", async () => ({
  version: app.getVersion(),
}));

ipcMain.handle("get-release-notes", async () => {
  try {
    const notesPath = path.join(__dirname, "release-notes.json");
    const raw = fs.readFileSync(notesPath, "utf8");
    return { ok: true, notes: JSON.parse(raw) };
  } catch (error) {
    return { ok: false, message: "Unable to load release notes." };
  }
});

ipcMain.handle("get-terms", async () => {
  try {
    const termsPath = path.join(__dirname, "terms-of-use.html");
    const raw = fs.readFileSync(termsPath, "utf8");
    return { ok: true, html: raw };
  } catch (error) {
    return { ok: false, message: "Unable to load terms." };
  }
});

ipcMain.handle("get-history", async () => ({
  ok: true,
  history: loadHistory(),
}));

ipcMain.handle("open-log-folder", async () => {
  const folderPath = app.getPath("userData");
  try {
    await shell.openPath(folderPath);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: "Unable to open log folder." };
  }
});

ipcMain.handle("open-destination", async (_event, { destination }) => {
  const destinationValidation = validateDirectory(destination);
  if (!destinationValidation.ok) {
    return destinationValidation;
  }
  try {
    await shell.openPath(destination);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: "Unable to open destination folder." };
  }
});

ipcMain.handle("open-log-file", async (_event, { id }) => {
  if (!id || typeof id !== "string") {
    return { ok: false, message: "Invalid log entry." };
  }
  const history = loadHistory();
  const entry = history.find((item) => item.id === id);
  if (!entry?.logPath) {
    return { ok: false, message: "Log file not found." };
  }
  try {
    await shell.openPath(entry.logPath);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: "Unable to open log file." };
  }
});

ipcMain.handle("check-updates", async () => {
  if (!app.isPackaged) {
    return { ok: false, message: "Updates are available only in packaged builds." };
  }
  if (!getUpdateUrl()) {
    return { ok: false, message: "Update URL is not configured." };
  }
  try {
    autoUpdater.checkForUpdates();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: "Unable to check for updates." };
  }
});

ipcMain.handle("install-update", async () => {
  if (!app.isPackaged) {
    return { ok: false, message: "Updates are available only in packaged builds." };
  }
  if (!updateReady) {
    return { ok: false, message: "No update is ready to install." };
  }
  try {
    autoUpdater.quitAndInstall();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: "Unable to install update." };
  }
});

function createWindow() {
  const savedState = loadWindowState();
  const initialBounds = {
    width: savedState?.width ?? defaultWindowSize.width,
    height: savedState?.height ?? defaultWindowSize.height,
    x: savedState?.x,
    y: savedState?.y,
  };

  mainWindow = new BrowserWindow({
    ...initialBounds,
    minWidth: defaultWindowSize.minWidth,
    minHeight: defaultWindowSize.minHeight,
    resizable: true,
    backgroundColor: "#0f1115",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));

  if (savedState?.x !== undefined && savedState?.y !== undefined) {
    mainWindow.setPosition(savedState.x, savedState.y);
  } else {
    mainWindow.center();
  }

  mainWindow.webContents.once("did-finish-load", async () => {
    if (!savedState) {
      try {
        const contentSize = await mainWindow.webContents.executeJavaScript(
          "({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight })"
        );
        if (contentSize?.width && contentSize?.height) {
          const display = screen.getPrimaryDisplay();
          const maxWidth = display.workAreaSize.width;
          const maxHeight = display.workAreaSize.height;
          const targetWidth = Math.min(
            Math.max(contentSize.width + 40, defaultWindowSize.minWidth),
            maxWidth
          );
          const targetHeight = Math.min(
            Math.max(contentSize.height + 40, defaultWindowSize.minHeight),
            maxHeight
          );
          mainWindow.setSize(Math.round(targetWidth), Math.round(targetHeight));
          mainWindow.center();
        }
      } catch (error) {
        // Ignore autosize failures.
      }
    }
  });

  const scheduleSave = () => {
    if (saveWindowStateTimer) {
      clearTimeout(saveWindowStateTimer);
    }
    saveWindowStateTimer = setTimeout(() => {
      if (mainWindow) {
        const bounds = mainWindow.getBounds();
        saveWindowState(bounds);
      }
    }, 200);
  };

  mainWindow.on("resize", scheduleSave);
  mainWindow.on("move", scheduleSave);
}

function setupAutoUpdater() {
  if (!app.isPackaged) {
    return;
  }

  const updateUrl = getUpdateUrl();
  if (!updateUrl) {
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.setFeedURL({ provider: "generic", url: updateUrl });

  autoUpdater.on("checking-for-update", () => {
    updateReady = false;
    mainWindow?.webContents.send("update-status", {
      status: "checking",
      message: "Checking for updates…",
    });
  });

  autoUpdater.on("update-available", () => {
    updateReady = false;
    mainWindow?.webContents.send("update-status", {
      status: "available",
      message: "Update available. Downloading…",
    });
  });

  autoUpdater.on("update-not-available", () => {
    updateReady = false;
    mainWindow?.webContents.send("update-status", {
      status: "none",
      message: "You are on the latest version.",
    });
  });

  autoUpdater.on("update-downloaded", () => {
    updateReady = true;
    mainWindow?.webContents.send("update-status", {
      status: "downloaded",
      message: "Update ready. Click Update to install.",
    });
  });

  autoUpdater.on("error", (error) => {
    updateReady = false;
    mainWindow?.webContents.send("update-status", {
      status: "error",
      message: error.message,
    });
  });
}

app.whenReady().then(() => {
  createWindow();
  setupAutoUpdater();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

function validateDirectory(dirPath) {
  if (!dirPath || typeof dirPath !== "string") {
    return { ok: false, message: "Missing folder path." };
  }

  if (!path.isAbsolute(dirPath)) {
    return { ok: false, message: "Folder path must be absolute." };
  }

  // Security note: directory path comes from a system folder picker.
  // We still validate and guard before using it in fs calls.
  try {
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) {
      return { ok: false, message: "Selected path is not a directory." };
    }
  } catch (error) {
    return { ok: false, message: "Folder does not exist or is not readable." };
  }

  return { ok: true };
}

ipcMain.handle("select-directory", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }

  return { canceled: false, path: result.filePaths[0] };
});

ipcMain.handle(
  "start-sync",
  async (_event, { source, destination, dryRun, excludePatterns, preserveRoot }) => {
  if (rsyncProcess) {
    return { ok: false, message: "A sync is already running." };
  }

  const sourceValidation = validateDirectory(source);
  if (!sourceValidation.ok) {
    return sourceValidation;
  }

  const destinationValidation = validateDirectory(destination);
  if (!destinationValidation.ok) {
    return destinationValidation;
  }

  if (path.resolve(source) === path.resolve(destination)) {
    return { ok: false, message: "Source and destination must be different." };
  }

  const normalizedSource = preserveRoot
    ? source
    : source.endsWith(path.sep)
      ? source
      : `${source}${path.sep}`;

  const rsyncVersion = await getRsyncVersion();
  const canUseProgress2 = supportsProgress2(rsyncVersion);
  const safeExcludePatterns = normalizeExcludePatterns(excludePatterns);

  const args = [
    "-a",
    canUseProgress2 ? "--info=progress2" : "--progress",
    ...(canUseProgress2 ? ["--info=name"] : []),
    "--human-readable",
    `--out-format=%n${LOG_SEPARATOR}%l`,
    ...(dryRun ? ["--dry-run", "--itemize-changes"] : []),
    ...safeExcludePatterns.map((pattern) => `--exclude=${pattern}`),
    normalizedSource,
    destination,
  ];

  const logPath = getLogFilePath();
  const logStream = fs.createWriteStream(logPath, { flags: "a" });
  const startTimestamp = new Date().toISOString();
  const runStart = Date.now();
  logStream.write(`Sync started: ${startTimestamp}\n`);
  logStream.write(`Rsync: ${resolvedRsyncPath}\n`);
  if (rsyncVersion) {
    logStream.write(
      `Rsync version: ${rsyncVersion.major}.${rsyncVersion.minor}.${rsyncVersion.patch}\n`
    );
  }
  logStream.write(`Source: ${source}\n`);
  logStream.write(`Destination: ${destination}\n`);
  logStream.write(`Mode: ${dryRun ? "preview" : "sync"}\n`);
  logStream.write(`Preserve root: ${preserveRoot ? "yes" : "no"}\n`);
  if (safeExcludePatterns.length > 0) {
    logStream.write(`Excludes: ${safeExcludePatterns.join(", ")}\n`);
  }
  logStream.write("\nPer-file results:\n");

  // Security note: paths are validated and chosen via system dialog.
  // Using spawn with args avoids shell interpolation risks.
  rsyncProcess = spawn(resolvedRsyncPath, args, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  let buffer = "";
  let lastProgress = 0;
  const lastOutputLines = [];
  let currentFile = null;
  let totalBytes = 0;

  const handleOutput = (data) => {
    buffer += data.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      const outFormat = parseOutFormat(trimmed);
      const match = trimmed.match(/(\d+)%/);
      lastOutputLines.push(trimmed);
      while (lastOutputLines.length > MAX_OUTPUT_LINES) {
        lastOutputLines.shift();
      }

      if (outFormat) {
        const now = Date.now();
        const { name, size } = outFormat;
        const durationSeconds =
          !dryRun && currentFile && currentFile.name === name
            ? Math.max(0, (now - currentFile.startTime) / 1000)
            : 0;
        const speed =
          durationSeconds > 0 ? size / durationSeconds : Number.NaN;
        totalBytes += size;
        const timestamp = new Date(now).toISOString();
        logStream.write(
          `${timestamp} | ${name} | ${size} bytes | ${durationSeconds.toFixed(
            2
          )}s | ${formatSpeed(speed)}\n`
        );
        currentFile = null;
        mainWindow.webContents.send("rsync-output", {
          type: "file",
          line: name,
        });
      } else if (match) {
        const progress = Number(match[1]);
        if (!Number.isNaN(progress)) {
          lastProgress = progress;
          mainWindow.webContents.send("rsync-output", {
            type: "progress",
            progress,
            line: trimmed,
          });
        }
      } else if (!isInformationalLine(trimmed)) {
        if (!dryRun && !currentFile) {
          currentFile = {
            name: trimmed,
            startTime: Date.now(),
          };
        }
        mainWindow.webContents.send("rsync-output", {
          type: "file",
          line: trimmed,
        });
      } else {
        mainWindow.webContents.send("rsync-output", {
          type: "file",
          line: trimmed,
        });
      }
    }
  };

  rsyncProcess.stdout.on("data", handleOutput);
  rsyncProcess.stderr.on("data", handleOutput);

  rsyncProcess.on("close", (code) => {
    const success = code === 0;
    if (!dryRun && currentFile) {
      const now = Date.now();
      const durationSeconds = Math.max(
        0,
        (now - currentFile.startTime) / 1000
      );
      const timestamp = new Date(now).toISOString();
      logStream.write(
        `${timestamp} | ${currentFile.name} | 0 bytes | ${durationSeconds.toFixed(
          2
        )}s | n/a\n`
      );
      currentFile = null;
    }
    const endTimestamp = new Date().toISOString();
    logStream.write(`\nSync ended: ${endTimestamp}\n`);
    logStream.write(`Total bytes (from rsync output): ${totalBytes}\n`);
    logStream.end();
    const summary = success ? null : buildErrorSummary(lastOutputLines, code);
    const durationSeconds = Math.max(0, (Date.now() - runStart) / 1000);
    const historyEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      startedAt: startTimestamp,
      endedAt: endTimestamp,
      durationSeconds,
      bytes: totalBytes,
      status: success ? (dryRun ? "preview" : "success") : "failed",
      source,
      destination,
      dryRun: Boolean(dryRun),
      logPath,
      errorSummary: summary,
    };
    const history = addHistoryEntry(historyEntry);
    mainWindow.webContents.send("rsync-complete", {
      success,
      code,
      progress: success ? 100 : lastProgress,
      details: success ? null : lastOutputLines.join("\n"),
      summary,
      history,
      dryRun: Boolean(dryRun),
    });
    rsyncProcess = null;
  });

  rsyncProcess.on("error", (error) => {
    logStream.write(`\nSync error: ${error.message}\n`);
    logStream.end();
    const summary = {
      title: "Sync error",
      suggestion: error.message,
    };
    const endTimestamp = new Date().toISOString();
    const historyEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      startedAt: startTimestamp,
      endedAt: endTimestamp,
      durationSeconds: Math.max(0, (Date.now() - runStart) / 1000),
      bytes: totalBytes,
      status: "failed",
      source,
      destination,
      dryRun: Boolean(dryRun),
      logPath,
      errorSummary: summary,
    };
    const history = addHistoryEntry(historyEntry);
    mainWindow.webContents.send("rsync-complete", {
      success: false,
      code: null,
      progress: lastProgress,
      message: error.message,
      details: lastOutputLines.join("\n"),
      summary,
      history,
      dryRun: Boolean(dryRun),
    });
    rsyncProcess = null;
  });

  return { ok: true, logPath };
});

ipcMain.handle("cancel-sync", async () => {
  if (!rsyncProcess) {
    return { ok: false, message: "No sync is currently running." };
  }

  rsyncProcess.kill("SIGTERM");
  rsyncProcess = null;
  return { ok: true };
});
