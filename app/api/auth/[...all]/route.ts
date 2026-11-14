import { auth } from '../../../../lib/auth';
import { env } from 'cloudflare:workers';
import { boundedBody } from '../../../../lib/body';
import {emailCodesRequired} from '../../../../lib/auth-email';
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
        if(emailCodesRequired()){
            const endpoint=new URL(req.url).pathname.slice('/api/auth/'.length);
            if(!['email-otp/send-verification-otp','sign-in/email-otp','sign-out'].includes(endpoint))return Response.json({error:'Use your email and a one-time code to access this account.'},{status:403});
            const data=JSON.parse(new TextDecoder().decode(body)||'{}');
            if(endpoint==='email-otp/send-verification-otp'){
                if(data.type!=='sign-in'||typeof data.email!=='string')return Response.json({error:'Use email code sign-in.'},{status:400});
                const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(data.email.trim().toLowerCase())))).map(x=>x.toString(16).padStart(2,'0')).join('');
                for(const [window,max] of [[60000,1],[86400000,20]]){
                    const counter=await env.DB!.prepare('INSERT INTO limits(key,count) VALUES(?,1) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind('email-code:'+hash+':'+window+':'+Math.floor(Date.now()/window)).first<{count:number}>();
                    if(counter!.count>max)return Response.json({error:window===60000?'Wait a minute before requesting another code.':'Too many code requests. Try again tomorrow.'},{status:429});
                }
            }
        }
        return auth(origin).handler(new Request(req.url, { method: 'POST', headers: req.headers, body }));
    }
    catch (e) {
        return Response.json({ error: (e as Error).message }, { status: (e as any).status || 500 });
    }
}
