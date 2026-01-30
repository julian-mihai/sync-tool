const sourceInput = document.getElementById("sourcePath");
const destinationInput = document.getElementById("destinationPath");
const chooseSourceBtn = document.getElementById("chooseSource");
const chooseDestinationBtn = document.getElementById("chooseDestination");
const startBtn = document.getElementById("startSync");
const previewBtn = document.getElementById("previewSync");
const cancelBtn = document.getElementById("cancelSync");
const openLogFolderBtn = document.getElementById("openLogFolder");
const openDestinationBtn = document.getElementById("openDestination");
const excludePatternsInput = document.getElementById("excludePatterns");
const statusMessage = document.getElementById("statusMessage");
const progressFill = document.getElementById("progressFill");
const progressPercent = document.getElementById("progressPercent");
const streamLog = document.getElementById("streamLog");
const appVersion = document.getElementById("appVersion");
const openReleaseNotesBtn = document.getElementById("openReleaseNotes");
const openHelpBtn = document.getElementById("openHelp");
const openTermsBtn = document.getElementById("openTerms");
const checkUpdatesBtn = document.getElementById("checkUpdates");
const closeReleaseNotesBtn = document.getElementById("closeReleaseNotes");
const releaseNotesModal = document.getElementById("releaseNotesModal");
const releaseNotesTitle = document.getElementById("releaseNotesTitle");
const releaseNotesBody = document.getElementById("releaseNotesBody");
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

const renderLastSummary = (entry) => {
  if (!lastSummary) {
    return;
  }
  if (!entry) {
    lastSummary.innerHTML = "<p class=\"helper\">No runs yet.</p>";
    return;
  }
  const started = new Date(entry.startedAt).toLocaleString();
  const duration = `${Math.round(entry.durationSeconds)}s`;
  const statusLabel = entry.status ?? "unknown";
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
  historyCount.textContent = `${entries.length} run${entries.length === 1 ? "" : "s"}`;
  if (entries.length === 0) {
    historyList.innerHTML = "<p class=\"helper\">No runs yet.</p>";
    renderLastSummary(null);
    return;
  }

  renderLastSummary(entries[0]);
  historyList.innerHTML = entries
    .map((entry) => {
      const statusClass =
        entry.status === "success"
          ? "success"
          : entry.status === "preview"
            ? "preview"
            : "failed";
      const started = new Date(entry.startedAt).toLocaleString();
      const duration = `${Math.round(entry.durationSeconds)}s`;
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
          </div>
        </div>
      `;
    })
    .join("");
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
    setStatus(`New version ${response.latestVersion} available.`, "success");
    appendLog(`New version available: ${response.latestVersion}`);
  } else {
    updateStatus = "none";
    githubReleaseUrl = null;
    checkUpdatesBtn.textContent = "Update";
    checkUpdatesBtn.disabled = false;
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

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    toggleReleaseNotes(false);
    toggleHelp(false);
    toggleTerms(false);
  }
});

chooseSourceBtn.addEventListener("click", async () => {
  const result = await window.syncApi.selectDirectory();
  if (!result.canceled && result.path) {
    sourceInput.value = result.path;
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
  excludePatternsInput.value = ".git\nnode_modules\n*.tmp";
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
    renderHistory(history.history);
  }

  if (autoUpdateToggle.checked) {
    const response = await window.syncApi.checkGithubRelease();
    if (response?.updateAvailable) {
      updateStatus = "github-available";
      githubReleaseUrl = response.url;
      checkUpdatesBtn.textContent = "Download";
      checkUpdatesBtn.disabled = false;
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
  const id = button.dataset.logId;
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
    renderHistory(payload.history);
  }
});
