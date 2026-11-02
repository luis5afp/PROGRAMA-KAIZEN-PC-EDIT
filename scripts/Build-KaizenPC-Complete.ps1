#Requires -Version 5.1
<#
.SYNOPSIS
  Construye el KAIZEN PC v1.5.24 completo en Windows sin publicar los
  paquetes originales de extension a GitHub.
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\Build-KaizenPC-Complete.ps1 -PreviewZip .\KAIZEN-PREVIEW.zip -ExtensionsZip .\KAIZEN_EXTENSIONS_Originales.zip -Destination D:\KAIZEN-FINAL -AcceptSecurityRisks -MakeSetup
#>
[CmdletBinding(DefaultParameterSetName='Archive')]
param(
  [Parameter(Mandatory=$true,ParameterSetName='Archive')][string]$PreviewZip,
  [Parameter(Mandatory=$true,ParameterSetName='Folder')][string]$PreviewFolder,
  [Parameter(Mandatory=$true)][string]$ExtensionsZip,
  [Parameter(Mandatory=$true)][string]$Destination,
  [switch]$AcceptSecurityRisks,
  [switch]$SkipArchive,
  [switch]$MakeSetup
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
function Fail([string]$s){throw "[KAIZEN] $s"}
if(-not $AcceptSecurityRisks){
  Fail "EX1 puede enviar URLs del historial y EX2 restringir navegacion. Para aceptar estos riesgos usa -AcceptSecurityRisks."
}
if($PSCmdlet.ParameterSetName -eq 'Archive'){
  if(-not(Test-Path -LiteralPath $PreviewZip -PathType Leaf)){Fail "No existe ZIP portable"}
  $source=(Resolve-Path -LiteralPath $PreviewZip).Path
}else{
  if(-not(Test-Path -LiteralPath $PreviewFolder -PathType Container)){Fail "No existe carpeta portable"}
  $source=(Resolve-Path -LiteralPath $PreviewFolder).Path
}
if(-not(Test-Path -LiteralPath $ExtensionsZip -PathType Leaf)){Fail "No existe el ZIP con las tres extensiones"}
$extZip=(Resolve-Path -LiteralPath $ExtensionsZip).Path
New-Item -ItemType Directory -Path $Destination -Force | Out-Null
$dest=(Resolve-Path -LiteralPath $Destination).Path
$drive=New-Object System.IO.DriveInfo ([IO.Path]::GetPathRoot($dest))
if($drive.AvailableFreeSpace -lt 3GB){Fail "Se requieren 3 GB libres en el destino. Usa otro disco."}
$out=Join-Path $dest 'KAIZEN-PC-v1.5.24-COMPLETO'
$outZip=Join-Path $dest 'KAIZEN-PC-v1.5.24-COMPLETO-Windows-x64.zip'
if(Test-Path -LiteralPath $out){Fail "Ya existe $out; usa un directorio de destino nuevo"}
if(-not $SkipArchive -and(Test-Path -LiteralPath $outZip)){Fail "Ya existe $outZip"}
$tmp=Join-Path $dest ('.build-kaizen-'+[guid]::NewGuid().ToString('N'))
$work=Join-Path $tmp 'portable'
$ext=Join-Path $tmp 'originales'
New-Item -ItemType Directory -Path $work,$ext -Force | Out-Null
function Require([string]$p){
  if(-not(Test-Path -LiteralPath $p -PathType Leaf)){Fail "Falta archivo: $p"}
  if((Get-Item -LiteralPath $p).Attributes -band [IO.FileAttributes]::ReparsePoint){Fail "Enlace no permitido: $p"}
}
function ValidateProfiles([string]$base){
  foreach($spec in @(
    @('KAIZZEN_MAIN','KAIZZEN-MAIN','2.5.6'),
    @('KAIZZEN_GOOGLE','KAIZZEN-GOOGLE','1.0.3'),
    @('KAIZZEN_CUSTOM','KAIZZEN-CUSTOM','1.0.6')
  )){
    $folder=Join-Path $base $spec[0]
    $manifest=Join-Path $folder 'manifest.json'
    Require $manifest
    $m=Get-Content -LiteralPath $manifest -Raw -Encoding UTF8 | ConvertFrom-Json
    if($m.manifest_version -ne 3 -or $m.name -cne $spec[1] -or
       $m.version -cne $spec[2] -or $m.action.default_title -cne 'KAIZEN' -or
       $m.PSObject.Properties['key']){Fail "Paquete original no reconocido: $($spec[0])"}
    Require (Join-Path $folder 'index.html')
    $worker=[string]$m.background.service_worker
    if(-not $worker -or $worker -match '(^[\\/]|:|\.\.)'){Fail "Ruta de worker invalida"}
    Require (Join-Path $folder $worker)
    Write-Host "[OK] $($spec[1]) v$($spec[2])" -ForegroundColor Green
  }
}
function ValidateSecurity([string]$base){
  $hashes=@{
    'ex1\backgroundScript.js'='e7d0c09413ede5ad7884f4a9c4c0f0b1e0210a57d213841e8304338b536f7668'
    'ex1\contentScript.js'='f718478d6c02a1c21903c7dc3ca4d5fb8edc9699a389daf81f11b354121c1ce9'
    'ex1\manifest.json'='7c80f5e06eb8e43ba4c39211d2e76ccdc8d416082b90df06e84a1f478faa2460'
    'ex2\backgroundScript.js'='5eda8ba92e93d3adf33e08b8a319c4ac979c0144d2db945fb0c1072a9fcedb46'
    'ex2\contentScript.js'='34338eee92650b35b18c6607ea7b05cc2f418fbe15fbddb1ba05a926d30e2f67'
    'ex2\manifest.json'='aeaedc9c0b22ef3166e328747510c2413fc9351c2a625003a2d12c413d39bf58'
  }
  foreach($k in $hashes.Keys){
    $file=Join-Path $base $k; Require $file
    $h=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash
    if($h.ToLowerInvariant() -cne $hashes[$k]){Fail "Hash protegido incorrecto: $k"}
  }
  Write-Host "[OK] EX1 y EX2: los 6 archivos originales coinciden" -ForegroundColor Green
}
try{
  Write-Host "[1/5] Extrayendo portable..." -ForegroundColor Cyan
  if($PSCmdlet.ParameterSetName -eq 'Archive'){
    Expand-Archive -LiteralPath $source -DestinationPath $work -Force
  }else{
    foreach($item in @(Get-ChildItem -LiteralPath $source -Force)){
      Copy-Item -LiteralPath $item.FullName -Destination $work -Recurse -Force
    }
  }
  if(-not(Test-Path -LiteralPath (Join-Path $work 'KAIZEN-PC-v1.5.24.exe'))){
    $found=@(Get-ChildItem -LiteralPath $work -Filter 'KAIZEN-PC-v1.5.24.exe' -Recurse -File)
    if($found.Count -ne 1){Fail "No se encontro el EXE del portable"}
    $work=Split-Path -Parent $found[0].FullName
  }
  Require (Join-Path $work 'KAIZEN_CHROMIUM\chrome-win64\chrome.exe')
  Require (Join-Path $work 'resources\app.asar')
  ValidateSecurity (Join-Path $work 'resources\extensionForSecurity')
  Write-Host "[2/5] Extrayendo los tres perfiles originales..." -ForegroundColor Cyan
  Expand-Archive -LiteralPath $extZip -DestinationPath $ext -Force
  $bundle=Join-Path $ext 'KAIZEN_EXTENSIONS'
  if(-not(Test-Path -LiteralPath $bundle -PathType Container)){
    $found=@(Get-ChildItem -LiteralPath $ext -Filter 'KAIZEN_EXTENSIONS' -Directory -Recurse)
    if($found.Count -ne 1){Fail "ZIP sin carpeta unica KAIZEN_EXTENSIONS"}
    $bundle=$found[0].FullName
  }
  ValidateProfiles $bundle
  Write-Host "[3/5] Incorporando al programa..." -ForegroundColor Cyan
  $target=Join-Path $work 'KAIZEN_EXTENSIONS'
  if(Test-Path -LiteralPath $target){Remove-Item -LiteralPath $target -Recurse -Force}
  Copy-Item -LiteralPath $bundle -Destination $target -Recurse -Force
  ValidateProfiles $target
  ValidateSecurity (Join-Path $work 'resources\extensionForSecurity')
  @'
KAIZEN PC 1.5.24 - Paquete completo portable para Windows x64
Tres perfiles: Principal 2.5.6, Google 1.0.3 y Custom 1.0.6.
EX1 1.2 y EX2 1.1: seis archivos protegidos originales intactos.
EX1 no incluye inject.js; la referencia en el manifest es no bloqueante.
IMPORTANTE: EX1 puede enviar URLs del historial, EX2 puede restringir
navegacion e inspeccion. Usar solo tras aceptar estos riesgos.
Se debe confirmar la apertura real de los tres perfiles en Windows.
No se elude inicio de sesion, catalogos ni 2FA del servidor.
'@ | Set-Content -LiteralPath (Join-Path $work 'LEEME-KAIZEN-COMPLETO.txt') -Encoding UTF8
  Move-Item -LiteralPath $work -Destination $out
  if(-not $SkipArchive){
    Write-Host "[4/5] Generando ZIP de distribucion..." -ForegroundColor Cyan
    Compress-Archive -Path (Join-Path $out '*') -DestinationPath $outZip -CompressionLevel Optimal
  }
  if($MakeSetup){
    Write-Host "[5/5] Creando Setup con NSIS instalado localmente..." -ForegroundColor Cyan
    $cmd=Get-Command makensis.exe -ErrorAction SilentlyContinue
    if(-not $cmd){
      $look=@(
        ([Environment]::GetEnvironmentVariable('ProgramFiles(x86)')+'\NSIS\makensis.exe'),
        ($env:ProgramFiles+'\NSIS\makensis.exe')
      )
      foreach($p in $look){if(Test-Path -LiteralPath $p){$cmd=Get-Item -LiteralPath $p;break}}
    }
    if(-not $cmd){Fail "Falta NSIS para -MakeSetup. Descargalo de nsis.sourceforge.io; el ZIP portable ya esta listo."}
    $setup=Join-Path $dest 'KAIZEN-PC-v1.5.24-Setup-COMPLETO.exe'
    $code=@'
Unicode true
Name "KAIZEN PC v1.5.24"
OutFile "__OUTPUT__"
InstallDir "$PROGRAMFILES64\KAIZEN PC"
RequestExecutionLevel admin
SetCompressor /SOLID lzma
Page directory
Page instfiles
Section "Install"
SetOutPath "$INSTDIR"
File /r "__SOURCE__\*"
CreateDirectory "$SMPROGRAMS\KAIZEN PC"
CreateShortCut "$SMPROGRAMS\KAIZEN PC\KAIZEN PC.lnk" "$INSTDIR\KAIZEN-PC-v1.5.24.exe"
CreateShortCut "$DESKTOP\KAIZEN PC.lnk" "$INSTDIR\KAIZEN-PC-v1.5.24.exe"
SectionEnd
'@
    $code=$code.Replace('__SOURCE__',$out.Replace('$','$$'))
    $code=$code.Replace('__OUTPUT__',$setup.Replace('$','$$'))
    $nsi=Join-Path $tmp 'setup.nsi'
    [IO.File]::WriteAllText($nsi,$code,(New-Object System.Text.UTF8Encoding($false)))
    & $cmd $nsi
    if($LASTEXITCODE -ne 0 -or -not(Test-Path -LiteralPath $setup)){Fail "NSIS no produjo Setup"}
    Write-Host "[OK] Setup: $setup" -ForegroundColor Green
  }
  Write-Host "[OK] Carpeta: $out" -ForegroundColor Green
  if(-not $SkipArchive){Write-Host "[OK] ZIP completo: $outZip" -ForegroundColor Green}
  Write-Host "Pendiente: prueba GUI real de apertura, sesion y catalogos en Windows." -ForegroundColor Yellow
}finally{
  $rootTmp=Split-Path -Parent $ext
  if(Test-Path -LiteralPath $rootTmp){Remove-Item -LiteralPath $rootTmp -Recurse -Force -ErrorAction SilentlyContinue}
}
