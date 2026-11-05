# Verification report — 26 October 2026

Final local verification completed at 2026-10-26T08:47:03.569Z (26 October in India). All 12 groups in `node scripts/verify.mjs` passed. Tests use isolated temporary databases, synthetic accounts and local photo fixtures; they do not mutate production records or send mail to real inboxes.

| Check | Result | Duration |
| --- | --- | ---: |
| TypeScript | Passed | 8.862 s |
| Production build | Passed | 3.970 s |
| Workflows and persistence | Passed | 22.389 s |
| HTTP | Passed | 6.578 s |
| PWA privacy | Passed | 2.280 s |
| Upgrade safeguards | Passed | 7.366 s |
| Authentication recovery | Passed | 13.834 s |
| Storage transactions | Passed | 3.128 s |
| Intelligence and search | Passed | 10.184 s |
| Connection handling | Passed | 4.401 s |
| Backup storage | Passed | 2.589 s |
| Browser workflows | Passed | 82.423 s |

The runner writes machine-readable results to ignored `.sites-runtime/verification.json`. The workflow suite contains 21 functional groups, a fresh-process persistence check and six concurrency regressions. The intelligence suite includes ten groups, with deterministic vectors explicitly confined to test doubles. The separate benchmark below uses actual neural models.

## Browser and visual verification

Headless Microsoft Edge used a fresh isolated browser context and local production build. Four groups cover real/demo discovery, truthful unavailable-AI state, installation link/dialog behavior, a real synthetic signup, public-only draft restore, duplicate review, publication and offline indication. Width checks at 375, 390 and 768 pixels found no horizontal overflow; desktop used 1280 pixels. No uncaught page errors occurred. Mobile and desktop screenshots were inspected. These checks do not establish physical-phone installation or native prompt support.

Screenshots are generated under ignored `.sites-runtime/browser/`. CI installs Chromium and runs the same script. Browser tests are additive to the existing API tests for the full two-person claim/message/approval/return process; that entire process has not yet been automated through two physical phone interfaces.

## Real model and bundle measurements

A real Transformers.js CPU smoke benchmark with pinned q8 MiniLM and CLIP models completed successfully on this Windows computer:
- First combined inference with already downloaded weights: 949 ms.
- Three subsequent warm calls: 105 ms total.
- Resident process memory: approximately 661 MB.
- Earbuds paraphrase cosine: 0.660; unrelated scarf: 0.148.
- Repeating an identical synthetic photo: approximately 1.000.

Output: ignored `.sites-runtime/ai-benchmark.json`. These fixtures prove model execution and basic differentiation, not item-identification accuracy or probability calibration. Download duration is excluded from the first-inference figure.

Final portable browser build: main JavaScript 263.50 kB (81.56 kB gzip); stylesheet 133.41 kB (23.47 kB gzip). Smart search, notification preferences and admin operations are separate lazy chunks under 4 kB each. These are build measurements, not measured phone network load times.

## Failures corrected during implementation

- Windows native ONNX path loading failed; the worker now provides model bytes through a scoped file-backed cache. Actual inference subsequently passed.
- Match notification transaction revision handling initially suppressed expected alerts; the snapshot/revision guard was corrected and threshold, deduplication and both-owner tests passed.
- Stale inference and reports hidden mid-job no longer count as successful work; restored/reopened active reports requeue safely.
- Exhausted final worker leases now become terminal failures, release search capacity and reject query vectors from obsolete models. Oversized image headers are checked before full decode; database-only backups enforce the same 64 MB bound as photo archives.
- Invalid normalized calendar dates are rejected, case-insensitive colour search works, and demo browsing no longer mixes samples into real discovery.
- Optional draft storage excludes private evidence and photos; restoring a draft leaves private fields empty.
- Transient mail retries are bounded; permanent rejection and request errors are sanitized.

No test group failed in the final local run. An intermediate sandboxed run could not connect to localhost or launch Edge; rerunning with approved network/browser access passed. The separate image-header regression suite and isolated schema-generation check also passed. Expected negative-test messages from Better Auth/provider rejection are not suite failures. The application workflow tests use an isolated Playwright browser; the existing Render dashboard is checked separately through browser control.

## Live operations activation — 29 October 2026

The Windows worker was installed with protected credentials, verified through the live availability endpoint, and stopped/restarted with child-process cleanup confirmed. A temporary owner-scoped production search produced real 384-dimensional text and 512-dimensional image vectors in approximately 92 seconds including initialization; the test search was then removed. This is an integration check, not an accuracy or latency guarantee.

The [first production backup workflow](https://github.com/nikhiljadhav6869-sudo/lost-and-found/actions/runs/40755202045) passed encrypted upload, read-back, and an isolated restore of 22 tables and one photo. The private archive was independently confirmed in storage, and daily scheduling was enabled. [Activation details and limits](OPERATIONS-STATUS.md) document computer availability and schedule monitoring.

## Still requiring external validation

- Real Brevo inbox delivery/bounces after this release, especially the institutional domain. Provider acceptance is not delivery.
- Representative labelled item photos, matching accuracy, sustained worker performance, and recovery across extended outages.
- Android Chrome/installed PWA, iPhone Safari/home-screen app and a complete physical two-person return. See [PWA-AND-MOBILE.md](PWA-AND-MOBILE.md).
- Signed Android package/Digital Asset Links; Docker image execution; high-concurrency load; independent accessibility/security review.
- This upgrade's primary verified target is the portable Node deployment. The Cloudflare/Vinext deployment target was not rebuilt or deployed in this verification run.

Deployment/CI results after publication are recorded separately; passing local tests alone does not prove the live service has updated.

## Recovery, matching and accessibility — 4 November 2026

All 12 groups in `node scripts/verify.mjs` passed at 09:04 UTC, including the production build, authentication recovery, storage transactions, intelligence, backup restoration and browser workflows. Tests use isolated synthetic data. Password reset now explicitly checks that both independently established sessions are revoked, alongside the existing one-use/expired token, old-password rejection, redirect validation and bounded mail retry cases. No fresh messages were sent to real inboxes; Gmail and VIT delivery remains unconfirmed.

Automated axe-core 4.14 checks for WCAG 2 A/AA and 2.1 AA passed on the home page in both themes, login, registration, installation and report dialogs, and the mobile home layout. Muted text/footer contrast and modal keyboard focus were corrected. Tab containment, Escape and focus restoration passed. The two-account mobile claim/return browser flow also passed. Automated results do not establish full WCAG conformance or replace assistive-technology testing.

Generic reports remain discoverable but cannot generate a score above 75 without an item description, category, colour or brand. An integration test verifies no alert is created for these reports after inference; informative high-similarity reports retain the existing two-owner notification behavior. See [the matching evaluation](AI-MATCHING.md) for measured limitations.

## Follow-up verification — 5 November 2026

All 14 groups in `npm run verify` passed at 03:16 UTC, including the new service-monitor tests and complete WebKit browser workflows. Chromium and WebKit passed axe checks on report detail, private claim, conversation and returned states as well as previously covered screens. The WebKit account-trigger focus issue was fixed. Both production dependency audits reported zero known advisories.

The [fresh production email-failure scan](https://github.com/nikhiljadhav6869-sudo/lost-and-found/actions/runs/41960361151) passed. No new account email was sent and no real password was changed, respecting the automated-only email check preference. Provider logs were inaccessible because the browser session could not attach; actual Gmail/VIT arrival is unverified. The latest reviewed successful backup was [4 November's run](https://github.com/nikhiljadhav6869-sudo/lost-and-found/actions/runs/41793436520), within the new 36-hour limit; the schedule remained enabled. The stopped Windows AI worker was restarted.

The new [field evaluation tool](MATCHING-FIELD-TEST.md) was exercised using six invented reports: three lost queries and three found candidates, including an unmatched wallet and a lookalike backpack. It counted two genuine pairs and seven unrelated pairs, alerted on both genuine pairs and one unrelated pair, and ranked one of the two answerable queries first correctly. This tiny synthetic run validates the evaluation path, not real accuracy. No production weights or thresholds were changed. Consent-based field data remains required.

A separate reviewer can use [the review handoff](EXTERNAL-REVIEW.md). Independent review, actual inbox arrival and physical-device acceptance have not been marked complete.
