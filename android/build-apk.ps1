param(
  [switch]$DebugBuild,
  [switch]$Install
)

$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Dist = Join-Path $ProjectRoot 'dist'
$AssetsRoot = Join-Path $PSScriptRoot 'assets'
$AssetsWww = Join-Path $AssetsRoot 'www'
$Build = Join-Path $PSScriptRoot 'build'
$OutApk = Join-Path $ProjectRoot ($(if ($DebugBuild) { 'Attendance-debug.apk' } else { 'Attendance.apk' }))

$ManifestPath = Join-Path $PSScriptRoot 'AndroidManifest.xml'
$ManifestText = Get-Content $ManifestPath -Raw
if ($ManifestText -match 'android:versionCode="(\d+)"') {
  $VersionCode = [int]$Matches[1]
} else {
  throw 'versionCode not found in AndroidManifest.xml'
}
if ($ManifestText -match 'android:versionName="([^"]+)"') {
  $VersionName = $Matches[1]
} else {
  throw 'versionName not found in AndroidManifest.xml'
}

if (-not (Test-Path (Join-Path $Dist 'index.html'))) {
  Write-Host 'dist not found, running npm run build...'
  Push-Location $ProjectRoot
  npm run build
  Pop-Location
}

if (-not $env:JAVA_HOME) {
  $env:JAVA_HOME = 'C:\Users\NeTLA\android-tools\jdk\jdk-17.0.20.1+1'
}
if (-not $env:ANDROID_HOME) {
  $env:ANDROID_HOME = 'C:\Users\NeTLA\android-tools\sdk'
}

$JdkBin = Join-Path $env:JAVA_HOME 'bin'
$BuildTools = Join-Path $env:ANDROID_HOME 'build-tools\35.0.0'
$PlatformJar = Join-Path $env:ANDROID_HOME 'platforms\android-35\android.jar'
$env:Path = "$JdkBin;$BuildTools;$env:Path"

foreach ($tool in @(
  (Join-Path $JdkBin 'java.exe'),
  (Join-Path $JdkBin 'javac.exe'),
  (Join-Path $JdkBin 'jar.exe'),
  (Join-Path $JdkBin 'keytool.exe'),
  (Join-Path $BuildTools 'aapt2.exe'),
  (Join-Path $BuildTools 'd8.bat'),
  (Join-Path $BuildTools 'zipalign.exe'),
  (Join-Path $BuildTools 'apksigner.bat')
)) {
  if (-not (Test-Path $tool)) { throw "Tool not found: $tool" }
}
if (-not (Test-Path $PlatformJar)) { throw "android.jar not found: $PlatformJar" }

Write-Host 'Preparing assets...'
if (Test-Path $AssetsRoot) { Remove-Item $AssetsRoot -Recurse -Force }
New-Item -ItemType Directory -Force -Path $AssetsWww | Out-Null
Copy-Item (Join-Path $Dist '*') $AssetsWww -Recurse -Force

Write-Host 'Preparing build directory...'
if (Test-Path $Build) { Remove-Item $Build -Recurse -Force }
New-Item -ItemType Directory -Force -Path $Build | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $Build 'gen') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $Build 'classes') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $Build 'dex') | Out-Null

Write-Host 'Compiling resources...'
& (Join-Path $BuildTools 'aapt2.exe') compile --dir (Join-Path $PSScriptRoot 'res') -o (Join-Path $Build 'res.zip')
if ($LASTEXITCODE -ne 0) { throw 'aapt2 compile failed' }

Write-Host 'Linking resources...'
$linkArgs = @(
  'link',
  '-o', (Join-Path $Build 'base.apk'),
  '-I', $PlatformJar,
  '--manifest', (Join-Path $PSScriptRoot 'AndroidManifest.xml'),
  '-R', (Join-Path $Build 'res.zip'),
  '--java', (Join-Path $Build 'gen'),
  '--min-sdk-version', '24',
  '--target-sdk-version', '34',
  '--version-code', "$VersionCode",
  '--version-name', "$VersionName",
  '--auto-add-overlay'
)
if ($DebugBuild) { $linkArgs += '--debug-mode' }
& (Join-Path $BuildTools 'aapt2.exe') @linkArgs
if ($LASTEXITCODE -ne 0) { throw 'aapt2 link failed' }

Write-Host 'Compiling Java...'
$sources = @((Join-Path $Build 'gen\ru\netla\attendance\R.java'))
$sources += Get-ChildItem (Join-Path $PSScriptRoot 'src') -Recurse -Filter *.java | ForEach-Object { $_.FullName }
& (Join-Path $JdkBin 'javac.exe') -encoding UTF-8 -source 8 -target 8 -classpath $PlatformJar -d (Join-Path $Build 'classes') @sources
if ($LASTEXITCODE -ne 0) { throw 'javac failed' }

Write-Host 'Dexing...'
& (Join-Path $JdkBin 'jar.exe') cf (Join-Path $Build 'classes.jar') -C (Join-Path $Build 'classes') .
if ($LASTEXITCODE -ne 0) { throw 'jar classes failed' }
& (Join-Path $BuildTools 'd8.bat') --lib $PlatformJar --min-api 24 --output (Join-Path $Build 'dex') (Join-Path $Build 'classes.jar')
if ($LASTEXITCODE -ne 0) { throw 'd8 failed' }

Write-Host 'Packaging...'
& (Join-Path $JdkBin 'jar.exe') uf (Join-Path $Build 'base.apk') -C (Join-Path $Build 'dex') classes.dex
if ($LASTEXITCODE -ne 0) { throw 'jar failed' }

Write-Host 'Adding web assets...'
& (Join-Path $JdkBin 'jar.exe') uf (Join-Path $Build 'base.apk') -C $PSScriptRoot assets
if ($LASTEXITCODE -ne 0) { throw 'jar assets failed' }

Write-Host 'Aligning...'
& (Join-Path $BuildTools 'zipalign.exe') -f -p 4 (Join-Path $Build 'base.apk') (Join-Path $Build 'aligned.apk')
if ($LASTEXITCODE -ne 0) { throw 'zipalign failed' }

$KeystoreDir = Join-Path $PSScriptRoot 'keystore'
$Keystore = Join-Path $KeystoreDir 'attendance.jks'
if (-not (Test-Path $Keystore)) {
  Write-Host 'Creating keystore...'
  New-Item -ItemType Directory -Force -Path $KeystoreDir | Out-Null
  & (Join-Path $JdkBin 'keytool.exe') -genkeypair -v `
    -keystore $Keystore `
    -alias attendance `
    -keyalg RSA `
    -keysize 2048 `
    -validity 10000 `
    -storepass attendance `
    -keypass attendance `
    -dname 'CN=Attendance App, OU=Local, O=NeTLA, L=Local, ST=Local, C=RU'
  if ($LASTEXITCODE -ne 0) { throw 'keytool failed' }
}

Write-Host 'Signing...'
& (Join-Path $BuildTools 'apksigner.bat') sign `
  --ks $Keystore `
  --ks-key-alias attendance `
  --ks-pass pass:attendance `
  --key-pass pass:attendance `
  --out $OutApk (Join-Path $Build 'aligned.apk')
if ($LASTEXITCODE -ne 0) { throw 'apksigner sign failed' }

Write-Host 'Verifying...'
& (Join-Path $BuildTools 'apksigner.bat') verify --verbose $OutApk
if ($LASTEXITCODE -ne 0) { throw 'apksigner verify failed' }

$apk = Get-Item $OutApk
Write-Host ''
Write-Host ("APK: {0} ({1:N1} MB)" -f $apk.FullName, ($apk.Length / 1MB))

if (-not $DebugBuild) {
  Write-Host 'Preparing OTA release folder...'
  $Release = Join-Path $ProjectRoot 'release'
  New-Item -ItemType Directory -Force -Path $Release | Out-Null
  $VersionedApk = Join-Path $Release ("Attendance-{0}.apk" -f $VersionName)
  Copy-Item $OutApk $VersionedApk -Force
  Copy-Item $OutApk (Join-Path $Release 'Attendance.apk') -Force

  $Hash = (Get-FileHash $VersionedApk -Algorithm SHA256).Hash.ToLowerInvariant()
  $Size = (Get-Item $VersionedApk).Length
  $NotesPath = Join-Path $PSScriptRoot 'update-notes.txt'
  if (Test-Path $NotesPath) {
    $Notes = (Get-Content $NotesPath -Raw -Encoding UTF8).Trim()
  } else {
    $Notes = 'Исправления и улучшения.'
  }

  $UpdateManifest = [ordered]@{
    versionName = $VersionName
    versionCode = $VersionCode
    apkUrl = ("Attendance-{0}.apk" -f $VersionName)
    sha256 = $Hash
    size = $Size
    notes = $Notes
    publishedAt = (Get-Date).ToString('yyyy-MM-dd')
  }
  $Json = $UpdateManifest | ConvertTo-Json
  $UpdateJson = Join-Path $Release 'update.json'
  [System.IO.File]::WriteAllText($UpdateJson, $Json, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host ("OTA: {0}" -f $UpdateJson)
  Write-Host ("SHA-256: {0}" -f $Hash)

  # GitHub Pages раздаёт папку docs/; кладём туда только текущий релиз.
  Write-Host 'Preparing GitHub Pages folder...'
  $Docs = Join-Path $ProjectRoot 'docs'
  New-Item -ItemType Directory -Force -Path $Docs | Out-Null
  Get-ChildItem $Docs -Filter 'Attendance-*.apk' -ErrorAction SilentlyContinue | Remove-Item -Force
  Copy-Item $VersionedApk $Docs -Force
  Copy-Item $UpdateJson $Docs -Force
  Write-Host ("Pages: {0}" -f $Docs)
}

if ($Install) {
  $adb = (Get-Command adb -ErrorAction SilentlyContinue).Source
  if (-not $adb) {
    $candidate = 'C:\Users\NeTLA\platform-tools\adb.exe'
    if (Test-Path $candidate) { $adb = $candidate }
  }
  if (-not $adb) { throw 'adb not found' }
  Write-Host 'Installing to connected device...'
  & $adb install -r $OutApk
  if ($LASTEXITCODE -ne 0) { throw 'adb install failed' }
}
