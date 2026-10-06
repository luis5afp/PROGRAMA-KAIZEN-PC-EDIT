const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const main = fs.readFileSync(path.join(root, 'main.min.js'), 'utf8')
const preload = fs.readFileSync(path.join(root, 'preload.min.js'), 'utf8')
const noUpdates = fs.readFileSync(path.join(root, 'main.no-updates.js'), 'utf8')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

assert(main.includes("ipcMain.handle('guest-local-refresh'"), 'guest-local-refresh IPC missing')
assert(main.includes("ipcMain.handle('guest-local-folder-open'"), 'guest-local-folder-open IPC missing')
assert(main.includes("ipcMain.handle('guest-open-profile'"), 'guest-open-profile IPC missing')
assert(main.includes("KAIZEN_PROFILES_DIR"), 'local source override missing')
assert(main.includes("C:\\\\KAIZEN-PERFILES"), 'preferred local profile folder missing')
assert(main.includes("unzipper.Open.file"), 'safe local ZIP inspection missing')
assert(main.includes("Cierra este perfil antes de actualizarlo."), 'running-profile update guard missing')
assert(main.includes(".kaizen-backup-"), 'local rollback backup missing')
assert(main.includes("without server authentication"), 'guest local-only launch marker missing')
assert(!preload.includes("guest-refresh-catalog"), 'old remote guest refresh bridge still present')
assert(!preload.includes("localStorage.getItem('token')"), 'guest panel still tries to read a token')
assert(preload.includes("guest-local-refresh"), 'guest local refresh UI missing')
assert(preload.includes("guest-local-folder-open"), 'guest local source folder UI missing')
assert(preload.includes("Actualizar y abrir"), 'guest local update action missing')
assert(noUpdates.includes("autoUpdater.checkForUpdates = async () => null"), 'application updater must remain disabled')
assert(noUpdates.includes("autoUpdater.downloadUpdate = async () => []"), 'application updater download must remain disabled')

console.log('guest-local-update-scenarios: OK')
