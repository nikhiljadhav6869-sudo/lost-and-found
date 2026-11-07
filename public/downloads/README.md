# Android download asset

`Lost-and-Found.apk` is the unchanged signed Android 1.0.0 test release (1,218,326 bytes), originally published as `android-v1.0.0`. Its SHA-256 was verified against the published release digest before inclusion. The adjacent `.sha256` file records the digest. No signing keys are included.

The portable server serves this file at `/download/android` as an attachment named `Lost-and-Found.apk`, without redirects or a GitHub page. GET and HEAD are supported. The file is included in the production build so downloads do not depend on a third-party request at runtime. The public static APK path uses the same download headers.

For an update, replace the APK with the next verified release signed with the existing key and update its checksum. Preserve the stable `/download/android` URL. Responses can be cached for one hour. Android still requires installation confirmation; device testing remains necessary. This endpoint runs on the same service as the app and shares its startup delay when free hosting is asleep.
