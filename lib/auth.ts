import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { getDb } from '../db';
import * as schema from '../db/schema';
import { env } from 'cloudflare:workers';
import { authMailSettings, queueAuthEmail } from './auth-email';

export function authCapabilities() {
    const enabled = !!authMailSettings();
    return { passwordReset: enabled, emailVerification: enabled, emailVerificationRequired: enabled };
}

export function auth(origin: string) {
    const secret = (env as unknown as Record<string, string>).BETTER_AUTH_SECRET;
    if (!secret || secret.length < 32)
        throw new Error('Account service needs BETTER_AUTH_SECRET configuration.');
    const mailEnabled = !!authMailSettings();
    return betterAuth({
        secret,
        baseURL: origin,
        trustedOrigins: [origin],
        database: drizzleAdapter(getDb(), { provider: 'sqlite', schema }),
        emailAndPassword: {
            enabled: true,
            minPasswordLength: 12,
            maxPasswordLength: 128,
            requireEmailVerification: mailEnabled,
            resetPasswordTokenExpiresIn: 30 * 60,
            revokeSessionsOnPasswordReset: true,
            ...(mailEnabled ? {
                sendResetPassword: async ({ user, url }: { user: { email: string; name: string }; url: string }) => {
                    queueAuthEmail({ to: user.email, name: user.name, url, purpose: 'reset' }, origin);
                },
            } : {}),
        },
        ...(mailEnabled ? {
            emailVerification: {
                expiresIn: 60 * 60,
                sendOnSignUp: true,
                sendOnSignIn: false,
                autoSignInAfterVerification: false,
                sendVerificationEmail: async ({ user, url }: { user: { email: string; name: string }; url: string }) => {
                    queueAuthEmail({ to: user.email, name: user.name, url, purpose: 'verify' }, origin);
                },
            },
        } : {}),
        session: { expiresIn: 60 * 60 * 24 * 7 },
        rateLimit: { enabled: true, window: 60, max: 20 },
        advanced: { useSecureCookies: origin.startsWith('https:'), ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] } },
    });
}
