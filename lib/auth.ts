import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { getDb } from '../db';
import * as schema from '../db/schema';
import { env } from 'cloudflare:workers';
export function auth(origin: string) {
    const secret = (env as unknown as Record<string, string>).BETTER_AUTH_SECRET;
    if (!secret || secret.length < 32)
        throw new Error('Account service needs BETTER_AUTH_SECRET configuration.');
    return betterAuth({ secret, baseURL: origin, database: drizzleAdapter(getDb(), { provider: 'sqlite', schema }), emailAndPassword: { enabled: true, minPasswordLength: 12, maxPasswordLength: 128 }, session: { expiresIn: 60 * 60 * 24 * 7 }, rateLimit: { enabled: true, window: 60, max: 20 }, advanced: { useSecureCookies: origin.startsWith('https:') } });
}
