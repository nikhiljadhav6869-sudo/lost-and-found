# Email access and photo-free reports

Implementation update: 14 November 2026. See verification output for actual checks; provider setup and physical-device acceptance remain separate.

## Account access

Production remote storage enables email-only access by default (`AUTH_EMAIL_CODES=true` explicitly enables it on other hosts). Brevo sender settings remain required. Password signup/sign-in endpoints are rejected in this mode. A six-digit code verifies the email before a new account and session are created; existing accounts use the same email and retain their data. No shopping or Gmail password is collected.

Codes expire after five minutes, are hashed in the existing verification table, have five failed attempts, and are single-use. Sending is limited per email and IP. Resend waits one minute. No code or mail recipient is written to application logs. Browser sessions persist for up to one year and renew with activity after a day; explicit logout revokes the session. Clearing cookies, browser limits, prolonged inactivity or operator revocation can require login again. This is not a promise of permanent sessions.

Normal API responses now forward renewed session cookies, so renewal extends both the stored session and the browser login. Chromium and WebKit tests close the whole browser process and reopen the same disk profile without exporting or reinjecting cookies. They also check temporary outage recovery and that explicit logout remains effective after another restart. This verifies browser behaviour; installed Android/iPhone app behaviour still needs physical-device acceptance.

## Report form and deletion

Detail fields are visible directly. The Add more details and Draft options / similar reports groups are removed. Automatic private device drafts remain, as do Save & close and publication/sign-out cleanup.

Owners can delete lost and found reports from their dashboard or report options, including completed public returns. Confirmation explains that claims/messages are deleted too. The backend checks ownership and removes linked notifications in the same transaction. Active arranged returns must be completed/cancelled first; college custody records still require staff handling. These safeguards prevent deleting an item while another participant is collecting it. Deleted data can remain in encrypted backups until retention expires; downloaded copies and screenshots cannot be recalled.

## Manual reference images

Lost reports offer I Don't Have a Photo. Users can take a screenshot of the same or a similar item in any shopping app or website, upload it as a reference image, and manually enter their own item's name, brand, colour, model and description. There is no store selector, automatic extraction, screenshot OCR, catalog API or API-key requirement. The retired extraction endpoint returns 410 for older clients.

A reference link and image are optional. Screenshots retain the existing 15 MB limit and are labelled Reference Product Image, never proof of ownership. Users should crop out personal information before uploading. Reference images do not trigger photo suggestions or physical-photo embeddings. Public text can still support lost/found matching. Private distinguishing details retain existing access controls.

The form saves progress on the device and asks users to review before publishing. Links, models and reference flags use the existing report storage and migration 0010; this update does not change the database schema or remove existing reports. Links are reference metadata only and are never fetched by the app.

## Remaining acceptance

Physical phone email delivery, screenshot selection from the gallery, installation and persistent-cookie behaviour still need real-device acceptance testing. Amazon/Flipkart API access is no longer a pending requirement.

Private claims retain existing owner/authorised participant/staff access controls. Blockchain is not used to publish private data.
