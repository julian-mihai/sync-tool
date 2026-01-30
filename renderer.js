const sourceInput = document.getElementById("sourcePath");
const destinationInput = document.getElementById("destinationPath");
const chooseSourceBtn = document.getElementById("chooseSource");
const chooseDestinationBtn = document.getElementById("chooseDestination");
const startBtn = document.getElementById("startSync");
const previewBtn = document.getElementById("previewSync");
const cancelBtn = document.getElementById("cancelSync");
const openLogFolderBtn = document.getElementById("openLogFolder");
const openSourceBtn = document.getElementById("openSource");
const openDestinationBtn = document.getElementById("openDestination");
const excludePatternsInput = document.getElementById("excludePatterns");
const statusMessage = document.getElementById("statusMessage");
const updateLink = document.getElementById("updateLink");
const progressFill = document.getElementById("progressFill");
const progressPercent = document.getElementById("progressPercent");
const streamLog = document.getElementById("streamLog");
const appVersion = document.getElementById("appVersion");
const lastRunBadge = document.getElementById("lastRunBadge");
const openReleaseNotesBtn = document.getElementById("openReleaseNotes");
const openHistoryBtn = document.getElementById("openHistory");
const openHelpBtn = document.getElementById("openHelp");
const openTermsBtn = document.getElementById("openTerms");
const checkUpdatesBtn = document.getElementById("checkUpdates");
const closeReleaseNotesBtn = document.getElementById("closeReleaseNotes");
const releaseNotesModal = document.getElementById("releaseNotesModal");
const releaseNotesTitle = document.getElementById("releaseNotesTitle");
const releaseNotesBody = document.getElementById("releaseNotesBody");
const historyModal = document.getElementById("historyModal");
const closeHistoryBtn = document.getElementById("closeHistory");
const helpModal = document.getElementById("helpModal");
const closeHelpBtn = document.getElementById("closeHelp");
const termsModal = document.getElementById("termsModal");
const closeTermsBtn = document.getElementById("closeTerms");
const termsBody = document.getElementById("termsBody");
const historyList = document.getElementById("historyList");
const historyCount = document.getElementById("historyCount");
const lastSummary = document.getElementById("lastSummary");
const autoUpdateToggle = document.getElementById("autoUpdateToggle");
const preserveRootToggle = document.getElementById("preserveRootToggle");
let updateStatus = "idle";
let githubReleaseUrl = null;

const MAX_LOG_LINES = 200;
const logLines = [];
const historyLogMap = new Map();
let historyCache = [];

const setStatus = (message, tone = "info") => {
  statusMessage.textContent = message;
  statusMessage.dataset.tone = tone;
};

const setProgress = (percent) => {
  const safePercent = Math.max(0, Math.min(100, percent));
  progressFill.style.width = `${safePercent}%`;
  progressPercent.textContent = `${safePercent}%`;
};

const appendLog = (line) => {
  logLines.push(line);
  while (logLines.length > MAX_LOG_LINES) {
    logLines.shift();
  }
  streamLog.textContent = logLines.join("\n");
  streamLog.scrollTop = streamLog.scrollHeight;
};

const resetLog = () => {
  logLines.length = 0;
  streamLog.textContent = "";
};

const toggleRunning = (running) => {
  startBtn.disabled = running;
  previewBtn.disabled = running;
  cancelBtn.disabled = !running;
  chooseSourceBtn.disabled = running;
  chooseDestinationBtn.disabled = running;
  openLogFolderBtn.disabled = running;
  openSourceBtn.disabled = running || !sourceInput.value;
  openDestinationBtn.disabled = running || !destinationInput.value;
};

const getExcludePatterns = () =>
  excludePatternsInput.value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(1)} ${units[index]}`;
};

const formatDuration = (seconds) => {
  const totalSeconds = Number.isFinite(seconds) && seconds >= 0 ? seconds : 0;
  const rounded = Math.round(totalSeconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const secs = rounded % 60;
  const pad = (value) => String(value).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)}`;
};

const renderLastSummary = (entry) => {
  if (!lastSummary) {
    return;
  }
  if (!entry) {
    lastSummary.innerHTML = "<p class=\"helper\">No runs yet.</p>";
    return;
  }
  const started = new Date(entry.startedAt).toLocaleString();
  const duration = formatDuration(entry.durationSeconds);
  const statusLabel = entry.status ?? "unknown";
  if (lastRunBadge) {
    lastRunBadge.classList.remove("hidden", "success", "failed", "preview");
    lastRunBadge.classList.add(statusLabel);
    lastRunBadge.textContent = `Last: ${statusLabel}`;
  }
  lastSummary.innerHTML = `
    <div class="summary-title">
      <span>Last sync summary</span>
      <span class="summary-muted">${statusLabel}</span>
    </div>
    <div class="summary-row">
      <span>${started}</span>
      <span>${duration} • ${formatBytes(entry.bytes)}</span>
    </div>
    <div class="summary-row summary-muted">
      <span>${entry.source}</span>
    </div>
    <div class="summary-row summary-muted">
      <span>${entry.destination}</span>
    </div>
  `;
};

const renderHistory = (entries = []) => {
  const safeEntries = Array.isArray(entries) ? entries : [];
  historyCount.textContent = `${safeEntries.length} run${
    safeEntries.length === 1 ? "" : "s"
  }`;
  if (safeEntries.length === 0) {
    historyList.innerHTML = "<p class=\"helper\">No runs yet.</p>";
    renderLastSummary(null);
    return;
  }

  try {
    historyLogMap.clear();
    safeEntries.forEach((entry) => {
      if (entry?.id && entry?.logPath) {
        historyLogMap.set(entry.id, entry.logPath);
      }
    });
    renderLastSummary(safeEntries[0]);
    historyList.innerHTML = safeEntries
      .map((entry) => {
        const statusClass =
          entry.status === "success"
            ? "success"
            : entry.status === "preview"
              ? "preview"
              : "failed";
        const started = new Date(entry.startedAt).toLocaleString();
        const duration = formatDuration(entry.durationSeconds);
        return `
          <div class="history-item">
            <div class="history-row">
              <strong>${entry.dryRun ? "Preview" : "Sync"}</strong>
              <span class="history-status ${statusClass}">${entry.status}</span>
            </div>
            <div class="history-row">
              <span>${started}</span>
              <span>${duration} • ${formatBytes(entry.bytes)}</span>
            </div>
            <div class="history-row">
              <span>${entry.source}</span>
            </div>
            <div class="history-row">
              <span>${entry.destination}</span>
            </div>
            <div class="history-actions">
              <button class="history-action" data-log-id="${entry.id}">
                Open Log
              </button>
              <button class="history-action secondary" data-copy-id="${entry.id}">
                Copy Path
              </button>
            </div>
          </div>
        `;
      })
      .join("");
  } catch (error) {
    historyList.innerHTML =
      "<p class=\"helper\">Unable to render history entries.</p>";
    setStatus("History render failed.", "error");
  }
};

const loadAutoUpdatePreference = () => {
  const stored = localStorage.getItem("autoUpdateEnabled");
  return stored === null ? true : stored === "true";
};

const saveAutoUpdatePreference = (enabled) => {
  localStorage.setItem("autoUpdateEnabled", String(enabled));
};

const renderReleaseNotes = (notes) => {
  if (!notes || !Array.isArray(notes.items)) {
    releaseNotesBody.textContent =
      "Release notes are not available at the moment.";
    return;
  }

  releaseNotesTitle.textContent = notes.title ?? "Release Notes";
  const intro =
    notes.intro && Array.isArray(notes.description)
      ? `<h3>${notes.intro}</h3><ul>${notes.description
          .map((line) => `<li>${line}</li>`)
          .join("")}</ul>`
      : "";
  const fragments =
    intro +
    notes.items
    .map((item) => {
      const heading = `${item.version ?? ""}${item.date ? ` • ${item.date}` : ""}`;
      const items = Array.isArray(item.notes)
        ? `<ul>${item.notes
            .map((note) => `<li>${note}</li>`)
            .join("")}</ul>`
        : "";
      return `<h3>${heading}</h3>${items}`;
    })
    .join("");

  releaseNotesBody.innerHTML = fragments || "No release notes yet.";
};

const toggleReleaseNotes = (open) => {
  releaseNotesModal.classList.toggle("hidden", !open);
};

const toggleHistory = (open) => {
  if (!historyModal) {
    setStatus("History modal is unavailable.", "warning");
    return;
  }
  historyModal.classList.toggle("hidden", !open);
  console.log("History modal toggled:", open);
};

const toggleHelp = (open) => {
  helpModal.classList.toggle("hidden", !open);
};

const toggleTerms = (open) => {
  termsModal.classList.toggle("hidden", !open);
};

openReleaseNotesBtn.addEventListener("click", () => toggleReleaseNotes(true));
closeReleaseNotesBtn.addEventListener("click", () => toggleReleaseNotes(false));
releaseNotesModal.addEventListener("click", (event) => {
  if (event.target === releaseNotesModal) {
    toggleReleaseNotes(false);
  }
});

if (openHistoryBtn) {
  openHistoryBtn.addEventListener("click", async () => {
    setStatus("Opening history…");
    toggleHistory(true);
    let rendered = false;
    if (typeof window.syncApi?.getHistory === "function") {
      try {
        const history = await window.syncApi.getHistory();
        if (history?.ok) {
          historyCache = Array.isArray(history.history) ? history.history : [];
          renderHistory(historyCache);
          rendered = true;
        }
      } catch (error) {
        // Fall back to cached history below.
      }
    }
    if (!rendered) {
      if (historyCache.length > 0) {
        renderHistory(historyCache);
      } else {
        renderHistory([]);
        setStatus("Unable to load history right now.", "warning");
      }
    } else {
      setStatus("History loaded.");
    }
  });
} else {
  setStatus("History button is unavailable.", "warning");
}
closeHistoryBtn.addEventListener("click", () => {
  toggleHistory(false);
  setStatus("");
});
historyModal.addEventListener("click", (event) => {
  if (event.target === historyModal) {
    toggleHistory(false);
    setStatus("");
  }
});

openHelpBtn.addEventListener("click", () => toggleHelp(true));
closeHelpBtn.addEventListener("click", () => toggleHelp(false));
helpModal.addEventListener("click", (event) => {
  if (event.target === helpModal) {
    toggleHelp(false);
  }
});

openTermsBtn.addEventListener("click", () => toggleTerms(true));
closeTermsBtn.addEventListener("click", () => toggleTerms(false));
termsModal.addEventListener("click", (event) => {
  if (event.target === termsModal) {
    toggleTerms(false);
  }
});

openLogFolderBtn.addEventListener("click", async () => {
  const response = await window.syncApi.openLogFolder();
  if (!response.ok) {
    setStatus(response.message ?? "Unable to open log folder.", "error");
  }
});

openSourceBtn.addEventListener("click", async () => {
  const response = await window.syncApi.openSource(sourceInput.value);
  if (!response.ok) {
    setStatus(response.message ?? "Unable to open source folder.", "error");
  }
});

checkUpdatesBtn.addEventListener("click", async () => {
  if (updateStatus === "downloaded") {
    const response = await window.syncApi.installUpdate();
    if (!response.ok) {
      setStatus(response.message ?? "Unable to install update.", "error");
    }
    return;
  }

  if (updateStatus === "github-available" && githubReleaseUrl) {
    await window.syncApi.openExternal(githubReleaseUrl);
    return;
  }

  const response = await window.syncApi.checkGithubRelease();
  if (!response.ok) {
    setStatus(response.message ?? "Unable to check for updates.", "error");
    return;
  }
  if (response.updateAvailable) {
    updateStatus = "github-available";
    githubReleaseUrl = response.url;
    checkUpdatesBtn.textContent = "Download";
    checkUpdatesBtn.disabled = false;
    updateLink.textContent = `Download v${response.latestVersion}`;
    updateLink.classList.remove("hidden");
    setStatus(`New version ${response.latestVersion} available.`, "success");
    appendLog(`New version available: ${response.latestVersion}`);
  } else {
    updateStatus = "none";
    githubReleaseUrl = null;
    checkUpdatesBtn.textContent = "Update";
    checkUpdatesBtn.disabled = false;
    updateLink.classList.add("hidden");
    setStatus("You are on the latest version.");
  }
});

autoUpdateToggle.addEventListener("change", async () => {
  saveAutoUpdatePreference(autoUpdateToggle.checked);
  if (autoUpdateToggle.checked) {
    const response = await window.syncApi.checkGithubRelease();
    if (!response.ok) {
      setStatus(response.message ?? "Unable to check for updates.", "error");
    } else if (response.updateAvailable) {
      updateStatus = "github-available";
      githubReleaseUrl = response.url;
      checkUpdatesBtn.textContent = "Download";
      checkUpdatesBtn.disabled = false;
      updateLink.textContent = `Download v${response.latestVersion}`;
      updateLink.classList.remove("hidden");
      setStatus(`New version ${response.latestVersion} available.`, "success");
      appendLog(`New version available: ${response.latestVersion}`);
    }
  }
});

openDestinationBtn.addEventListener("click", async () => {
  const response = await window.syncApi.openDestination(destinationInput.value);
  if (!response.ok) {
    setStatus(response.message ?? "Unable to open destination.", "error");
  }
});

updateLink.addEventListener("click", async () => {
  if (githubReleaseUrl) {
    await window.syncApi.openExternal(githubReleaseUrl);
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    toggleReleaseNotes(false);
    toggleHistory(false);
    toggleHelp(false);
    toggleTerms(false);
  }
});

chooseSourceBtn.addEventListener("click", async () => {
  const result = await window.syncApi.selectDirectory();
  if (!result.canceled && result.path) {
    sourceInput.value = result.path;
    openSourceBtn.disabled = false;
  }
});

chooseDestinationBtn.addEventListener("click", async () => {
  const result = await window.syncApi.selectDirectory();
  if (!result.canceled && result.path) {
    destinationInput.value = result.path;
    openDestinationBtn.disabled = false;
  }
});

(async () => {
  openDestinationBtn.disabled = true;
  openSourceBtn.disabled = true;
  excludePatternsInput.value = [
    ".DS_Store",
    ".git",
    "node_modules",
    "bin",
    "obj",
    ".vs",
    "dist",
    "build",
    "coverage",
    "*.tmp",
  ].join("\n");
  autoUpdateToggle.checked = loadAutoUpdatePreference();
  preserveRootToggle.checked = true;
  const info = await window.syncApi.getAppInfo();
  if (info?.version) {
    appVersion.textContent = `v${info.version}`;
  }

  const notes = await window.syncApi.getReleaseNotes();
  if (notes?.ok) {
    renderReleaseNotes(notes.notes);
  } else {
    renderReleaseNotes(null);
  }

  const terms = await window.syncApi.getTerms();
  if (terms?.ok) {
    termsBody.innerHTML = terms.html;
  } else {
    termsBody.textContent =
      "Terms of use are not available at the moment.";
  }

  const history = await window.syncApi.getHistory();
  if (history?.ok) {
    historyCache = Array.isArray(history.history) ? history.history : [];
    renderHistory(historyCache);
  }

  if (autoUpdateToggle.checked) {
    const response = await window.syncApi.checkGithubRelease();
    if (response?.updateAvailable) {
      updateStatus = "github-available";
      githubReleaseUrl = response.url;
      checkUpdatesBtn.textContent = "Download";
      checkUpdatesBtn.disabled = false;
      updateLink.textContent = `Download v${response.latestVersion}`;
      updateLink.classList.remove("hidden");
      setStatus(`New version ${response.latestVersion} available.`, "success");
      appendLog(`New version available: ${response.latestVersion}`);
    }
  }
})();

const runSync = async ({ dryRun }) => {
  setStatus(dryRun ? "Preparing preview…" : "Preparing sync…");
  setProgress(0);
  resetLog();

  const response = await window.syncApi.startSync(
    sourceInput.value,
    destinationInput.value,
    dryRun,
    getExcludePatterns(),
    preserveRootToggle.checked
  );

  if (!response.ok) {
    setStatus(response.message ?? "Unable to start sync.", "error");
    return;
  }

  toggleRunning(true);
  setStatus(dryRun ? "Preview running…" : "Sync running…");
  if (response.logPath) {
    appendLog(`Log file: ${response.logPath}`);
  }
};

startBtn.addEventListener("click", () => runSync({ dryRun: false }));
previewBtn.addEventListener("click", () => runSync({ dryRun: true }));

cancelBtn.addEventListener("click", async () => {
  const response = await window.syncApi.cancelSync();
  if (!response.ok) {
    setStatus(response.message ?? "Unable to cancel sync.", "error");
    return;
  }
  setStatus("Sync canceled.", "warning");
  toggleRunning(false);
});

window.syncApi.onOutput((payload) => {
  if (payload.type === "progress") {
    setProgress(payload.progress);
    if (payload.line) {
      setStatus(payload.line);
    }
  } else if (payload.type === "file") {
    appendLog(payload.line);
  }
});

window.syncApi.onUpdateStatus((payload) => {
  if (!payload) {
    return;
  }
  if (updateStatus === "github-available" && payload.status !== "downloaded") {
    return;
  }
  updateStatus = payload.status ?? "idle";
  if (payload.message) {
    setStatus(payload.message);
    appendLog(payload.message);
  }

  if (updateStatus === "downloaded") {
    checkUpdatesBtn.textContent = "Install Update";
    checkUpdatesBtn.disabled = false;
  } else if (updateStatus === "checking") {
    checkUpdatesBtn.textContent = "Checking…";
    checkUpdatesBtn.disabled = true;
  } else if (updateStatus === "available") {
    checkUpdatesBtn.textContent = "Downloading…";
    checkUpdatesBtn.disabled = true;
  } else {
    checkUpdatesBtn.textContent = "Update";
    checkUpdatesBtn.disabled = false;
  }
});

historyList.addEventListener("click", async (event) => {
  const button = event.target.closest(".history-action");
  if (!button) {
    return;
  }
  const id = button.dataset.logId ?? button.dataset.copyId;
  if (!id) {
    return;
  }
  if (button.dataset.copyId) {
    const path = historyLogMap.get(id);
    if (!path) {
      setStatus("Log path not available.", "error");
      return;
    }
    const response = await window.syncApi.copyText(path);
    if (!response.ok) {
      setStatus(response.message ?? "Unable to copy log path.", "error");
      return;
    }
    setStatus("Log path copied.", "success");
    return;
  }
  const response = await window.syncApi.openLogFile(id);
  if (!response.ok) {
    setStatus(response.message ?? "Unable to open log file.", "error");
  }
});

window.syncApi.onComplete((payload) => {
  toggleRunning(false);
  if (payload.success) {
    setProgress(100);
    const successTitle = payload.dryRun ? "Preview complete." : "Sync complete.";
    setStatus(payload.summary?.title ?? successTitle, "success");
    appendLog(payload.summary?.title ?? successTitle);
  } else {
    setProgress(payload.progress ?? 0);
    const errorMessage = payload.summary?.title ?? payload.message ?? "Sync failed.";
    setStatus(errorMessage, "error");
    appendLog(errorMessage);
    if (payload.summary?.suggestion) {
      appendLog(`Suggestion: ${payload.summary.suggestion}`);
    }
    if (payload.code !== null && payload.code !== undefined) {
      appendLog(`Exit code: ${payload.code}`);
    }
    if (payload.details) {
      appendLog(payload.details);
    }
  }
  if (payload.history) {
    historyCache = Array.isArray(payload.history) ? payload.history : [];
    renderHistory(historyCache);
  }
});
