const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("syncApi", {
  selectDirectory: () => ipcRenderer.invoke("select-directory"),
  startSync: (source, destination, dryRun, excludePatterns, preserveRoot) =>
    ipcRenderer.invoke("start-sync", {
      source,
      destination,
      dryRun: Boolean(dryRun),
      excludePatterns,
      preserveRoot: Boolean(preserveRoot),
    }),
  cancelSync: () => ipcRenderer.invoke("cancel-sync"),
  onOutput: (handler) =>
    ipcRenderer.on("rsync-output", (_event, payload) => handler(payload)),
  onComplete: (handler) =>
    ipcRenderer.on("rsync-complete", (_event, payload) => handler(payload)),
  getAppInfo: () => ipcRenderer.invoke("get-app-info"),
  getReleaseNotes: () => ipcRenderer.invoke("get-release-notes"),
  getHistory: () => ipcRenderer.invoke("get-history"),
  openLogFolder: () => ipcRenderer.invoke("open-log-folder"),
  openDestination: (destination) =>
    ipcRenderer.invoke("open-destination", { destination }),
  openLogFile: (id) => ipcRenderer.invoke("open-log-file", { id }),
  getTerms: () => ipcRenderer.invoke("get-terms"),
  checkUpdates: () => ipcRenderer.invoke("check-updates"),
  checkGithubRelease: () => ipcRenderer.invoke("check-github-release"),
  installUpdate: () => ipcRenderer.invoke("install-update"),
  openExternal: (url) => ipcRenderer.invoke("open-external", { url }),
  onUpdateStatus: (handler) =>
    ipcRenderer.on("update-status", (_event, payload) => handler(payload)),
});
