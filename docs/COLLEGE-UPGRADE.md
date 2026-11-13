# College platform upgrade

Status recorded on **13 November 2026**. Release `b920680` is deployed on Render from GitHub `main`. All 18 local verification groups passed, and the exact release passed GitHub verification, model and Windows-worker checks. The database has applied migrations `0000`–`0009`. Production backup/restore and cloud activation evidence are below. Physical-device and institutional pilot acceptance remain separate from automated verification.

## Architecture and preservation plan

The existing React UI uses the portable Node 24 server and shared API handlers, Better Auth sessions, Turso/libSQL through a D1-compatible adapter, and private Supabase photo storage. Local development uses isolated SQLite databases. Brevo handles account mail. CLIP/MiniLM run in a separate leased-job worker. Render deploys main; GitHub runs verification and encrypted backups. Android is a signed wrapper around the same HTTPS app.

Working features to preserve: public discovery, demo separation, private claims/messages, mutual return confirmation, image validation/compression, 15 MB originals, account-specific drafts, current location, dark mode, matching preferences, encrypted backups and direct APK downloads.

Changes are additive: photo suggestion jobs; workspace membership and scoped reports; storage/custody records and collection tokens; idempotent report creation; push delivery records. Existing reports remain in the public workspace. No existing account or report is automatically moved to a college, granted a role, or deleted. Every new table must join backup/restore coverage.

Implementation order: photo suggestions and matching explanations; college access and handover workflow; deployed job processing and notifications; language/voice/offline submission; responsive and security regression checks. The production branch will receive changes only after regression checks and migration/restore tests.

## Availability constraints

Free Render can sleep. A scheduled cloud job removes dependence on the personal computer but may start late and cannot guarantee sub-30-second AI suggestions. Reporting must stay usable while inference is unavailable. Continuous low-latency AI requires a suitably sized continuously running host; no paid plan is purchased by this upgrade. The reporting-time target and matching quality require real-user measurements.

## Release evidence

These results refer to local development, not production acceptance. Later edits still require a final consolidated run. This document is not a government-readiness certification, an accuracy guarantee, or a claim of zero defects.

| Check | Evidence / current status |
| --- | --- |
| TypeScript and portable build | Passed during implementation; final review edits require a rerun |
| Existing API workflows/persistence | Passed during implementation, including matching, claims and location behavior |
| `tests/college.mjs` | Passed: college isolation, roles, private photo-job ownership, custody, approved collection, expiry/guess limit/single use and audit, membership revocation |
| `tests/delivery.mjs` | Passed: simultaneous/repeated report receipts, changed-payload rejection, account-switch protection, no recreation after deletion, push retry/preferences/read suppression/expired-device cleanup |
| AI inference | Real pinned CLIP inference ran on the synthetic image fixture and returned uncertain item classification. This proves execution, not accuracy. API photo-result tests use an isolated inference stub |
| Push transport | Tests use an injected transport stub; no real-device push delivery has been established for this upgrade |
| Existing Chromium browser suite | Passed during implementation: authentication, installation UI, reports/options, mobile layout, themes, two-user matching/claims/returns, 15 MB boundary, draft recovery and location behavior |
| Backup/restore and PWA privacy | Passed during implementation with the additive tables; final release rerun remains required |
| New `tests/college-browser.mjs` | Chromium passed: college creation, desks, QR poster and location prefill, staff intake/approval/collection, offline photo/report reconnect, lost-response retry without duplicates, Hindi/Marathi accessibility and sign-out cleanup. Final consolidated rerun follows photo-cleanup hardening |
| New language/offline-failure/full staff UI acceptance | Automated Chromium checks passed; physical-phone and native-language user acceptance remain pending |
| Final WebKit, cloud worker, device push and live migration checks | Pending |

The verification runner and application CI include the new suites. Use `npm run test:college`, `npm run test:delivery`, `npm run test:college-browser` and `node tests/college-browser.mjs --webkit`; `npm run verify` runs the consolidated checks. Tests use isolated local data and strip remote/VAPID settings. Do not run tests with production credentials.

## Features and where to find them

| Area | Local implementation | User location |
| --- | --- | --- |
| Photo-first reports | Camera/gallery controls, compression, automatic private suggestion jobs, editable suggestions filling empty fields, manual fallback | **I found something** / **I lost something** |
| Matching | Ranked candidates, similarity explanations and differences, same-workspace comparisons, strong-match alert deduplication, private ownership claims | Report details → **Possible connections** |
| College spaces | Public/college selection; platform-created colleges; verified membership, rotating invitations, student/staff/admin roles; scoped reports, search and media | Signed-in workspace selector → **College workspace** |
| Campus desks | Staff-managed desks and storage, printable SVG QR posters, scanned links prefilling location for an authorised member | College dashboard → **Collection desks** |
| Staff collection | Recorded finder/receiving staff, private claim review, expiring approved-owner code, staff verification, return record and history | **Review private claim** → **Collect from college staff** |
| Cloud jobs | Bounded photo, embedding, search and push batches; leases/retries; optional GitHub schedule | Operator workflow **Cloud AI processing**; activation pending |
| Optional push | Browser subscriptions, generic private reminder, retries/preferences, read suppression, expired-device cleanup | Dashboard notifications → **Background notifications**; VAPID setup pending |
| Language/voice | English/Hindi/Marathi selector, translated major controls and many messages, optional browser speech with transcript review | Header language selector; reporting form voice section |
| Weak connections | Account-scoped IndexedDB photo/report queue; waiting/uploading/submitted/attention states; reconnect retry; duplicate-safe submission receipt | **Saved submissions**, while signed in |

The backend checks college membership and roles; hidden controls are not the access boundary. Similarity never establishes ownership. Staff must verify the private claim before collection. Codes expire after ten minutes, are single-use and lock after five incorrect attempts. A replacement invalidates the previous code. A staff member cannot approve their own claim or complete their own collection.

Authorised college staff may review private verification notes and conversations for an item in their custody. These are not published in discovery or used as public matching input. The interface must disclose staff access. Review the final permission tests before treating the controls as release-ready.

## Files and interfaces

Principal additions:

- `components/PhotoSuggestions.tsx`, `ai-worker/photo-suggestions.mjs`, `lib/photo-suggestions.ts`: private photo jobs and suggestion UI.
- `components/CollegeWorkspace.tsx`, `components/CollectionPanel.tsx`, `lib/workspaces.ts`: college roles, desks/posters, custody, collection and audit.
- `components/OfflineReports.tsx`, `lib/offline-reports.ts`: device photos and queued submissions.
- `components/LanguageSelector.tsx`, `components/VoiceEntry.tsx`, `lib/i18n.ts`: language dictionary and optional speech entry.
- `components/PushSettings.tsx`, `lib/push-subscriptions.ts`, `local/push.mjs`: subscriptions and durable delivery.
- `.github/workflows/ai-processing.yml`: optional cloud processing.
- `tests/college.mjs`, `tests/delivery.mjs`, `tests/college-browser.mjs`: new integration/browser checks.
- `drizzle/0006_photo_suggestions.sql` through `0009_push_notifications.sql`: additive schema changes.

Integration changes include `components/LostFoundApp.tsx`, `app/globals.css`, `app/api/[...path]/route.ts`, `lib/features.ts`, `lib/ai-jobs.ts`, `lib/matching.ts`, `lib/report-drafts.ts`, `lib/request.ts`, `db/schema.ts`, `local/storage.mjs`, `local/server.mjs`, `local/backup.mjs`, `public/sw.js`, `scripts/ai-worker.mjs`, `scripts/verify.mjs`, existing browser tests, application CI and package manifests. The release Git diff is the authoritative complete file list.

Authenticated API routes use the existing `/api/` prefix:

| Route | Purpose |
| --- | --- |
| `photo-suggestions`, `photo-suggestions/:id` | Request/read an owner-scoped analysis job |
| `workspaces`, `workspaces/join`, `workspaces/:id` | List/create/join colleges and read the permitted dashboard |
| `workspaces/:id/members`, `/invite`, `/desks` | College roles/invitations and desk management |
| `workspaces/:id/receive`, `/move` | Staff custody intake and storage movement |
| `collection/:claimId` | Read history, issue an approved-owner code, or verify collection as staff |
| `push` | Check configuration and register/remove the signed-in browser subscription |

Existing report and search routes accept workspace scope. Report creation supports a stable `submissionId`: a repeat by the same account with the same payload returns the original report ID; a changed payload using that receipt is rejected. Queued uploads/submissions send `X-Expected-User` to stop attribution to a different signed-in account.

## Database changes

| Migration | Changes |
| --- | --- |
| `0006_photo_suggestions.sql` | Owner-scoped photo jobs, deduplication and queue index |
| `0007_college_workspaces.sql` | Colleges, membership, workspace columns, desks, custody, hashed collection codes, handover audit and indexes |
| `0008_report_submissions.sql` | Account/submission receipt and payload hash; survives report deletion to prevent recreation on replay |
| `0009_push_notifications.sql` | Push preferences, subscriptions, delivery jobs, notification trigger and queue index |

Storage applies pending migrations at startup and records them in `local_migrations`. The worker also imports storage and can apply migrations: do not run the new worker against production before the release backup and migration plan are ready. Never edit an already deployed migration to fix a later release; add a migration.

Backups include the added tables and photo bytes. Restore requires the matching application/migration version and writes to a **new local directory**, not over a live database. Retain the application revision with each archive. The existing backup code stops above its 64 MB payload limit; larger deployments need a tested provider-export procedure. Recovery to production Turso/Supabase is an operator procedure, not an automatic rollback button.

## Configuration, secrets and costs

No new paid plan has been purchased or enabled. The upgrade reuses existing services. Free quotas and provider terms apply; no service is represented as lifetime-free or unlimited.

| Setting | Where / reason |
| --- | --- |
| `STORAGE_MODE=remote`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | Render and cloud worker: existing persistent database |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_STORAGE_BUCKET` | Render and cloud worker: private photos; the adapter also accepts legacy `SUPABASE_SERVICE_ROLE_KEY` |
| `BETTER_AUTH_SECRET`, `APP_ORIGIN` | Render: retain authentication secret and correct public HTTPS origin |
| `ADMIN_USER_IDS` | Render: existing platform administrator account IDs; college roles are database records |
| `BREVO_API_KEY`, `EMAIL_FROM`, `EMAIL_FROM_NAME` | Render: existing verified transactional sender and recovery mail |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | New optional push settings on Render; also cloud secrets if the worker sends push. Subject is an operator contact URL or `mailto:` URI |
| `CLOUD_AI_ENABLED=true` | GitHub repository **variable**, only after a successful manual production worker run |
| `OPERATIONS_ENABLED=true`, `BACKUP_BUCKET`, `BACKUP_PASSWORD` | Existing backup variable/secrets; preserve the separately stored recovery password |

Only the VAPID public key belongs in browser subscription setup. Keep all private keys, tokens, authentication secrets and backup passwords out of source, frontend bundles, logs and screenshots. Do not rotate existing credentials merely to deploy this upgrade.

Pinned CLIP/MiniLM models run through Transformers.js without a hosted per-inference API key. Model download/cold inference takes time and needs more memory than the web app's smallest free instance can comfortably provide. The separate workflow has a ten-minute job limit and a nominal five-minute schedule. Scheduling delays, runner limits and backlog can increase waiting time. No sub-30-second AI result or continuous availability is guaranteed.

## Deployment and operational evidence — 13 November 2026

- **Release:** Render confirmed `b920680` Live. [Exact-revision CI](https://github.com/nikhiljadhav6869-sudo/lost-and-found/actions/runs/43361481921) passed all three jobs. Local verification passed all 18 groups, including Chromium and WebKit mobile workflows, college isolation, custody/collection races, offline retry and push delivery controls.
- **Recovery:** Before rollout, the remote schema already included migrations 0006/0007, which explained the old backup code's restore mismatch. A matching-schema encrypted archive was created, read back from private storage and restored successfully: 29 tables and two photos. Recovery code and archive remain protected outside Git.
- **Post-upgrade backup:** The [scheduled run](https://github.com/nikhiljadhav6869-sudo/lost-and-found/actions/runs/43391266889) and [manual confirmation](https://github.com/nikhiljadhav6869-sudo/lost-and-found/actions/runs/43398674783) both restored **32 tables and two photos**. `OPERATIONS_ENABLED=true` remains enabled, targeting 07:00 India time with 14-day retention and the newest two archives retained. GitHub may delay schedules.
- **Cloud processing:** The [initial production run](https://github.com/nikhiljadhav6869-sudo/lost-and-found/actions/runs/43398671052) passed with an empty queue. `CLOUD_AI_ENABLED=true` is now enabled. A second manual run verified real photo suggestions and image/text inference. The workflow is active and scheduling is enabled; the first scheduler-triggered AI run has not yet been observed. See [operations status](OPERATIONS-STATUS.md). The legacy Windows task stays disabled; the cloud workflow does not need this computer to remain on.
- **Preservation:** All pre-upgrade identities for three accounts, 13 reports, two claims, four messages and two uploads remain present. Both stored photo bytes match the pre-upgrade backup hashes. Public discovery loaded successfully after deployment.
- **Push:** Matching VAPID settings were stored in Render and GitHub encrypted secrets. Delivery queue/transport/security checks passed automatically. Real opted-in phone delivery is still an acceptance check; configuration alone does not prove receipt.
- **Distribution:** The live [installation page](https://lost-and-found-yzfl.onrender.com/downloads/install.html) includes Android, iPhone and QR instructions. The live QR decoded to `https://lost-and-found-yzfl.onrender.com/?install=1`. The direct Android response returned an attachment without a redirect and matched the release SHA-256; size 1,218,326 bytes. iPhone installation remains a Safari Home Screen web app.

For subsequent releases, create a matching-schema backup before migrations, deploy the tested revision, verify live health and permissions, then run cloud processing and a post-upgrade restore check. Do not restart the obsolete PC worker against the new schema.

## Known limitations and acceptance checklist

- Free Render can sleep; the installed app still depends on the hosted service. This upgrade cannot remove its cold-start delay or promise uptime.
- Photo analysis uses a fixed item/colour/pattern vocabulary and can abstain. It does not read serial numbers or identify arbitrary objects reliably. Suggestions require review. No new accuracy percentage or measured reporting-time result is established.
- Matching is a shortlist for human verification. Short descriptions, poor photos and generic items need real-campus evaluation and threshold tuning.
- The offline queue works after the app loads and while it is open and signed in. It does not promise a fully usable fresh offline launch or closed-app uploads. Signing out removes local submissions/photos. Browsers may evict storage; storage limits/retention need physical-device checks.
- Major controls and many messages support Hindi/Marathi, while some explanatory/dynamic/operator text can fall back to English. User reports/evidence are not translated automatically. Native-speaker review remains necessary. Voice support varies by browser and may send audio to its speech provider.
- Colleges need a verified administrator and a staff process. Invitations alone do not prove student affiliation. QR posters do not bypass membership. Membership removal and institutional account-lifecycle procedures must be agreed.
- Push is configured, but permission prompts, OS restrictions and actual delivery still need physical-device testing before claiming receipt.
- Automated checks do not establish physical phone camera/microphone/location/installation behavior, real mail receipt, app-store approval, government compliance or independent security/accessibility certification.

Before a real college pilot:

- [x] Final local and CI checks pass on the intended release revision. (Automated verification.)
- [x] College isolation covers reports/photos/search/claims and revoked members. (Automated verification.)
- [x] Custody and return history identify staff/recipient; expired/guessed/replayed codes fail; staff cannot approve or collect their own claim. (Automated verification.)
- [x] Private evidence stays protected; staff verification and audits work through the UI. (Automated verification.)
- [ ] Camera/gallery, 15 MB originals, permission denial, drafts, interrupted uploads, lost acknowledgements and sign-out cleanup work on target phones.
- [ ] Hindi/Marathi controls fit narrow screens and are understandable; voice failure leaves typing usable.
- [x] Cloud AI processed real models on a GitHub runner with the PC worker disabled. Manual reporting remains available. First scheduler-triggered AI execution remains to be observed.
- [ ] Real mail and opted-in push reach test users; preferences and disabled-device behavior work.
- [x] Production data survives migration; a post-upgrade encrypted backup restores with matching code. (Automated verification.)
- [ ] Operators agree privacy/consent/retention, staff access, abuse handling, incidents and recovery procedures.
