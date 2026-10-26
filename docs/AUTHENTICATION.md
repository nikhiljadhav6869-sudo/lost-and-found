# Authentication and account recovery

Visitors can browse real and demo listings without an account. Reporting, saving, private claims, messages, feedback and AI search require a session.

Better Auth handles password hashing and sessions. Passwords are 12–128 characters. Production email configuration requires both the provider key and sender; partial configuration fails closed. Registration directs users to verification. The verification link expires after one hour, redirects back to a clear sign-in message, and does not silently log the recipient in. Reset links expire after 30 minutes, are single-use, and password reset revokes old sessions.

The UI provides resend links, a 60-second resend cooldown, spam/quarantine guidance, expired-link messages, and retry when account capability loading fails. Public browsing remains possible while waiting. Provider acceptance does not guarantee inbox delivery, especially with institutional mail filtering.

Account email sends run outside the account-existence response path. Transient failures retry up to three times with short backoff. Operational records contain only event type, accepted/failed/retry, elapsed time and timestamp. Email delivery events are not per-user public endpoints. Retries are in-process, not a durable mail queue; a restart can lose a pending send and the user must request another link. Provider inbox delivery/bounce webhooks have not been configured.

Server-side limits and same-origin checks protect auth mutations. Sessions use secure cookies on HTTPS, trusted application origin checks and expiring session records. Unknown account recovery and verification requests use generic responses. IP extraction trusts only the host configuration in `local/client-ip.mjs`.

Google/Microsoft OAuth and passwordless/OTP were evaluated as possible alternatives. They require external application registrations, callback setup and additional abuse controls. This upgrade retains the tested email/password flow rather than adding unconfigured buttons.

Verification: `tests/auth-recovery.mjs` uses real auth handlers and a local mail transport double; it tests required verification, redirects, token expiry/reuse, old-password rejection, session revocation and enumeration-safe responses. Existing live Gmail/VIT verification was performed before this upgrade; new live resend/retry behavior still needs a provider acceptance and inbox check.
