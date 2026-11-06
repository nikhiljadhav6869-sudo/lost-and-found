# Security review of the upgrade

Preserved and tested: hashed passwords and expiring sessions; same-origin state-change checks; server validation and body limits; MIME/structure validation and image metadata stripping; owner-scoped reports and uploads; participant-only claims/messages; moderator allowlist; transactional return states; mutual sharing consent; blocking; bounded rate limits.

New safeguards: owner-scoped private search jobs, no arbitrary image URL fetching, no private evidence in embeddings, hidden/blocked/demo filtering, revision/lease checks against stale inference, model-version checks, preference-aware idempotent alerts, generic transient-error messages and no automatic mutation retries. The worker cache contains public model weights only. Test vectors are explicit test doubles, never production predictions.

Archives are encrypted before upload. The destination must be a separate private bucket; remote objects are read back before retention pruning. Passwords, keys, private database files, inference caches and signing material are excluded from Git/Docker contexts. Backup exports require the same application schema when restoring.

Private conversations/account pages are never service-worker cached. Report drafts automatically store typed fields, including private notes and uploaded photo references, in account-scoped localStorage on the current device. This device-local storage is not encrypted; the form discloses it and advises using a personal device. Drafts expire after seven days and are removed on publication, explicit discard or sign-out. They are not synced to other devices; unavailable storage produces a visible warning. Publicly published item photos are intentionally readable through the app; unpublished/hidden-only photos require ownership.

Location access is click-triggered and permission-controlled. Precise device coordinates are discarded after rounding to three decimal places; the resulting approximate area is visible in the form before publication. No reverse-geocoding service is called. Google receives the selected map query only when a user opens the Google Maps link. Permission denial, timeout and unavailable location leave manual entry usable; late callbacks cannot overwrite a newer manual correction or a closed form.

Remaining limits:
- This is not an independent penetration test or compliance certification.
- Server image validation removes metadata and checks structure; it is not antivirus scanning. The worker decodes images in its separate process.
- Broad provider server keys must remain on trusted worker/server hosts. Repository workflow writers can access configured action secrets.
- ML embeddings can still contain information about public text/images; treat database backups as sensitive.
- Mail retries are in-process; durable encrypted mail queues and delivery webhooks are not configured.
- Storage byte monitoring and external availability/error alerts still depend on provider setup.
- The free host and service quotas do not provide a production uptime guarantee.
- Physical-device workflows, Docker execution, Android signing/build and final live migration require separate validation.

No production records were removed or rewritten during local verification. Tests use isolated databases and synthetic accounts. Additive migrations preserve existing records; application rollback should retain the added tables/columns rather than deleting them.

## Dependency check — 26 October 2026

The final npm production audit reported zero known advisories for both the web package and the separate AI worker. Updated Next.js to 16.4.3, Zod to 4.6.7, esbuild to 0.28.1 and sharp to 0.35.5, refreshed affected transitive packages, and pinned the vulnerable transitive WebSocket/build-tool paths to patched versions. Full application tests, isolated schema generation and real model inference passed afterward. CI now audits production dependencies and separately checks real model inference. This is a dated registry audit, not a guarantee against unknown vulnerabilities or an audit of the optional Android toolchain.

Relevant advisories: [Next.js image optimization](https://github.com/advisories/GHSA-2464-fhr4-w9xw), [Zod constrained collections](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5). The portable Node service does not expose Next image-optimization routes, but the dependency was patched for the retained framework target as well.

## Automated review — 4 November 2026

Production dependency audits again reported zero known advisories for the web application and AI worker. The portable HTTP server now supplies anti-framing, MIME-sniffing, same-origin referrer and restricted base/object CSP headers for documents as well as APIs. Absolute request targets with a different origin are rejected before authentication routing. Regression tests cover these headers and rejection behavior.

The complete automated suite passed, including ownership/participant access, cross-origin mutations, private media, backup restore protection and password-reset revocation of two active sessions. No production credentials or real account passwords were changed. This review is not an independent penetration test; unknown vulnerabilities and the broader manual review limitations above remain.
