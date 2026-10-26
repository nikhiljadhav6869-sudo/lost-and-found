# Improvement report — 26 October 2026

This upgrade extends the existing React, Node, Better Auth, Turso/libSQL and private Supabase application. It preserves the visual identity, accounts, reports, private claims and two-person return workflow. New migrations are additive. No production records were deleted or relabelled.

## Eight-problem status

| Original problem | Root cause | Implemented solution | Main files | Verification | Current status |
| --- | --- | --- | --- | --- | --- |
| Complicated installation | Browser and OS install permissions differ | Existing manifest/native prompt retained; install link, offline guide, status banner, accessible dialogs; pinned Android packaging toolchain | `components/InstallApp.tsx`, `components/ConnectionStatus.tsx`, `public/sw.js`, `android/` | Seven PWA checks and browser install-dialog checks; physical installation and signed APK not verified | Implemented but Not Fully Verified |
| Slow first opening | Sleeping free host, transient network failures, unnecessary client work | Bounded GET retry/timeout, clear offline/errors, liveness, indexes, aggregate queries, lazy tools, immutable hashed assets, portable Docker configuration | `lib/request.ts`, `local/server.mjs`, `components/LostFoundApp.tsx`, `drizzle/0004*`, `Dockerfile` | HTTP/request tests and production bundle measurements; free cold starts remain | Partially Implemented |
| Confusing verification | Delivery delays, institutional filters, unclear recovery | Resend cooldown, expiration/spam guidance, recoverable configuration loading, bounded transient-provider retries, safe event logs | `components/AccountAccess.tsx`, `lib/auth-email.ts`, `docs/AUTHENTICATION.md` | Auth expiration, reset, provider failure/retry tests; real inbox delivery after this upgrade remains unverified | Implemented but Not Fully Verified |
| Misleading match percentages | Internal ranking presented like certainty | Qualitative labels, factor explanations, old-alert display normalization, private evidence and mutual return confirmation | `lib/matching.ts`, `components/LostFoundApp.tsx`, API route | Threshold boundaries, legacy text, ownership/return and notification integration checks | Implemented and Tested |
| No photo recognition | Public-field matching only | Real pinned CLIP/MiniLM inference, versioned vectors, durable leases, bounded retry, multimodal ranking, owner-scoped semantic/photo search, feedback | `ai-worker/`, `lib/intelligence.ts`, `lib/ai-jobs.ts`, `components/SmartSearch.tsx` | Actual model smoke benchmark plus queue/privacy/race tests; no live worker or field accuracy study | Partially Implemented |
| Confusing demo records | Samples mixed into discovery | Real reports by default, explicit Explore Demo, labels/access restrictions, local-only sample reset preserving real records | API route, `components/LostFoundApp.tsx`, `lib/demo.ts`, `scripts/demo-reset.mjs` | API separation/reset tests and browser toggle | Implemented and Tested |
| Incomplete phone testing | No physical devices in this environment | Automated headless browser workflow and width checks, API two-person scenarios, executable real-device checklist | `tests/browser.mjs`, `tests/run.mjs`, `docs/PWA-AND-MOBILE.md` | Edge/Chromium automation at 375/390/768/1280 widths; actual Android/iPhone tests remain | Partially Implemented |
| Ongoing maintenance | Limited operational visibility and no active backup scheduler | Admin account/analytics/queue/events, bounded cleanup, encrypted private backup upload/readback/retention, gated daily GitHub workflow | `components/OperationsStatus.tsx`, `lib/operations.ts`, `local/backup-storage.mjs`, `.github/workflows/operations.yml` | Authorization, storage, encryption/restore and HTTP-contract tests; live backup bucket/secrets/schedule not provisioned | Partially Implemented |

## Additional improvements

Search supports colour alongside existing type/category/location/date/status filters. Optional tab-local drafts store only public fields, exclude private evidence/photos and expire after seven days. Duplicate review compares the owner's recent public report details before publication. Notification preferences affect match alerts independently of claim/return messages. Admin analytics separate real reports from samples and measure only returns with a recorded resolution timestamp.

AI runs outside the web server. The ordinary app continues working when the worker is unavailable and describes that state accurately. Models are not shipped to browsers; no private ownership evidence is used for inference or automatic training.

## Remaining external and validation work

- Provision a capable worker or run the prepared command on a trusted computer while it is awake. The measured worker used about 661 MB; it does not fit the existing 512 MB web instance.
- Configure the dedicated private backup bucket and repository secrets, perform a remote upload/restore drill, then enable the supplied schedule.
- Test actual Android/iPhone installation and the complete two-person process; a signed Android package needs SDK tools, a private signing key and a verified Digital Asset Links association.
- Validate matching on a labelled collection of real item photos, assess false positives, and load-test intended traffic. The small smoke benchmark establishes working inference, not accuracy.
- Verify provider inbox delivery/bounces and notification settings. Email retry is bounded in-process; a durable email queue and dedicated external alerts remain future work.
- Free hosting can still sleep and has quotas. No paid resources or artificial keep-alive requests were created.

See [test evidence](TEST-REPORT.md), [deployment upgrade](DEPLOYMENT-UPGRADE.md), [AI architecture](AI-MATCHING.md), [authentication](AUTHENTICATION.md), [mobile checklist](PWA-AND-MOBILE.md), [security](SECURITY.md) and [operations](MAINTENANCE.md). Source readiness, live deployment and physical-device acceptance are separate checkpoints.
