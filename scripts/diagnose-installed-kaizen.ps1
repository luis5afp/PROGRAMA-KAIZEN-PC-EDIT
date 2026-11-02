# Diagnostico offline de instalacion, sin ejecutar ni alterar extensiones.
# Uso: powershell -ExecutionPolicy Bypass -File scripts/diagnose-installed-kaizen.ps1 -ProgramFolder "C:\ruta\KAIZEN-PC-v1.5.24-win32-x64"
param([Parameter(Mandatory=$true)][string]$ProgramFolder)
$ErrorActionPreference='Stop'
$root=(Resolve-Path -LiteralPath $ProgramFolder).Path
if (Test-Path -LiteralPath $root -PathType Leaf) { $root=Split-Path -Parent $root }
$res=Join-Path $root 'resources'
$expected=@{
  'ex1/backgroundScript.js'='e7d0c09413ede5ad7884f4a9c4c0f0b1e0210a57d213841e8304338b536f7668'
  'ex1/contentScript.js'='f718478d6c02a1c21903c7dc3ca4d5fb8edc9699a389daf81f11b354121c1ce9'
  'ex1/manifest.json'='7c80f5e06eb8e43ba4c39211d2e76ccdc8d416082b90df06e84a1f478faa2460'
  'ex2/backgroundScript.js'='5eda8ba92e93d3adf33e08b8a319c4ac979c0144d2db945fb0c1072a9fcedb46'
  'ex2/contentScript.js'='34338eee92650b35b18c6607ea7b05cc2f418fbe15fbddb1ba05a926d30e2f67'
  'ex2/manifest.json'='aeaedc9c0b22ef3166e328747510c2413fc9351c2a625003a2d12c413d39bf58'
}
$errors=0
Write-Host "Verificando instalacion KAIZEN: $root"
foreach($file in ($expected.Keys | Sort-Object)){
  $target=Join-Path (Join-Path $res 'extensionForSecurity') $file
  if(!(Test-Path -LiteralPath $target -PathType Leaf)){
    Write-Host "[FALTA] $file" -ForegroundColor Red
    $errors++;continue
  }
  $actual=(Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
  if($actual -ne $expected[$file]){
    Write-Host "[NO COINCIDE] $file" -ForegroundColor Red
    $errors++
  }else{Write-Host "[OK] $file" -ForegroundColor Green}
}
foreach($folder in @('KAIZZEN_MAIN','KAIZZEN_GOOGLE','KAIZZEN_CUSTOM')){
  $file=Join-Path $res "KAIZEN_EXTENSIONS/$folder/manifest.json"
  if(Test-Path -LiteralPath $file -PathType Leaf){
    Write-Host "[OK] Perfil integrado $folder" -ForegroundColor Green
  }else{
    Write-Host "[FALTA] Perfil integrado $folder" -ForegroundColor Red
    $errors++
  }
}
foreach($relative in @('resources/app.asar','KAIZEN_CHROMIUM/chrome-win64/chrome.exe')){
  if(Test-Path -LiteralPath (Join-Path $root $relative) -PathType Leaf){
    Write-Host "[OK] $relative" -ForegroundColor Green
  }else{
    Write-Host "[FALTA] $relative" -ForegroundColor Red
    $errors++
  }
}
if($errors -eq 0){Write-Host "PASS: ubicaciones y hashes de instalacion correctos. No garantiza inicio de sesion o apertura real de Chromium." -ForegroundColor Green}
else{Write-Host "FAIL: $errors problemas. Reinstale el Setup COMPLETO sin copiar solo el EXE." -ForegroundColor Red}
if($errors){exit 1}
