# Android app updates

The Android app checks the latest GitHub Release from the About page. A release is published when the Android workflow has the permanent signing secrets configured. Android still asks the user to confirm each APK installation.

## Create the permanent signing key once

Use Android Studio's Terminal (or a JDK terminal) and run:

```powershell
keytool -genkeypair -v -keystore sajra-release.jks -alias sajra -keyalg RSA -keysize 2048 -validity 10000
```

Choose and save the keystore password. Keep `sajra-release.jks` and its password in a safe private backup. Never commit the keystore to GitHub.

In PowerShell, copy the encoded keystore to the clipboard:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes(".\sajra-release.jks")) | Set-Clipboard
```

## Add GitHub Actions secrets

In the Sajra GitHub repository, open **Settings → Secrets and variables → Actions → New repository secret** and add:

- `SAJRA_RELEASE_KEYSTORE_BASE64`: paste the clipboard value
- `SAJRA_RELEASE_STORE_PASSWORD`: keystore password
- `SAJRA_RELEASE_KEY_ALIAS`: `sajra`
- `SAJRA_RELEASE_KEY_PASSWORD`: key password (often the same password)

The Android workflow will then build and publish a signed `Sajra.apk` release for each qualifying push to `main`. The About page updater can find that APK and launch Android's installer.

## First install with the permanent key

Earlier APKs built by GitHub Actions used temporary debug signing keys. Android cannot update those in place with the new permanent key. For the first permanent-key APK only, uninstall the old Sajra app, then install the APK from the GitHub Release. After that, updates use the permanent key and can install over the existing app. Supabase-synced family data remains in the account; back up any device-only data before uninstalling.
