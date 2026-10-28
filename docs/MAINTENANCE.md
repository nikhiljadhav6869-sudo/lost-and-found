# Operations and maintenance

## Administrator

The existing administrator ID allowlist remains authoritative. Ordinary users cannot self-promote. The service panel shows registered-account count and paginated names/verification state, real report categories, timed resolved cases, processing states and aggregate operational events. Three or more recorded failures show an attention message. No passwords, contact email, vectors or private claim evidence are returned by the account-review endpoint.

Existing flag moderation can hide/restore reports. Hiding a report also removes its photo from public access unless another visible report references it. Private participant messages and evidence remain restricted to the participants.

Operational event retention is 30 days. API logs record failures and slow requests over two seconds, not every request. Counters are not an uptime guarantee. The provider dashboards remain necessary for storage bytes/quotas and actual email delivery/bounces. Dedicated external alert delivery has not been configured.

## Cleanup

`npm run maintenance` previews; `npm run maintenance -- --apply` applies bounded cleanup. It removes unreferenced uploads older than seven days, expired sessions/tokens, expired search inputs older than 24 hours, old operational logs and rate-limit entries older than one day. Photo reservations and reference rechecks prevent deletion while a report attaches an image. Failed deletions stay queued. Genuine reports and published photos are never removed by retention.

Per run limits: 100 photo jobs, 500 sessions/tokens/search jobs, 1,000 old operation/rate-limit records. Repeat on an operator schedule when a backlog remains.

## Encrypted backups and schedule

Existing archives use AES-256-GCM with a scrypt-derived key, a transactional database snapshot and photo integrity hashes. Restore requires the same migration version, verifies integrity, and refuses to overwrite a directory. It restores into a new local directory; uploading a restored database to production is a separate operator task. The small-project exporter stops above 64 MB uncompressed data/photos. Concurrent photo removal can stop a backup; pause writes for an operationally consistent migration snapshot.

The new `npm run operations` command:
1. Requires remote storage, a separate private `BACKUP_BUCKET` and `BACKUP_PASSWORD` of at least 20 characters.
2. Encrypts and uploads the archive without overwrite.
3. Reads the encrypted object back and compares its SHA-256 digest.
4. Decrypts and restores that downloaded archive in a new private temporary directory, checking the migration version, database references/integrity, and photo hashes. Deletes only this run's temporary directory, including after a failed restore. Logs table/photo counts, never restored records or credentials.
5. Applies 14-day retention by default, preserving at least the two newest archives and all unrelated files. A failed download or restore prevents retention deletion and maintenance.
6. Runs safe cleanup only after the backup and restore drill succeed.
7. Records success/failure without printing credentials. Decrypted restore files are never uploaded as workflow artifacts.

`.github/workflows/operations.yml` provides daily scheduling at 01:30 UTC (07:00 India time), plus manual dispatch. Scheduled runs are disabled until repository variable `OPERATIONS_ENABLED=true` is set; a manual run is permitted before that variable is enabled so the first backup can be verified. GitHub can delay scheduled jobs, so this is a daily target, not an exact-time guarantee. Configure repository secrets: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_STORAGE_BUCKET`, `BACKUP_BUCKET`, `BACKUP_PASSWORD`. Restrict repository write access because workflow code can access these secrets.

Create a separate private backup bucket allowing encrypted binary archives with adequate size limits; do not reuse the photo bucket. Keep the password separately from the archive/provider account. Review quotas: repeated full backups can exhaust a free storage allowance. Free service terms and capacity are not guaranteed for life.

GitHub automatically disables scheduled workflows in public repositories after 60 days without repository activity. Review the latest successful backup regularly; if the schedule is disabled, open **Actions → Private backups and maintenance → Enable workflow**, then run it manually to verify recovery. See [GitHub's workflow lifecycle documentation](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows). Do not create empty commits to keep a schedule alive.

Run the workflow manually and confirm `encrypted_backup_verified` includes `restoreVerified: true` before enabling the repository variable. Every subsequent scheduled run repeats the restore drill. Verify GitHub workflow failure notifications in the operator account. This code does not provision a bucket, repository secrets or enable the live backup schedule automatically; those must be configured separately. Remote archive upload/retention and restore cleanup have focused isolated tests; only an actual successful workflow run establishes live backup readiness.

## Model jobs

Run `npm run ai:worker -- --watch` on a separate capable host. Three failed attempts require operator investigation before resetting the relevant job; never automatically retry forever. Review sanitized event counts and model/download availability. Back up before a model-version migration, update the pinned version and requeue affected active reports deliberately. Do not retrain on private messages or evidence.

## Local demonstration reset

`SEED_DEMO=true` and local storage are required for `node scripts/demo-reset.mjs`. Only the known sample IDs owned by `demo-community` with `demo=1` are reset. Real records colliding with those IDs are preserved. The command refuses remote production storage. There are no public demo passwords or seeded login accounts.
