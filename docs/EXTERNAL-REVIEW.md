# Independent review handoff

Status: prepared for a reviewer; no independent sign-off has been received. Automated checks and the implementing agent's own review are not an independent audit.

Use a separate local or staging deployment with synthetic accounts. Do not request production keys, use real private conversations, or perform disruptive tests on the public service. Run `npm ci --include=dev`, install Playwright Chromium and WebKit, then run `npm run verify`. See [the test report](TEST-REPORT.md) for evidence and limitations.

## Security scope

- Verify ordinary accounts cannot grant themselves administrator access, read another participant's claims/messages, or edit another user's reports/photos.
- Check verification/reset tokens for expiry, reuse, redirect restrictions, account enumeration and revocation of multiple sessions.
- Review cross-origin requests, forged proxy headers, absolute request targets, SQL parameter binding and HTML rendering of report text.
- Challenge file limits, disguised image types, metadata removal, image decode limits, and hidden/unpublished-photo access.
- Check races involving approval, closure, blocks, consent and both-party handover confirmation.
- Review worker leases, stale embeddings, queued search privacy and model input boundaries.
- Restore an encrypted synthetic backup; test wrong keys, corrupt downloads, partial failure and overwrite protection.
- Inspect workflow permissions and secret boundaries. Confirm incident output excludes private data.

Relevant entry points: `local/server.mjs`, `local/client-ip.mjs`, `app/api/[...path]/route.ts`, `app/api/auth/[...all]/route.ts`, `lib/auth.ts`, `lib/auth-email.ts`, `lib/ai-jobs.ts`, and `.github/workflows/`. Existing regression checks are in `tests/`.

## Accessibility and mobile scope

Test keyboard-only navigation, focus containment/restoration, error announcements, screen readers, zoom and text scaling. Test both themes and the full report/claim/message/return flow. Automated axe checks cover selected states, not complete conformance. Test native installation, camera permission/capture, file selection, slow connections and deep links on physical Android and iPhone devices; desktop WebKit is not iOS Safari.

Record the commit, device/browser or assistive technology, reproduction steps, impact and evidence for every finding. Include passed and failed cases and retest fixes. Keep private evidence out of public GitHub issues. Do not mark this review complete until the separate reviewer has provided results.
