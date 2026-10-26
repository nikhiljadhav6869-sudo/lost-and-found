# Installation and mobile verification

Share [the installation link](https://lost-and-found-yzfl.onrender.com/?install=1). Supporting browsers expose a native installation prompt after the user clicks Install App. Other browsers get Android Chrome/iPhone Safari instructions. Windows Chrome/Edge installation uses the browser menu/address-bar option. Installed standalone sessions hide the banner.

A website cannot silently install itself. Browser policy, OS version and user settings determine whether a native prompt appears. There is no released APK or App Store package. See [optional Android packaging](../android/README.md).

The manifest has standalone display, local correctly sized normal/maskable icons, a stable application ID and root scope. Service-worker registration uses normal update activation; an active form is not forcibly refreshed. Cache v2 stores only the static reconnect/safe-return guide. No account, report, photo, message, API response or live personalized page is cached. An offline indicator tells users to keep unsent forms open. Public draft persistence is optional and restricted to the current browser tab; private evidence/photos are excluded.

## Physical device checklist — unverified in this upgrade

Record device, OS, browser, build commit, date, and pass/fail evidence for each row:

| Device | Browser launch | Installation | Standalone reopen | Camera/file upload | Deep links | Keyboard/layout | Offline/reconnect |
|---|---|---|---|---|---|---|---|
| Android Chrome | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Android installed PWA | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| iPhone Safari | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| iPhone Home Screen | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Windows Chrome | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Windows Edge | Local automated web UI checked | Native installation pending | Pending | API/browser fixtures checked | Install link checked | 375/390/768/1280 widths checked | Indicator checked |

Use two separate accounts: A reports lost, B reports found with photos; wait for embeddings; verify both eligible accounts receive one notification. Review private evidence, send messages both ways, approve once, confirm on A only (must remain Return Arranged), then on B (must become Returned). Check that an outsider cannot read the conversation and that public sharing requires both consents.

Also test wrong credentials, expired mail links, missing uploads, slow/offline network during publication, repeated taps, interrupted confirmation, rejected AI suggestions, duplicate review, screen-reader labels and keyboard-only navigation. Check before retrying any ambiguous timed-out submission. Automated responsive browser checks do not replace real phones or native install tests.
