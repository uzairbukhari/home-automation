param([switch]$PrepareOnly)
$ErrorActionPreference='Stop'
$taskProjectRoot=Split-Path $PSScriptRoot -Parent
$taskToolsRoot=Join-Path $taskProjectRoot '.sites-runtime/android-tools'
$env:JAVA_HOME=Join-Path $taskToolsRoot 'jdk'
$env:ANDROID_HOME=Join-Path $taskToolsRoot 'sdk'
$env:GRADLE_USER_HOME=Join-Path $taskProjectRoot '.sites-runtime/gradle-cache'
$taskTempRoot=Join-Path (Split-Path $taskProjectRoot -Parent) '.photon-tmp'
New-Item -ItemType Directory -Force $taskTempRoot | Out-Null
# Java's AF_UNIX pipe cannot connect through this machine's inherited short-name TEMP.
# Keep the override process-local; do not change Windows settings.
$env:TEMP=$taskTempRoot
$env:TMP=$taskTempRoot
$env:JAVA_TOOL_OPTIONS='-Djdk.net.unixdomain.tmpdir='+$taskTempRoot
$taskSigningRoot=Join-Path (Split-Path $taskProjectRoot -Parent) '.photon-signing'
New-Item -ItemType Directory -Force $taskSigningRoot | Out-Null
$taskSigningConfig=Join-Path $taskSigningRoot 'photon.json'
if(-not(Test-Path $taskSigningConfig)){
  $taskPasswordBytes=New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Fill($taskPasswordBytes)
  @{password=[Convert]::ToBase64String($taskPasswordBytes)} | ConvertTo-Json | Set-Content -LiteralPath $taskSigningConfig
}
$env:PHOTON_STORE_PASSWORD=(Get-Content -LiteralPath $taskSigningConfig -Raw | ConvertFrom-Json).password
$env:PHOTON_KEYSTORE=Join-Path $taskSigningRoot 'photon.jks'
if(-not(Test-Path $env:PHOTON_KEYSTORE)){
  & (Join-Path $env:JAVA_HOME 'bin/keytool.exe') -genkeypair -keystore $env:PHOTON_KEYSTORE -storepass:env PHOTON_STORE_PASSWORD -keypass:env PHOTON_STORE_PASSWORD -alias photon -keyalg RSA -keysize 2048 -validity 10000 -dname 'CN=Photon Energy Home'
  if($LASTEXITCODE -ne 0){throw 'Signing key creation failed'}
}
$taskCertificate=Join-Path $taskSigningRoot 'photon.der'
& (Join-Path $env:JAVA_HOME 'bin/keytool.exe') -exportcert -keystore $env:PHOTON_KEYSTORE -storepass:env PHOTON_STORE_PASSWORD -alias photon -file $taskCertificate
if($LASTEXITCODE -ne 0){throw 'Signing certificate export failed'}
$taskHash=(Get-FileHash -LiteralPath $taskCertificate -Algorithm SHA256).Hash
$taskFingerprint=($taskHash -split '(.{2})' | Where-Object {$_}) -join ':'
$taskAssetLinks=@(@{relation=@('delegate_permission/common.handle_all_urls');target=@{namespace='android_app';package_name='com.photon.energyhome';sha256_cert_fingerprints=@($taskFingerprint)}})
$taskWellKnown=Join-Path $taskProjectRoot 'public/.well-known'
New-Item -ItemType Directory -Force $taskWellKnown | Out-Null
ConvertTo-Json -InputObject $taskAssetLinks -Depth 6 | Set-Content -LiteralPath (Join-Path $taskWellKnown 'assetlinks.json')
Write-Output ('Android signing certificate: '+$taskFingerprint)
if($PrepareOnly){exit 0}
$taskAndroidRoot=Join-Path $taskProjectRoot 'android'
Set-Location $taskAndroidRoot
& (Join-Path $taskToolsRoot 'gradle-8.13/bin/gradle.bat') wrapper --gradle-version 8.13 --distribution-type bin
if($LASTEXITCODE -ne 0){throw 'Gradle wrapper setup failed'}
& (Join-Path $taskToolsRoot 'gradle-8.13/bin/gradle.bat') :app:assembleRelease :app:lintRelease
if($LASTEXITCODE -ne 0){throw 'Android release build failed'}
$taskOutput=Join-Path $taskProjectRoot 'outputs/android'
New-Item -ItemType Directory -Force $taskOutput | Out-Null
$taskVersionText=Get-Content -LiteralPath (Join-Path $taskAndroidRoot 'app/build.gradle') -Raw
if($taskVersionText -notmatch "versionName '([^']+)'"){throw 'Android version name missing'}
$taskApk=Join-Path $taskOutput ('Photon-'+$Matches[1]+'.apk')
Copy-Item -LiteralPath (Join-Path $taskAndroidRoot 'app/build/outputs/apk/release/app-release.apk') -Destination $taskApk
& (Join-Path $env:ANDROID_HOME 'build-tools/36.0.0/apksigner.bat') verify --verbose --print-certs $taskApk
if($LASTEXITCODE -ne 0){throw 'APK signature verification failed'}
Write-Output ('Release APK: '+$taskApk)
