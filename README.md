# Lost & Found

A full-stack community lost-and-found application, with a responsive teal/navy/coral interface, persistent SQLite records and images, private ownership claims, explainable matches, and mutually confirmed returns.

**[Open the public app](https://lost-and-found-yzfl.onrender.com/)**. Create an account and verify your email to report an item or contact its finder. On a phone, use the app's **Install app** instructions to add it to your home screen. An internet connection is required.

Scan this QR code to open the public app. It opens the website; installation is a separate choice in your phone's browser.

![QR code for the public Lost & Found app](public/app-qr.png)

## Production setup update

The public deployment uses Render with an external Turso database, private Supabase photos and Brevo account email. See [DEPLOYMENT.md](DEPLOYMENT.md) to configure your own deployment, administrator access, encrypted backups and cleanup. [COMPLETION.md](COMPLETION.md) records which checks have actually passed and which still require testing on real devices.

## Run locally

Use **Node.js 24 or later** and npm. From this directory:

```sh
npm ci
npm run setup:env
npm run build:local
npm start
```

Open **http://127.0.0.1:3000**. Register through **Sign in → Create an account**. No API keys or paid services are required. The first start applies migrations and loads nine clearly labelled demonstration reports. Demo listings cannot receive claims and are excluded from real community statistics. Create accounts in separate browser profiles to demonstrate a finder and claimant.

The portable runner uses Node's built-in SQLite engine. It runs the **same API handlers, authentication, matching and React components** as the hosted Cloudflare build. This runner was added because the Cloudflare Workers emulator crashed in the provided Windows environment.

### Work in VS Code

Open this folder with **File → Open Folder**. Install Node.js 24+ and Git if they are not already available, then run `npm ci` in **Terminal → New Terminal** for a fresh clone.

Use **Terminal → Run Task → Lost & Found: Start local** to set up the local environment, build, and start the app. Open **http://127.0.0.1:3000** after the server starts. Stop the task with Ctrl+C before rebuilding or restarting. The task menu also includes Build local, Test, and Typecheck; Ctrl+Shift+B runs the local build.

The **Source Control** view shows changes and commits. Local configuration (`.dev.vars`), databases, uploaded images, dependencies, and build output are excluded from Git. Each new checkout generates its own local authentication secret with the setup task.

### Useful commands

```sh
npm run typecheck       # TypeScript validation
npm test                # Real handlers + SQLite + image storage integration tests
npm run test:http       # Real HTTP server checks; requires local socket access
npm run test:pwa        # Installation assets and offline privacy behavior
npm run build:local     # Browser bundle and portable Node API server
npm start               # Start the portable production build
npm run build           # Build the Cloudflare/Vinext deployment
npm run db:generate     # Generate an append-only Drizzle migration after schema changes
npm run seed            # Regenerate bundled sample illustrations and seed data
```

The ordinary Cloudflare development command remains `npm run dev` and built Worker preview is `npm run start:worker`. The portable runner is the recommended path on this Windows machine. Rebuild with `npm run build:local` after changing code, then restart.

### Install on a phone

Open the deployed HTTPS website (or scan its QR code) in the phone's browser, then select **Install app** near the bottom of the page. When supported, this opens the browser's installation prompt. Otherwise the app shows installation instructions:

- **Android:** open the site in Chrome, choose the three-dot menu, then **Add to Home screen** or **Install app**, and confirm.
- **iPhone/iPad:** open the site in Safari, choose **Share → Add to Home Screen**, enable **Open as Web App** if shown, then choose **Add**.

The app has its own home-screen icon and opens in a standalone window on supporting browsers. It is an installable web app (PWA); no app-store account or APK download is needed. Browser support and menu wording vary. The Install app section is hidden when the app is already running in standalone mode.

An internet connection is required for accounts, reports, photos and messages. The service worker stores only a generic reconnect page. It does not cache API responses, private conversations, uploaded photos or the live application pages. Installing the app does not provide server backups or change a hosting plan's data-retention limits. New service-worker versions activate normally after older app windows close, without forcibly reloading forms.

### Persistent data and configuration

`npm run setup:env` generates a cryptographically random authentication secret in **`.dev.vars`**, which is ignored by Git. `.env.example` documents the settings. Do not commit secrets or change the session secret casually.

- `data/lost-found.sqlite`: users, sessions, reports, claims, messages, saves, notifications, moderation and limits.
- `data/uploads/`: sanitised JPEG, PNG and WebP images.
- `DATA_DIR`: optional alternate persistent data directory.
- `PORT`: default `3000`; `HOST`: default `127.0.0.1`.
- `APP_ORIGIN`: canonical origin, required when a reverse proxy serves a different public URL.
- `BETTER_AUTH_SECRET`: at least 32 random characters; generated automatically for local use.
- `ADMIN_USER_IDS`: comma-separated existing account IDs assigned by the operator.
- `SEED_DEMO=false`: disables demo bootstrapping for an empty database. Existing demo records remain until removed by the operator.

Back up the SQLite database with SQLite's backup tooling (or stop the server before copying the database and its WAL files), together with the uploads directory and the authentication secret. Restore them together. The local HTTP server deliberately binds to loopback by default.

### Administrator setup

Register and verify an ordinary account first. For a local server, run:

```sh
npm run admin -- lookup your-admin-email@example.com
npm run admin -- grant-local VERIFIED_ACCOUNT_ID
npm start
```

Restart the local server after configuring the account ID. For Render, set `ADMIN_USER_IDS` in its environment instead. The account then sees **Moderation**. Report a listing from another account to populate the queue. The server verifies the configured account ID on every moderation request. Admin access is never assigned by an unverified email address or a hidden UI button. There are no default passwords or pre-created privileged accounts.

## Product workflows

- **Discovery:** keyword, type, category, approximate location, date range, status, sorting and pagination. Reports can be opened through `/?report=ID`, saved, shared, or downloaded as a QR code.
- **Reporting:** lost/found type; title; category; public description; colour; optional brand; date; approximate location; private distinguishing features; up to five images; preview, removal and cover selection. Open reports can be edited, closed or deleted by their owner.
- **Images:** JPEG, PNG and still WebP; 5 MB per original image. The browser resizes to 1800 px and re-encodes. The server independently validates signatures and structure, enforces request limits, and removes EXIF/XMP and other metadata. Unpublished uploads are accessible only to their uploader. Reports without images receive bundled category illustrations.
- **Claims:** a claimant supplies private evidence, then the two participants exchange private messages. The finder may ask questions and approve or reject the claim. A pending claim can be withdrawn. Blocking prevents interaction in both directions.
- **Returns:** an approval reserves the listing; a database uniqueness constraint prevents two approved claims. One confirmation leaves the report in Return Arranged. Only both confirmations produce Returned. Other pending claims are rejected when the return completes. Rejecting or withdrawing a pending claim leaves other claims and the listing open as appropriate.
- **Notifications:** persisted match, claim, message and return updates; mark all as read. Conversations refresh every ten seconds while open; the dashboard has a manual refresh control.
- **Moderation:** reports can be flagged; configured admins can review the queue and hide, restore or dismiss a listing.
- **Happy Returns:** only the item category is published, and only after both participants independently opt in following a confirmed return. Either can withdraw consent.
- **Accessibility:** labelled forms, native keyboard-operable dialogs, focus-visible controls, reduced-motion support, responsive layouts and a remembered light/dark preference.

Private ownership details are never included in public report responses, match inputs or the happy-return feed. Claims and messages are limited to their participants. Public text rejects obvious email addresses and long numeric contact/ID sequences. Users must still avoid putting private addresses or sensitive content into descriptions or images; there is no OCR or automatic redaction.

## Matching algorithm

Each open report is compared against up to 1,000 recent open reports of the opposite type, with demo and real records kept separate. The weighted score is out of 100:

| Signal | Weight |
| --- | ---: |
| Exact category | 30 |
| Normalised title/description token overlap | up to 25 |
| Exact colour, ignoring case | 15 |
| Exact brand, ignoring case | 10 |
| Found date within 30 days after lost date | 10 |
| Shared approximate-location token | 10 |

Text overlap divides shared tokens by the smaller token-set size. Common words and punctuation are removed. Scores of at least 40 produce up to eight suggestions, ordered by score. Suggestions are computed from current data when a detail page opens and when a report is created or updated; creation/updates notify both owners only when similarity is strictly above 75%, once per report pair. Exactly 75% does not notify. Strong matches are highlighted, while ordinary suggestions still appear from 40. Self-matches, demo activity, hidden/closed reports and blocked participants do not generate strong-match alerts. Reasons explain every contributing signal. Shared location text is **not a measured physical distance**.

These are relevance indicators, not calibrated probabilities or proof of ownership. Photo comparison is manual and side by side; no AI image recognition is claimed. See `lib/matching.ts`.

## Tests and verification

`npm test` creates an isolated temporary SQLite database and upload directory under `.sites-runtime/`. It executes the actual server handlers with real authentication cookies, migrations, database writes and image storage. It covers registration/login/logout, access controls, multiple image formats, invalid uploads, metadata stripping, search, matching, edits, saves, private claims/messages, conflicting approval prevention, two-person confirmation, unsuccessful claims, blocking, moderation, consent, notifications, CSRF and rate limits.

A second fresh Node process reopens the same data and verifies reports, image bytes, sessions, claims, messages and notifications survive restart. These are **API integration tests**, not browser-driven end-to-end tests. No tests contact external services or production accounts.

Six additional regression checks deliberately pause report edits, closure and deletion after reading their state, approve a claim, then resume the stale request. These changes must be rejected without damaging the arranged return. Tests also verify that participants can revoke Happy Returns consent after blocking or moderation, and that closed reports remain deletable.

`npm run test:http` starts an isolated real HTTP server, then checks the built interface, registration cookies, protected routes, multipart uploads, report creation, search, image streaming and logout. It uses port 3001 by default (`TEST_PORT` can override it), closes the server afterward, and fails explicitly if networking is denied. Run `npm run build:local` first to include the static-build check.

See **COMPLETION.md** for checks actually performed and remaining verification gaps.

## Hosting and deployment

### A Node host

Install Node 24+, run `npm ci` and `npm run build:local`, supply a persistent `DATA_DIR`, a stable random `BETTER_AUTH_SECRET`, and the canonical HTTPS `APP_ORIGIN`. Run `npm start` behind an HTTPS reverse proxy. Preserve the database/uploads volume between restarts and deployments. Use a single application process with this SQLite adapter; use a shared transactional database before horizontal scaling. Configure `ADMIN_USER_IDS` using trusted account IDs.

### Sites / Cloudflare

`.openai/hosting.json` declares D1 `DB` and R2 `BUCKET`. The Vinext build preserves the Sites integration. Publish the exact built source through the Sites workflow; it provisions bindings and applies `drizzle/` migrations. Set `BETTER_AUTH_SECRET` as a secret runtime environment variable before deploying. Set `ADMIN_USER_IDS` after the intended operator registers. Re-deploy to apply environment changes.

Local files map to persistent R2 objects in hosted mode, and the D1/SQLite schema stays the same. The hosted demo bootstrap uses idempotent inserts from `seed/demo.json`, outside schema migrations. For a fresh independent Site, remove the existing Site identity through the normal project setup workflow and register a new Site; do not reuse another owner's project ID.

New Sites are owner-private. That preview access policy must be deliberately changed before unrelated community members can participate. The application has its own Better Auth accounts inside the host's access policy.

For manual local D1 emulator usage after a Worker build, apply pending migrations in order using:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_modern_bloodaxe.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_whole_legion.sql
```

Apply each migration once. The portable runner tracks migrations itself. Never edit an already-applied migration.

## Source map

- `components/LostFoundApp.tsx`: discovery, reporting, account dashboard, claim dialogs and moderation UI.
- `app/api/[...path]/route.ts`: validated and authorised domain API.
- `app/api/auth/[...all]/route.ts`, `lib/auth.ts`: Better Auth registration and sessions; scrypt password hashing.
- `lib/images.ts`, `lib/body.ts`: upload sanitisation and bounded request bodies.
- `db/schema.ts`, `drizzle/`: relational schema and migrations, including claim uniqueness constraints.
- `local/`: portable SQLite/file-storage adapters and HTTP entry point.
- `public/samples/`, `seed/`: local illustrations and explicitly labelled demo records.
- `tests/`: integration tests and non-sensitive test images.

## Operational limitations

Email verification and self-service password reset use a configured Brevo sender; without both mail settings, these email features remain unavailable. No external location service, image recognition, push notifications, match emails or malware scanning is configured. Messaging uses polling. Photos receive structural validation and metadata stripping, not server-side visual decoding; the browser performs actual decoding/re-encoding. Animated WebP is rejected. The maintenance command previews or removes unattached uploads older than seven days and rate-limit records older than one day. Run it regularly from a trusted operator environment; no external scheduler is provisioned. Either participant can cancel an approved arrangement before both confirmations, including while blocked or moderated. Its conversation remains in history and other pending claims survive. Completed returns cannot be cancelled. Large deployments should move matching to indexed/background processing and notifications to a durable queue. Content filtering is advisory and cannot detect every private detail. These limits are explicit rather than disguised as working integrations.
