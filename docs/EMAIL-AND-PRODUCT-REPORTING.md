# Email access and photo-free reports

Implementation update: 14 November 2026. See verification output for actual checks; provider setup and physical-device acceptance remain separate.

## Account access

Production remote storage enables email-only access by default (`AUTH_EMAIL_CODES=true` explicitly enables it on other hosts). Brevo sender settings remain required. Password signup/sign-in endpoints are rejected in this mode. A six-digit code verifies the email before a new account and session are created; existing accounts use the same email and retain their data. No shopping or Gmail password is collected.

Codes expire after five minutes, are hashed in the existing verification table, have five failed attempts, and are single-use. Sending is limited per email and IP. Resend waits one minute. No code or mail recipient is written to application logs. Browser sessions persist for up to one year and renew with activity after a day; explicit logout revokes the session. Clearing cookies, browser limits, prolonged inactivity or operator revocation can require login again. This is not a promise of permanent sessions.

## Report form and deletion

Detail fields are visible directly. The Add more details and Draft options / similar reports groups are removed. Automatic private device drafts remain, as do Save & close and publication/sign-out cleanup.

Owners can delete lost and found reports from their dashboard or report options, including completed public returns. Confirmation explains that claims/messages are deleted too. The backend checks ownership and removes linked notifications in the same transaction. Active arranged returns must be completed/cancelled first; college custody records still require staff handling. These safeguards prevent deleting an item while another participant is collecting it. Deleted data can remain in encrypted backups until retention expires; downloaded copies and screenshots cannot be recalled.

## Product references

Lost reports offer I Don't Have a Photo, website selection, product URL, extraction, editable fields, private unique characteristics, optional time of loss and a review step. No-link/manual entry and screenshot uploads remain available. Reference pictures are labelled, and excluded from physical-photo embeddings; public text still supports matching. Private distinguishing details are not extraction inputs or public matching inputs.

Migration `0010_reference_products.sql` adds productData, referenceImage and lostTime to reports. Existing reports default to ordinary photos. The same report API, private upload bucket, ownership guards, drafts and encrypted backups are reused.

Extraction uses structured metadata rather than generative guesses. It does not bypass login, CAPTCHA or anti-bot controls. No production sample results are returned. Missing or blocked data produces a recoverable error while keeping the URL. Unconfigured integrations do not prevent manual submission.

## Approved integrations

Do not enable a reuse flag solely because an API key exists. Confirm the provider permits this lost-property use and storage/display duration; affiliate access does not automatically grant those rights. No provider is activated by default.

- Amazon: current [Creators API](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/get-started/using-curl). Configure server-only AMAZON_CREATORS_CLIENT_ID, AMAZON_CREATORS_CLIENT_SECRET, AMAZON_PARTNER_TAG and AMAZON_CATALOG_REUSE_APPROVED=true after approval. Supports full amazon.in and amazon.com /dp/ or /gp/product/ URLs. Image import additionally requires AMAZON_IMAGE_STORAGE_APPROVED=true. No obsolete PA-API or page scraping fallback is used.
- Flipkart: [Product API](https://affiliate.flipkart.com/api-docs/af_prod_ref.html). Configure FLIPKART_AFFILIATE_ID, FLIPKART_AFFILIATE_TOKEN and FLIPKART_CATALOG_REUSE_APPROVED=true after approval. Full product URLs must include pid. Image import additionally requires FLIPKART_IMAGE_STORAGE_APPROVED=true.
- Other sites: PRODUCT_METADATA_SITES is a server-side JSON array of objects with exact host, pathPrefixes, reuseApproved, imageHosts and imageStorageApproved. Add only sites whose permissions were reviewed. An example configuration shape (not an active integration) is [{"host":"catalog.your-approved-domain.com","pathPrefixes":["/products/"],"reuseApproved":true,"imageHosts":["images.your-approved-domain.com"],"imageStorageApproved":true}]. Pages require Schema.org Product JSON-LD; ambiguous multi-product pages are rejected.

Requests use HTTPS, exact host allowlists, public IPv4 DNS checks pinned to the TLS connection, no redirects, no user cookies, ten-second request deadlines and bounded responses. Images require separate approval, approved image hosts and image decoding/metadata removal before private storage. Query/tracking data is removed from saved source links. Other-site query URLs are rejected.

## Remaining acceptance

Production catalog credentials and reuse approvals have not been supplied. Amazon/Flipkart live extraction cannot be claimed verified until those are configured and tested. Tests use explicitly isolated catalog fixtures, never fake production success. Physical phone email delivery, screenshots, persistent-cookie behaviour and an end-to-end permitted real product need acceptance testing.

Private claims retain existing owner/authorised participant/staff access controls. Blockchain is not used to publish private data: immutable public storage would work against this privacy requirement.
