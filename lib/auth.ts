import { betterAuth } from 'better-auth';
import {emailOTP} from 'better-auth/plugins';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { getDb } from '../db';
import * as schema from '../db/schema';
import { env } from 'cloudflare:workers';
import { authMailSettings, queueAuthEmail, emailCodesRequired, sendAccountCode } from './auth-email';

export function authCapabilities() {
    const enabled = !!authMailSettings();
    return { passwordReset: enabled && !emailCodesRequired(), emailVerification: enabled, emailVerificationRequired: enabled, emailCodes:emailCodesRequired() };
}

export function auth(origin: string) {
    const secret = (env as unknown as Record<string, string>).BETTER_AUTH_SECRET;
    if (!secret || secret.length < 32)
        throw new Error('Account service needs BETTER_AUTH_SECRET configuration.');
    const mailEnabled = !!authMailSettings();
    const codes=emailCodesRequired();
    if(codes&&!mailEnabled)throw new Error('Email delivery must be configured before email code sign-in can be used.');
    return betterAuth({
        secret,
        baseURL: origin,
        trustedOrigins: [origin],
        database: drizzleAdapter(getDb(), { provider: 'sqlite', schema }),
        ...(codes?{plugins:[emailOTP({otpLength:6,expiresIn:300,allowedAttempts:5,storeOTP:'hashed',sendVerificationOTP:async({email,otp,type})=>{if(type!=='sign-in')throw new Error('Use email code sign-in.');await sendAccountCode(email,otp,'login');}})]}:{}),
        emailAndPassword: {
            enabled: !codes,
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
        // A persistent cookie survives app restarts; active sessions renew daily.
        // Browsers can still remove cookies, and operators can revoke compromised sessions.
        session: { expiresIn: 60 * 60 * 24 * 365, updateAge: 60 * 60 * 24 },
        rateLimit: { enabled: true, window: 60, max: 20 },
        advanced: { useSecureCookies: origin.startsWith('https:'), ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] } },
    });
}
