import { env } from 'cloudflare:workers';
import { recordOperation } from './operations';

type MailSettings = { apiKey: string; sender: string; name: string };
type AuthMail = { to: string; name: string; url: string; purpose: 'verify' | 'reset' };
const deliveries = new Set<Promise<void>>();

// Credentials are read only by server code. A partial configuration must not
// silently turn verification off.
export function authMailSettings(): MailSettings | null {
    const config = env as unknown as Record<string, string | undefined>;
    const apiKey = config.BREVO_API_KEY?.trim() || '';
    const sender = config.EMAIL_FROM?.trim() || '';
    if (!apiKey && !sender) return null;
    if (!apiKey || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(sender))
        throw new Error('Configure BREVO_API_KEY and a verified EMAIL_FROM address together.');
    return { apiKey, sender, name: config.EMAIL_FROM_NAME?.trim().slice(0, 80) || 'Lost & Found' };
}

export async function sendAuthEmail(mail: AuthMail, origin: string) {
    const settings = authMailSettings();
    if (!settings) throw new Error('Account email delivery is not configured.');
    const url = new URL(mail.url);
    if (url.origin !== new URL(origin).origin || !url.pathname.startsWith('/api/auth/'))
        throw new Error('Account email link must use this application’s origin.');
    const verify = mail.purpose === 'verify';
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        redirect: 'error',
        headers: { 'api-key': settings.apiKey, 'content-type': 'application/json', accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify({
            sender: { email: settings.sender, name: settings.name },
            to: [{ email: mail.to, name: mail.name.slice(0, 80) }],
            subject: verify ? 'Verify your Lost & Found email' : 'Reset your Lost & Found password',
            textContent: [
                'Hello,', '',
                verify ? 'Confirm your email address to use your Lost & Found account:' : 'Use this link to choose a new Lost & Found password:',
                url.href, '',
                verify ? 'This link expires in 1 hour.' : 'This link expires in 30 minutes and can be used once.',
                'If you did not request this email, you can ignore it.',
                'Never share this private link with anyone.',
            ].join('\n'),
            tags: [verify ? 'account-verification' : 'password-reset'],
        }),
    });
    // Provider response bodies can contain recipients or other private details.
    if (!response.ok) throw Object.assign(new Error('Account email provider rejected delivery.'), { retryable: response.status === 429 || response.status >= 500 });
}

// Render's Node server remains alive after a response. Send outside the auth
// response to avoid exposing whether an address exists through provider latency.
// Failed delivery has a fixed log message; the user can request another link.
export function queueAuthEmail(mail: AuthMail, origin: string): void {
    const task = (async () => {
        for (let attempt=0; attempt<3; attempt++) {
            const started=Date.now();
            try { await sendAuthEmail(mail, origin); await recordOperation('email','accepted',Date.now()-started); return; }
            catch (error) {
                const retryable = (error as {retryable?:boolean}).retryable === true || error instanceof TypeError || (error instanceof Error && error.name === 'TimeoutError');
                if (attempt<2 && retryable) { await recordOperation('email','retry'); await new Promise(resolve=>setTimeout(resolve,1000*2**attempt)); continue; }
                await recordOperation('email','failed',Date.now()-started);
                console.error(JSON.stringify({event:'account_email_failed',attempts:attempt+1})); return;
            }
        }
    })();
    deliveries.add(task);
    void task.finally(() => deliveries.delete(task));
}

// The Node host may await outstanding deliveries on graceful shutdown. Tests
// use the same hook with an in-process fetch stub; no secrets are written out.
export async function drainAuthEmails(): Promise<void> {
    await Promise.allSettled([...deliveries]);
}
