// KAIZEN custom launcher: updates intentionally disabled.
//
// This file runs before the original main.min.js and neutralizes electron-updater
// without changing the rest of the application. KAIZEN must remain usable even
// when the installed version is older than the latest published version.

const { autoUpdater } = require("electron-updater")

function forceFalseProperty(name) {
  try {
    Object.defineProperty(autoUpdater, name, {
      configurable: true,
      enumerable: true,
      get: () => false,
      set: () => {},
    })
  } catch (_) {
    try {
      autoUpdater[name] = false
    } catch (_) {}
  }
}

// Never download or install an update automatically when the app closes.
forceFalseProperty("autoDownload")
forceFalseProperty("autoInstallOnAppQuit")

// Never contact an update provider at startup, on the periodic timer, or from
// any renderer/manual update action that still exists in the compiled UI.
autoUpdater.checkForUpdates = async () => null
autoUpdater.checkForUpdatesAndNotify = async () => null
autoUpdater.downloadUpdate = async () => []

// A previously cached update must not be able to replace this custom build.
autoUpdater.quitAndInstall = () => {
  console.log("[updater] disabled — install request ignored")
  return false
}

console.log("[updater] automatic checks, downloads and installs are disabled")

// Start the original KAIZEN application unchanged after applying the policy.
require("./main.min.js")
