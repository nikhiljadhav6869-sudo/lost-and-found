# Deploying the production optimization upgrade

Use the existing Render service and remote database/photo configuration described in [DEPLOYMENT.md](../DEPLOYMENT.md). This upgrade does not require a new public URL or replacement accounts. Keep the existing session secret and administrator IDs.

## Web release

1. Run `npm ci --include=dev` and `npm run verify` on Node 24. Linux browser tests need `npx playwright install --with-deps chromium`; Windows uses installed Edge when available.
2. Keep Render build `npm ci --include=dev && npm run build:local`, start `APP_ORIGIN="$RENDER_EXTERNAL_URL" npm start`, remote storage settings and `SEED_DEMO=false`.
3. Review and publish the tested commit to the connected branch. Auto-deploy must be enabled for that branch. Do not change existing credentials just to deploy code.
4. Startup applies migrations 0004 and 0005 once through the existing transactional migration runner. They add tables, columns, indexes and job triggers; they do not drop accounts or reports. Archived backups now include the new tables. Restore tooling requires a matching schema version.
5. Check `/healthz`, `/api/health`, `/api/config`, real versus demo discovery, existing report links and a signed-in account. Confirm private fields are absent from guest responses.
6. Close older installed-app windows to allow the new offline-only service worker to activate normally.

Take an encrypted backup before an operator migration or rollback when configured. If a release fails, redeploy the previous known-good application commit. Do not reverse/drop the additive database tables or replace the database with an empty instance. Retain a matching-version copy of backup tools. Stop an optional worker before rolling its application version backward.

## Optional AI worker

The web release is usable without a worker. It uses explainable public-detail matching and shows an offline message for AI search. Do not advertise live image inference until a worker has processed real jobs.

On a separate trusted Node 24 host, install root dependencies and `npm ci --prefix ai-worker`, supply the remote database/private-photo environment through secrets, then run `npm run ai:worker -- --watch`. Follow [AI-MATCHING.md](AI-MATCHING.md) for pinned model versions, resource measurements and retry policy. Model downloads require outbound HTTPS. Cache files and credentials are ignored by Git.

A personal computer can perform queued work while awake without buying a hosting plan. Availability depends on that computer. Continuous processing needs suitable infrastructure; the current 512 MB web instance is below the observed 661 MB worker footprint. The Windows worker was activated separately on 29 October 2026; see [verified operations status](OPERATIONS-STATUS.md).

## Backups and maintenance

For a new installation, the daily workflow remains gated until repository variable `OPERATIONS_ENABLED=true` is set. Follow [MAINTENANCE.md](MAINTENANCE.md) to create a separate private bucket and install repository secrets. Perform a manual encrypted upload/readback and restore drill before enabling it. The current production repository completed this procedure on 29 October 2026 and targets 07:00 India time daily. Check quotas and GitHub failure notifications. Never put archive passwords or service keys in committed configuration.

## Hosting choices

| Choice | Cost and availability | Compatibility and complexity |
| --- | --- | --- |
| Existing Render Free web + external storage | No new paid resource; cold starts/quotas remain | Lowest migration effort; keep the current URL and libSQL/photo adapters |
| A paid Render web instance with adequate resources | Recurring bill; review current pricing before ordering | Same build/settings; more suitable when predictable availability is required |
| An independently managed Node/container server | Provider or hardware/electricity cost; operator maintains uptime | Included Dockerfile supports the web service with existing external storage; requires TLS, secrets, monitoring and patching |

Render documents free-service spin-down after 15 minutes of inactivity and ephemeral local storage. Free plans cannot provide a lifetime or always-awake guarantee. No keep-alive workaround is implemented. References: [Render Free](https://render.com/docs/free), [Node deployment](https://render.com/docs/deploy-node-express-app), [web/container services](https://render.com/docs/web-services).

The Dockerfile uses Node 24, an unprivileged runtime user and a local health check. Configure remote storage or a correctly owned persistent local volume. Example: build with `docker build -t lost-and-found .` and run with runtime secrets supplied outside the image. Docker is unavailable in the current verification environment, so image build/runtime validation remains pending.

## Mobile delivery

The existing HTTPS install link remains the public entry point. A browser requires user confirmation to install. The Android directory pins packaging tools but contains no signed APK or generated final Android project. Follow [android/README.md](../android/README.md) and complete physical-device checks before offering an APK download.
