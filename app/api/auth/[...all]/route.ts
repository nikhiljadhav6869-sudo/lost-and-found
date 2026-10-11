import { auth } from '../../../../lib/auth';
import { env } from 'cloudflare:workers';
import { boundedBody } from '../../../../lib/body';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) { return auth(new URL(req.url).origin).handler(req); }
export async function POST(req: Request) {
    const origin = new URL(req.url).origin;
    if (req.headers.get('origin') !== origin)
        return Response.json({ error: 'Request origin could not be verified.' }, { status: 403 });
    const ip = req.headers.get('cf-connecting-ip') || 'local';
    const key = 'auth:' + ip + ':' + Math.floor(Date.now() / 60000);
    const row = await env.DB!.prepare('INSERT INTO limits(key,count) VALUES(?,1) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(key).first<{
        count: number;
    }>();
    if (row!.count > 20)
        return Response.json({ error: 'Please wait a minute before trying again.' }, { status: 429 });
    try {
        const body = await boundedBody(req, 16000);
        return auth(origin).handler(new Request(req.url, { method: 'POST', headers: req.headers, body }));
    }
    catch (e) {
        return Response.json({ error: (e as Error).message }, { status: (e as any).status || 500 });
    }
}
