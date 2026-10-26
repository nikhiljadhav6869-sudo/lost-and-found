# Production improvement audit — 25 October 2026

Baseline: 120bd7c. Preserve existing reports, accounts, photos and claim transitions.

## Verified architecture
React 19 UI; Next-style route handlers bundled into a Node 24 server by esbuild; Vite browser build. Production uses libSQL/Turso and private object storage. Better Auth handles hashed passwords, verified email, expiring sessions and recovery. Production migrations run transactionally. A service worker caches a generic offline page only.

## Verified protections to retain
Origin checks, bounded request bodies, validated image formats and metadata stripping, owner-scoped edits, private claim evidence, blocked-participant checks, transactional two-party return confirmation, admin allowlist, idempotent alerts strictly above 75, encrypted backup/restore tooling. Existing isolated tests cover races and unauthorized access.

## Gaps and implementation order
1. Shared request timeouts and safe read retries; email capability failures must not masquerade as disabled email; verification guidance/cooldown; qualitative similarity labels; explicit demo browsing; indexes and health checks.
2. Optional separate CPU embedding worker: real pretrained semantic/image models, durable jobs, content/model versioning, explainable ranking, no private evidence in model input. Web server must work without inference credentials or model downloads.
3. Search filters, notification preferences, duplicate review, optional local drafts, offline guidance and installation verification.
4. Safe operational metrics, cleanup, retry monitoring, encrypted scheduled backup tooling and retention. Never delete unresolved reports.
5. Run all suites and benchmarks; document physical-device and external-service requirements separately from locally verified behavior.

## Deployment constraints
The current free web host can sleep and cannot promise immediate opening. Large models must not run inside the 512 MB web process. No artificial keep-alive traffic. New schema changes must be additive; rollback application code independently and retain new tables. No destructive production migration is planned.
