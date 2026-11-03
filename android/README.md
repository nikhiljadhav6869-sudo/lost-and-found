# Android release

The Android launcher opens the public Lost & Found site as a Trusted Web Activity. The Gradle source and icons are checked in. The Android APK build workflow uses Java 17 and produces an unsigned APK for release signing.

1. Build in this directory using JDK 17 and Android SDK platform 36: `./gradlew :app:assembleRelease`. Alternatively download the unsigned APK artifact from the Android APK build workflow for the release commit.
2. On the signing computer run `./sign-release.ps1 -UnsignedApk <input.apk> -OutputApk <new-output.apk>` in PowerShell 7. Signing requires Android build tools 36.0.0 and the existing Windows user's protected release credentials under LocalAppData/LostFound/AndroidSigning. Keep this release key for all future updates.
3. Verify the public website serves the certificate association at `/.well-known/assetlinks.json` as JSON. Install the signed file on a test device and launch it. Check app links and the two-person return flow before broad distribution.
4. Increment versionCode and versionName in app/build.gradle and the matching values in twa-manifest.json for each update. Publish only the verified signed APK.

The package ID is `com.nikhiljadhav.lostandfound`. Website updates arrive from Render. iPhone installation uses the existing web app.

[Android Trusted Web Activity guide](https://developer.chrome.com/docs/android/trusted-web-activity/quick-start)
