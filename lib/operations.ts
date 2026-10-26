import { env } from 'cloudflare:workers';
/** Fixed event vocabulary only: never log bodies, addresses, URLs or tokens. */
export async function recordOperation(kind: 'email' | 'embedding' | 'search' | 'api' | 'backup' | 'maintenance' | 'worker', status: 'ok' | 'failed' | 'retry' | 'accepted', duration?: number) {
    try { await env.DB!.prepare('INSERT INTO operations(id,kind,status,duration,created) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(), kind, status, duration == null ? null : Math.round(duration), Date.now()).run(); }
    catch { console.error(JSON.stringify({ event: 'operation_log_unavailable', kind })); }
}
