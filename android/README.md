# Optional Android Trusted Web Activity

This is a pinned packaging toolchain, not an APK release. The existing PWA remains the primary installation method. An Android package still needs a JDK, Android SDK, a protected signing key, domain association and a device test.

1. In this directory run `npm ci`.
2. Run `npm run init`. Use package ID `com.nikhiljadhav.lostandfound`, the current public HTTPS origin, and the existing manifest/icons. Keep the signing keystore outside Git. Never commit signing passwords.
3. Review and commit generated Gradle source, wrapper and `twa-manifest.json` after initialization. This captures the selected SDK and generated build configuration.
4. Run `npm run build` with the same protected signing key for subsequent releases.
5. Obtain the actual signing certificate SHA-256 fingerprint and publish Digital Asset Links at `/.well-known/assetlinks.json`, relating that package ID and certificate to the site. No placeholder association is published by this upgrade.
6. Test on an Android device. Verify domain association, account links, permissions and updates before distributing an APK.

No SDK, signing key, associated certificate or signed APK has been created or tested here. The dependency lock makes tool installation repeatable; a fully reproducible application build still requires step 3 and a stable signing setup. A TWA does not remove server sleep or create an iPhone app.

Primary guide: https://developer.chrome.com/docs/android/trusted-web-activity/quick-start
