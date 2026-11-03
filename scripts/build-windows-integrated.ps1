# Compilacion PRIVADA. Los paquetes originales NO deben subirse al repo publico.
# Uso: pwsh -File scripts/build-windows-integrated.ps1 -ExtensionsSource "C:\privado\KAIZEN_EXTENSIONS_Originales.zip"
# O:   pwsh -File scripts/build-windows-integrated.ps1 -ExtensionsSource "C:\privado\KAIZEN_EXTENSIONS"
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$ExtensionsSource
)
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
$repo = Split-Path -Parent $PSScriptRoot
$stage = Join-Path ([IO.Path]::GetTempPath()) ("kaizen-private-build-" + [guid]::NewGuid().ToString('N'))
Push-Location $repo
try {
  $origin = (Resolve-Path -LiteralPath $ExtensionsSource).Path
  $unpacked = $origin
  if (Test-Path -LiteralPath $origin -PathType Leaf) {
    if ([IO.Path]::GetExtension($origin).ToLowerInvariant() -ne '.zip') {
      throw "Se requiere un directorio KAIZEN_EXTENSIONS o el ZIP original autorizado."
    }
    New-Item -ItemType Directory -Path $stage -Force | Out-Null
    Expand-Archive -LiteralPath $origin -DestinationPath $stage -Force
    $unpacked = Join-Path $stage 'KAIZEN_EXTENSIONS'
  }
  if ((Split-Path -Leaf $unpacked) -ne 'KAIZEN_EXTENSIONS') {
    $unpacked = Join-Path $unpacked 'KAIZEN_EXTENSIONS'
  }
  if (!(Test-Path -LiteralPath $unpacked -PathType Container)) {
    throw "No existen las carpetas de las tres extensiones originales."
  }
  # El usuario subió las tres carpetas dentro de un segundo
  # KAIZEN_EXTENSIONS. Aceptar ambas estructuras como FUENTE, pero copiar
  # siempre únicamente KAIZZEN_MAIN, KAIZZEN_GOOGLE y KAIZZEN_CUSTOM en
  # resources/KAIZEN_EXTENSIONS, sin niveles duplicados.
  $names = @('KAIZZEN_MAIN','KAIZZEN_GOOGLE','KAIZZEN_CUSTOM')
  $hasAll = $true
  foreach ($name in $names) {
    if (!(Test-Path -LiteralPath (Join-Path $unpacked "$name/manifest.json"))) { $hasAll = $false }
  }
  if (!$hasAll) {
    $nested = Join-Path $unpacked 'KAIZEN_EXTENSIONS'
    $nestedComplete = (Test-Path -LiteralPath $nested -PathType Container)
    foreach ($name in $names) {
      if (!(Test-Path -LiteralPath (Join-Path $nested "$name/manifest.json"))) { $nestedComplete = $false }
    }
    if (!$nestedComplete) {
      throw "No están juntas las tres extensiones completas, ni en la raíz ni en KAIZEN_EXTENSIONS anidada."
    }
    $unpacked = $nested
    Write-Warning "La fuente tiene KAIZEN_EXTENSIONS anidado; se normalizará dentro del instalador."
  }
  node app/scripts/verify-uploaded-original-extensions.js $unpacked
  node app/scripts/verify-original-extensions.js $unpacked
  node -e "require('./app/kaizen-original-extension-importer').validateFolder(process.argv[1])" $unpacked
  node app/scripts/verify-security-extensions.js runtime-resources/extensionForSecurity
  node app/scripts/verify-legacy-core-resources.js runtime-resources/extensionForSecurity
  node app/tests/embedded-extension-integration-scenarios.js
  # Ejecutar npm desde la carpeta del package.json real. En Windows
  # --prefix app puede resolverse contra la raíz y fallar con ENOENT.
  Push-Location (Join-Path $repo 'app')
  try {
    npm install --omit=dev --no-audit --no-fund
  } finally {
    Pop-Location
  }

  $out = Join-Path $repo 'dist/KAIZEN-PC-v1.5.38-win32-x64'
  npx --yes @electron/packager@18.3.6 ./app KAIZEN-PC-v1.5.38 --platform=win32 --arch=x64 --electron-version=36.0.0 --out=dist --overwrite --icon=app/assets/app.ico --asar
  if (!(Test-Path "$out/KAIZEN-PC-v1.5.38.exe")) { throw "Fallo la compilacion del ejecutable." }
  $resources = Join-Path $out 'resources'
  foreach ($folder in @('browserProfilesData','extensionsData','syncPath','extensionForSecurity')) {
    $source = Join-Path $repo "runtime-resources/$folder"
    if (Test-Path $source) { Copy-Item -LiteralPath $source -Destination (Join-Path $resources $folder) -Recurse -Force }
  }
  node app/scripts/verify-legacy-core-resources.js "$resources/extensionForSecurity"

  $target = Join-Path $resources 'KAIZEN_EXTENSIONS'
  if (Test-Path $target) { Remove-Item -LiteralPath $target -Force -Recurse }
  New-Item -ItemType Directory -Path $target -Force | Out-Null
  foreach ($name in @('KAIZZEN_MAIN','KAIZZEN_GOOGLE','KAIZZEN_CUSTOM')) {
    Copy-Item -LiteralPath (Join-Path $unpacked $name) -Destination (Join-Path $target $name) -Recurse -Force
  }
  node app/scripts/verify-original-extensions.js $target
  node -e "require('./app/kaizen-original-extension-importer').validateFolder(process.argv[1])" $target

  $chrome = Join-Path $out 'KAIZEN_CHROMIUM/chrome-win64/chrome.exe'
  if (!(Test-Path $chrome)) {
    $meta = Invoke-RestMethod 'https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json'
    $entry = @($meta.channels.Stable.downloads.chrome | Where-Object { $_.platform -eq 'win64' })[0]
    if (!$entry.url) { throw "No se encontro Chrome for Testing de Windows x64." }
    if (!(Test-Path $stage)) { New-Item -ItemType Directory -Path $stage -Force | Out-Null }
    $browserZip = Join-Path $stage 'chromium-win64.zip'
    Invoke-WebRequest -Uri $entry.url -OutFile $browserZip -MaximumRedirection 8
    $browserDir = Join-Path $out 'KAIZEN_CHROMIUM'
    New-Item -ItemType Directory -Path $browserDir -Force | Out-Null
    Expand-Archive -LiteralPath $browserZip -DestinationPath $browserDir -Force
  }
  if (!(Test-Path $chrome)) { throw "No se encontro Chromium incluido." }

  $installerFolder = Join-Path $repo 'dist/installer'
  if (Test-Path $installerFolder) { Remove-Item -LiteralPath $installerFolder -Force -Recurse }
  npx --yes electron-builder@26.0.12 --projectDir app --prepackaged $out --win nsis --x64 --publish never
  $installer = @(Get-ChildItem -LiteralPath $installerFolder -Filter '*.exe' -File)
  if ($installer.Count -ne 1) { throw "No se genero un unico instalador Windows." }
  Write-Host "Instalador completo creado en: $($installer[0].FullName)"
  Write-Host "Principal, Google y Custom quedan dentro de resources/KAIZEN_EXTENSIONS."
  Write-Host "No hay importacion ni ZIP que el usuario deba seleccionar."
  Write-Warning "Instalador sin firma; revisar permisos, red y secretos de las extensiones antes de distribuir."
} finally {
  Pop-Location
  if (Test-Path $stage) { Remove-Item -LiteralPath $stage -Force -Recurse }
}
