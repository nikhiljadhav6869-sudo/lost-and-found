# Published report options

The report displayed after publishing keeps the existing brand, colours and features. The photograph and report information appear above a single vertical list labelled **Report options**. Save, Copy link, QR code, Report listing, and any eligible ownership-claim or block action have full-width buttons. Permissions and eligibility rules are unchanged.

Possible connections remain below the options. Their feedback and Compare buttons use separate rows. On phones, the comparison displays one report below the other so text and buttons have more space.

## Verification and release

`tests/report-options.mjs` runs inside the existing publication browser workflow. It checks 320, 390, 768 and 1280 pixel widths, both themes, minimum touch-target heights, action alignment, overflow, keyboard order, saving, QR download and the moderation dialog. Automated accessibility checks run on the mobile and desktop layouts. The broader browser workflow also covers two-user matching, private claims, returns, photo limits, drafts and location recovery.

These are automated checks with synthetic accounts; they do not certify government readiness or guarantee fault-free operation. Before a government handover, agree the accepting organisation's requirements and complete its independent security/accessibility review, representative-device user acceptance testing, load and recovery checks, and operational support arrangements. Review the existing hosting and worker availability limitations against the agreed service requirements.
