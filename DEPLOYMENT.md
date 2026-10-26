# Finish the existing Render deployment

For the October production optimization release, read [the additive upgrade guide](docs/DEPLOYMENT-UPGRADE.md). It covers the optional separate AI worker, guarded backup schedule, rollback and checks. The storage setup below remains applicable; already configured credentials should be preserved.

The application supports **Render Free + Turso/libSQL + private Supabase Storage**. The database, sessions, reports, messages, and photos then live outside Render's temporary filesystem. The existing Render service and URL can stay unchanged. Free plans have quotas; Supabase may pause an inactive free project. This is durable storage, not an unlimited-service or uptime guarantee.

## 1. Create the external resources

1. In [Turso](https://app.turso.tech/), create a free **libSQL-compatible** database. Copy its database URL and database-scoped read/write token into Render environment settings. The app uses `@libsql/client`, not the new incompatible native Turso API.
2. In [Supabase](https://supabase.com/dashboard), create a free project, then a **private** Storage bucket named `lost-found-photos`. Set allowed content types to JPEG, PNG and WebP and a 5 MB file limit. Do not add public/anonymous access policies. This app serves images through its own authorised API.
3. Use the project URL and a backend **secret key** (`sb_secret_...`). The legacy service-role key is supported as `SUPABASE_SERVICE_ROLE_KEY`, but the new secret key is preferred. Never use a publishable key for this adapter and never put a secret key in browser code.
4. In [Brevo](https://app.brevo.com/), enable transactional email, verify a sender address (and authenticate its domain where required), and create an API key. The app uses HTTPS email delivery, not SMTP ports blocked by Render Free. No email is sent until real credentials are configured and a user requests signup, verification or reset.

## 2. Configure the existing Render service

Keep its existing `BETTER_AUTH_SECRET` unchanged. Add these variables before deploying the storage upgrade:

| Variable | Value |
| --- | --- |
| `STORAGE_MODE` | `remote` |
| `TURSO_DATABASE_URL` | The libSQL database URL |
| `TURSO_AUTH_TOKEN` | Its database-scoped read/write token |
| `SUPABASE_URL` | The HTTPS Supabase project origin |
| `SUPABASE_SECRET_KEY` | Backend secret key |
| `SUPABASE_STORAGE_BUCKET` | `lost-found-photos` |
| `BREVO_API_KEY` | Transactional email API key |
| `EMAIL_FROM` | Verified sender email address |
| `EMAIL_FROM_NAME` | `Lost & Found` |
| `SEED_DEMO` | `false` |
| `HOST` | `0.0.0.0` |
| `NODE_ENV` | `production` |

Keep the build command `npm ci --include=dev && npm run build:local` and start command `APP_ORIGIN="$RENDER_EXTERNAL_URL" npm start`. Use Node 24+. Startup validates that the photo bucket is private and applies database migrations transactionally. No fallback writes to local storage occur if external configuration is incomplete or unavailable. A Render deployment with no remote settings is intentionally rejected unless the operator explicitly sets `ALLOW_EPHEMERAL_STORAGE=true` for disposable demos.

**Do not merge this upgrade to the auto-deployed branch before these settings are ready.** Existing Render-local records cannot be recovered after they have already been erased. If they still exist, export them before restarting the old service. Never point test commands at production.

## 3. Verify email and appoint the administrator

1. Register the intended administrator through the deployed app and verify its email.
2. Sign in and copy **Your account ID** from My dashboard.
3. Set Render `ADMIN_USER_IDS` to that exact ID and redeploy. Do not put an email address here.
4. Sign in again and open Moderation. The service-status panel reports storage mode, email configuration and cleanup candidates without displaying secrets.
5. Use a second ordinary account to flag a test report. Confirm that only the administrator can hide, restore and dismiss it.

For operator lookup using securely configured local environment variables:

```sh
npm run admin -- lookup your-admin-email@example.com
npm run admin -- verify EXACT_ACCOUNT_ID
```

These commands only look up the requested account. `grant-local` is restricted to local storage and requires a verified email; it does not grant production access.

## 4. Backups and retention

Run maintenance from a trusted computer with the remote settings in an ignored `.dev.vars` file or environment. Start with a preview:

```sh
npm run maintenance
npm run maintenance -- --apply
```

The policy removes unattached photos older than seven days, in batches of at most 100, and rate-limit records older than one day. Published photos—including those on hidden or closed reports—remain intact. Failed photo deletions remain queued for retry. Run daily/weekly as appropriate; repeat if more than 100 candidates remain. No hosted schedule is provisioned automatically.

Set a strong, randomly generated `BACKUP_PASSWORD` of at least 20 characters in your private environment, separate from the backup files. Then:

```sh
npm run backup -- create backups/2026-10-22.lfbackup
npm run backup -- restore backups/2026-10-22.lfbackup .sites-runtime/restore-check
```

Backups use AES-256-GCM and contain a transactional database snapshot plus uploaded photos. Restore checks the database, schema version and photo hashes, and refuses to overwrite a directory. Keep the existing authentication secret separately if restored sessions must remain valid. Keep archives outside Git and outside Render. This small-project backup tool supports up to 64 MB of uncompressed data/photos; use provider export tools for larger datasets. Pause write activity for a consistent operational backup; concurrent photo removals cause an explicit backup failure rather than a falsely successful archive. Restore creates a new **local** data directory; a production provider restore/import is a separate operator action.

## 5. Release checks

```sh
npm run typecheck
npm run build:local
npm test
npm run test:http
npm run test:pwa
npm run test:upgrades
npm run test:auth
npm run test:storage
```

The tests use isolated databases and in-process test transports. They do not prove real credentials, email delivery or a phone's native install prompt works. Before broad use, verify on the deployed service:

- Two accounts: signup, verified login, upload, lost/found match, both notifications, claim, private messaging and both handover confirmations.
- Exactly 75% creates no strong-match notification; above 75% highlights the match and notifies both owners once per report pair. Scores are similarity, not proof of ownership.
- Cancel an approved arrangement before completion; the report reopens and preserves other pending claims. Completed returns cannot be cancelled.
- Password recovery arrives in the actual inbox; old sessions stop working after reset.
- Android Chrome and iPhone Safari installation, standalone reopening and the offline reconnect page.
- Create a report/photo, redeploy Render, and confirm both still exist.

Official references: [Turso plans](https://turso.tech/pricing), [Supabase plans](https://supabase.com/pricing), [private buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals), [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys), [Brevo email API](https://developers.brevo.com/reference/send-transac-email), [Render Free](https://render.com/docs/free).

### Windows workspace paths

If dependency postinstall scripts fail because a Windows folder name contains `&`, run `npm ci --ignore-scripts` for the local checkout, then run the checks above. The platform-specific packages are already in the lockfile. The Render/Linux build should continue using ordinary `npm ci --include=dev`.
