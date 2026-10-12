# Photon Android

Photon uses the existing hosted dashboard and existing ChatGPT account. Android 10 or later and an updated Chrome installation are required. Dashboard calculations and history remain on the existing server; provider credentials are never packaged into the APK.

## Install and update

Copy `outputs/android/Photon-1.0.1.apk` to your phone, open it, and allow installation from that file manager when Android asks. Open Photon while connected and sign in with the dashboard owner's ChatGPT account. Other accounts cannot read dashboard pages or data. Chrome handles sign-in and Android Back navigation. External sign-in pages can show Chrome's toolbar. Version 1.0.1 fixes the missing site-settings activity that prevented 1.0.0 from opening; use 1.0.1 for installation.

Install later APKs over the existing installation. Do not uninstall first: upgrades require the same package name and signing key. Increment `versionCode` and `versionName` in `android/app/build.gradle` for each new release. Web interface updates do not require an APK update unless Android packaging changes.

## Offline reports

Open the required screens and report periods online first. Successful viewed reports are stored privately for up to 30 days; revisiting a report replaces its saved copy. Close Photon and reopen with airplane mode enabled to check offline access. The banner shows the saved timestamp in Asia/Karachi. An unviewed period is unavailable. Commands and settings changes are disabled and are never queued. Sign-out and account changes delete private copies; signing out while offline still clears the copies locally, but the hosted sign-out needs a connection. Android/Chrome can evict browser storage, so this is convenience access rather than a backup.

## Notifications

Open system settings → Notifications. Enable notifications on this phone, grant permission, then enable the individual rules you want. Rules start disabled. Battery defaults to your reserve setting; stale solar readings default to 15 minutes. Device choices and sensor conditions come from reported capabilities. Recovery notices rearm threshold/offline rules. Switch and sensor changes compare successive observations; events entirely between samples cannot be detected. Denying notification permission leaves the dashboard usable.

The authenticated `POST /api/mobile/collect` endpoint attempts both existing providers and evaluates alerts even after collection failures. A five-minute scheduler must call it with a server-side collection secret. The Sites scheduler only permits hourly runs, so follow [cron-job.org setup](cron-job-setup.md) to activate the prepared five-minute schedule. The evaluator uses persistent state, a lease and a durable delivery queue. Transient delivery failures retry, and expired push subscriptions are removed. The settings panel exposes collection/evaluation health. Notification taps open the solar or relevant device screen.

## Signing key and rebuilding

The retained signing material is outside this repository at `../.photon-signing/photon.jks` and `../.photon-signing/photon.json`. Keep a private backup of both. Losing the key prevents upgrades of installed copies. Neither is included in source or deployment archives. The certificate fingerprint is published in `public/.well-known/assetlinks.json`.

This Windows checkout has JDK 17, Gradle 8.13 and Android SDK 36 in the ignored `.sites-runtime/android-tools` directory. From the repository root, run:

```powershell
pwsh -File scripts/build-android.ps1
```

The script builds and checks the release, copies the APK to `outputs/android`, and verifies its signature. On another machine, install those official tools in the same directory structure (`jdk`, `gradle-8.13`, `sdk`), install SDK `platforms;android-36`, `build-tools;36.0.0`, and `platform-tools`, and restore the retained signing files before building. Gradle wrapper files are also committed. The script's temporary-directory override is process-local and addresses Java local sockets on this Windows machine.

For web changes run `npm test`, `npm run lint`, and `npx tsc --noEmit`, then use the normal Sites publishing workflow. The build produces the offline asset manifest. Keep VAPID signing keys, collection secrets and provider credentials in server environment secrets. Apply the additive notification migration alongside the deployment; preserve the existing database.

## Release checks

Automated coverage includes existing energy/billing calculations, account authorization, rule transitions and recovery, duplicate suppression, encrypted push delivery, retries and expired subscriptions, offline account isolation, expiration and deletion, and refusal to queue writes. The built local preview was tested with real saved reports after stopping its server.

Before considering the device acceptance checklist complete, test a physical Android 10 phone and a current Android phone: owner sign-in and expiry, sign-out, reopen, Back, signed upgrade, all report periods, offline restart, permission denial, background push and deep links. Do not issue commands to household equipment merely to test installation; use a deliberately selected test device.
