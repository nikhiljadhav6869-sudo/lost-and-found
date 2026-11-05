# Operations and maintenance

## Administrator

The existing administrator ID allowlist remains authoritative. Ordinary users cannot self-promote. The service panel shows registered-account count and paginated names/verification state, real report categories, timed resolved cases, processing states and aggregate operational events. Three or more recorded failures show an attention message. No passwords, contact email, vectors or private claim evidence are returned by the account-review endpoint.

Existing flag moderation can hide/restore reports. Hiding a report also removes its photo from public access unless another visible report references it. Private participant messages and evidence remain restricted to the participants.

Operational event retention is 30 days. API logs record failures and slow requests over two seconds, not every request. Counters are not an uptime guarantee. The provider dashboards remain necessary for storage bytes/quotas and actual email delivery/bounces. GitHub operator alerts are configured as described below.

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

GitHub automatically disables scheduled workflows in public repositories after 60 days without repository activity. Review the latest successful backup regularly; if the schedule is disabled, open **Actions → Private backups and maintenance → Enable workflow**, then run it manually to verify recovery. See [GitHub's workflow lifecycle documentation](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows).

Run the workflow manually and confirm `encrypted_backup_verified` includes `restoreVerified: true` before enabling the repository variable. Every subsequent scheduled run repeats the restore drill. Verify GitHub workflow failure notifications in the operator account. The current production bucket, secrets, and schedule were configured separately on 29 October 2026; see [operations activation evidence](OPERATIONS-STATUS.md). New installations still require that setup. Remote archive upload/retention and restore cleanup have focused isolated tests; only an actual successful workflow run establishes live backup readiness.

## Model jobs

Run `npm run ai:worker -- --watch` on a separate capable host. Three failed attempts require operator investigation before resetting the relevant job; never automatically retry forever. Review sanitized event counts and model/download availability. Back up before a model-version migration, update the pinned version and requeue affected active reports deliberately. Do not retrain on private messages or evidence.

## Local demonstration reset

`SEED_DEMO=true` and local storage are required for `node scripts/demo-reset.mjs`. Only the known sample IDs owned by `demo-community` with `demo=1` are reset. Real records colliding with those IDs are preserved. The command refuses remote production storage. There are no public demo passwords or seeded login accounts.

## Operator failure alerts

The Operator alerts workflow watches unsuccessful backup and maintenance runs on main. It also checks hourly for three or more terminal account-email failures in the preceding 24 hours. Retries and provider-accepted requests are excluded. A failed monitor run raises a separate alert. These checks detect application delivery errors. They cannot detect an email that the provider accepts and the recipient's inbox later filters.

An incident creates a generic GitHub issue assigned to the repository owner. While it stays open, the same incident type is suppressed. Review the linked run or the private provider logs and close the issue after investigation. Public issues contain no recipient addresses, tokens, message bodies or backup contents. GitHub inbox and email routing follow the owner's notification settings.

For a backup drill, manually run Private backups and maintenance on main with alert_drill enabled. This run intentionally fails before accessing production storage and the monitor creates a test issue. For the email drill, manually run Operator alerts on main with email-drill. It checks the threshold against in-memory events without sending account email. Use check mode to query actual email health.

On 3 November 2026 the [backup drill notification](https://github.com/nikhiljadhav6869-sudo/lost-and-found/issues/1) and [repeated-email-failure drill notification](https://github.com/nikhiljadhav6869-sudo/lost-and-found/issues/2) both appeared in the repository owner's GitHub inbox. The two drill issues were then closed. The [production email health scan](https://github.com/nikhiljadhav6869-sudo/lost-and-found/actions/runs/41656433455) completed successfully without triggering an incident. The [scheduled backup](https://github.com/nikhiljadhav6869-sudo/lost-and-found/actions/runs/41600315504) preceding the drill passed.

## Availability and overdue backups

The same scheduled Operator alerts workflow now checks the public app configuration and worker availability with three attempts, allowing for cold starts. It also reads GitHub run history for a successful non-drill backup on main within 36 hours. It needs only read access to Actions and the public app for these checks; it does not receive database or photo credentials.

Persistent app unavailability, worker unavailability, overdue backup and failure of the monitor itself each have a separate generic issue title. Existing open issues of that type suppress duplicates. Successful checks remain quiet; close an issue after reviewing recovery. Provider errors, private records and credentials are excluded from issues. A sleeping personal computer can legitimately trigger the worker alert while the website remains available.

These checks run on the existing hourly target schedule, which GitHub can delay or disable. They are not continuous uptime monitoring and cannot alert when GitHub itself does not execute them. They do not measure remaining storage/bandwidth allowances. Review provider usage and actual recipient delivery separately.
