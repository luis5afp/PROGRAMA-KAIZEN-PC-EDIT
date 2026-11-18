const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const main = fs.readFileSync(path.join(root, 'main.min.js'), 'utf8')
const preload = fs.readFileSync(path.join(root, 'preload.min.js'), 'utf8')
const noUpdates = fs.readFileSync(path.join(root, 'main.no-updates.js'), 'utf8')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const [major, minor, patch] = String(pkg.version).split('.').map(Number)
assert(/^\d+\.\d+\.\d+$/.test(pkg.version) &&
  Number.isSafeInteger(major) && Number.isSafeInteger(minor) && Number.isSafeInteger(patch) &&
  (major > 1 || (major === 1 && (minor > 5 || (minor === 5 && patch >= 40)))),
  'expected KAIZEN 1.5.40 or newer')
assert(main.includes("ensurePersistentKaizenStorage"), 'persistent storage bootstrap missing')
assert(main.includes("KAIZEN-Logistica"), 'persistent logistics root missing')
assert(main.includes("guestRecoverAccidentalResourcesProfile"), 'resources recovery missing')
assert(main.includes("guestFindNestedDataRoots"), 'recursive data-root discovery missing')
assert(main.includes("guestExtractAndRecoverResourcesZip"), 'resources.zip fallback extraction missing')
assert(main.includes("guestLooksLikeChromeProfileDir"), 'Chrome profile folder validation missing')
assert(main.includes("guestCopyProfileDirAtomic"), 'non-destructive profile folder import missing')
assert(main.includes("guestCopyDataRoots"), 'bulk folder import missing')
assert(main.includes("ipcMain.handle('guest-local-import-folder'"), 'folder import IPC missing')
assert(main.includes("properties:['openDirectory']"), 'folder picker must select directories')
assert(main.includes("without modifying source folder"), 'folder import must preserve source')
assert(main.includes("ipcMain.handle('guest-local-refresh'"), 'guest-local-refresh IPC missing')
assert(main.includes("ipcMain.handle('guest-local-import-bundle'"), 'resources.zip import IPC missing')
assert(main.includes("C:\\\\KAIZEN-PERFILES"), 'preferred local profile folder missing')
assert(main.includes(".kaizen-folder-backup-"), 'folder import rollback backup missing')
assert(main.includes("Cierra este perfil antes de actualizarlo."), 'running-profile update guard missing')
assert(!preload.includes("guest-refresh-catalog"), 'old remote guest refresh bridge still present')
assert(!preload.includes("localStorage.getItem('token')"), 'guest panel still tries to read a token')
assert(preload.includes("guest-local-import-folder"), 'folder import UI bridge missing')
assert(preload.includes("📂 Importar carpeta"), 'folder import button missing')
assert(preload.includes("📦 Importar resources.zip"), 'resources.zip button missing')
assert(preload.includes("🔄 Actualizar todo"), 'bulk update button missing')
const member = fs.readFileSync(path.join(root,'main.member-test.js'),'utf8')
const updater = fs.readFileSync(path.join(root,'kaizen-silent-updater.js'),'utf8')
assert(member.includes('startStartupUpdate(app,autoUpdater)'), 'production startup must enable silent updater')
assert(updater.includes('updater.quitAndInstall(true,true)'), 'downloaded updates must install and relaunch silently')
assert(noUpdates.includes('startFullConnectionCapture()'), 'legacy diagnostic launcher remains separate')

console.log('guest-local-update-scenarios: OK')
