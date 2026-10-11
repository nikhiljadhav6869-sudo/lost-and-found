import { env } from 'cloudflare:workers';
import { auth } from '../../../lib/auth';
import { match, categories, type Matchable } from '../../../lib/matching';
import { cleanImage } from '../../../lib/images';
import { z } from 'zod';
import { ensureDemo } from '../../../lib/demo';
import { boundedBody } from '../../../lib/body';
export const dynamic = 'force-dynamic';
type Row = Record<string, any>;
const db = () => env.DB!;
const one = (sql: string, ...p: any[]) => db().prepare(sql).bind(...p).first<Row>();
const all = async (sql: string, ...p: any[]) => (await db().prepare(sql).bind(...p).all<Row>()).results;
const run = (sql: string, ...p: any[]) => db().prepare(sql).bind(...p).run();
const id = () => crypto.randomUUID();
const now = () => Date.now();
function fail(message: string, status = 400): never { throw Object.assign(new Error(message), { status }); }
;
const notify = (u: string, body: string, link: string) => db().prepare('INSERT INTO notifications(id,userId,body,link,created) VALUES(?,?,?,?,?)').bind(id(), u, body, link, now());
async function limit(key: string, max = 30) { const k = key + ':' + Math.floor(now() / 60000); const r = await one('INSERT INTO limits(key,count) VALUES(?,1) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count', k); if (r!.count > max)
    fail('Please slow down and try again in a minute.', 429); }
async function current(req: Request) { const s = await auth(new URL(req.url).origin).api.getSession({ headers: req.headers }); return s?.user ?? null; }
const publicReport = (r: Row): Row => { const { privateDetails, ...safe } = r; return { ...safe, images: JSON.parse(r.images) }; };
async function blocked(a: string, b: string) { return !!await one('SELECT 1 FROM blocks WHERE (userId=? AND blocked=?) OR (userId=? AND blocked=?)', a, b, b, a); }
const reportSchema = z.object({ type: z.enum(['lost', 'found']), title: z.string().trim().min(3).max(100), category: z.string().refine(x => categories.includes(x)), description: z.string().trim().min(10).max(2000), colour: z.string().trim().max(50), brand: z.string().trim().max(60), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(x => Number.isFinite(Date.parse(x)) && x <= new Date().toISOString().slice(0, 10)), location: z.string().trim().min(2).max(100), privateDetails: z.string().trim().max(2000), images: z.array(z.string().max(150)).max(5) });
async function suggestions(r: Row) { const candidates = await all('SELECT * FROM reports WHERE type!=? AND hidden=0 AND demo=? AND status IN (\'Open\',\'Claim Pending\') ORDER BY created DESC LIMIT 1000', r.type, r.demo); return candidates.map(b => ({ report: publicReport(b), ...match(r as Matchable, b as Matchable) })).filter(m => m.score >= 40).sort((a, b) => b.score - a.score).slice(0, 8); }
async function handle(req: Request) {
    const url = new URL(req.url), path = url.pathname.replace(/^\/api\//, '').split('/'), method = req.method;
    if (method !== 'GET') {
        if (req.headers.get('origin') !== url.origin)
            fail('Request origin could not be verified.', 403);
        if (Number(req.headers.get('content-length') || 0) > 6 * 1024 * 1024)
            fail('Request is too large.', 413);
    }
    if (path[0] === 'media' && method === 'GET') {
        const key = path[1];
        if (!/^[a-f0-9-]+\.(jpg|png|webp)$/.test(key))
            fail('Image not found.', 404);
        const meta = await one('SELECT owner FROM uploads WHERE id=?', key);
        if (!meta)
            fail('Image not found.', 404);
        const published = await one('SELECT id FROM reports WHERE hidden=0 AND images LIKE ?', `%/api/media/${key}%`);
        if (!published && (await current(req))?.id !== meta.owner)
            fail('Image not found.', 404);
        const object = await env.BUCKET!.get(key);
        if (!object)
            fail('Image not found.', 404);
        return new Response(object.body, { headers: { 'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream', 'Cache-Control': 'private, max-age=0', 'X-Content-Type-Options': 'nosniff' } });
    }
    if (['reports', 'stats'].includes(path[0]) && method === 'GET' && (env as unknown as Row).SEED_DEMO !== 'false')
        await ensureDemo();
    if (path[0] === 'reports' && method === 'GET') {
        if (path[1]) {
            const r = await one('SELECT * FROM reports WHERE id=? AND hidden=0', path[1]);
            if (!r)
                fail('This report is unavailable.', 404);
            return { report: publicReport(r!), matches: await suggestions(r!) };
        }
        const clauses = ['hidden=0'];
        const values: any[] = [];
        for (const field of ['type', 'category'])
            if (url.searchParams.get(field)) {
                clauses.push(`${field}=?`);
                values.push(url.searchParams.get(field));
            }
        for (const field of ['q', 'location'])
            if (url.searchParams.get(field)) {
                clauses.push(field === 'q' ? '(title LIKE ? OR description LIKE ? OR brand LIKE ?)' : 'location LIKE ?');
                const v = '%' + url.searchParams.get(field)!.slice(0, 100) + '%';
                values.push(v);
                if (field === 'q')
                    values.push(v, v);
            }
        if (url.searchParams.get('since')) {
            clauses.push('date>=?');
            values.push(url.searchParams.get('since'));
        }
        if (url.searchParams.get('until')) {
            clauses.push('date<=?');
            values.push(url.searchParams.get('until'));
        }
        if (url.searchParams.get('status')) {
            clauses.push('status=?');
            values.push(url.searchParams.get('status'));
        }
        const sort = url.searchParams.get('sort') === 'oldest' ? 'created ASC' : url.searchParams.get('sort') === 'title' ? 'title ASC' : 'created DESC';
        const page = Math.max(0, Math.min(10000, Number(url.searchParams.get('page')) || 0));
        const rows = await all(`SELECT * FROM reports WHERE ${clauses.join(' AND ')} ORDER BY ${sort} LIMIT 24 OFFSET ?`, ...values, page * 24);
        return { items: rows.map(publicReport), total: (await one(`SELECT count(*) AS n FROM reports WHERE ${clauses.join(' AND ')}`, ...values))!.n };
    }
    if (path[0] === 'stats' && method === 'GET')
        return { open: (await one('SELECT count(*) AS n FROM reports WHERE demo=0 AND hidden=0 AND status IN (\'Open\',\'Claim Pending\')'))!.n, returned: (await one('SELECT count(*) AS n FROM reports WHERE demo=0 AND hidden=0 AND status=\'Returned\''))!.n, demo: (await one('SELECT count(*) AS n FROM reports WHERE demo=1 AND hidden=0'))!.n, happy: await all('SELECT r.category, r.date FROM claims c JOIN reports r ON r.id=c.reportId WHERE c.status=\'Returned\' AND c.finderConsent=1 AND c.claimantConsent=1 AND r.hidden=0 AND r.demo=0 ORDER BY c.created DESC LIMIT 12') };
    const u = await current(req);
    if (path[0] === 'me' && method === 'GET')
        return { user: u ? { id: u.id, name: u.name, admin: ((env as unknown as Row).ADMIN_USER_IDS || '').split(',').map((s: string) => s.trim().toLowerCase()).includes(u.id.toLowerCase()) } : null };
    if (!u)
        fail('Please sign in to continue.', 401);
    const user = u!;
    const admin = ((env as unknown as Row).ADMIN_USER_IDS || '').split(',').map((s: string) => s.trim().toLowerCase()).includes(user.id.toLowerCase());
    if (method !== 'GET')
        await limit(user.id + ':' + path[0], path[0] === 'reports' ? 10 : 30);
    if (path[0] === 'upload' && method === 'POST') {
        const bytes = await boundedBody(req, 6 * 1024 * 1024);
        const bounded = new Request(req.url, { method: 'POST', headers: req.headers, body: bytes });
        const form = await bounded.formData(), file = form.get('file');
        if (!(file instanceof File))
            fail('Choose an image.');
        const f = file as File;
        let cleaned: Uint8Array;
        try {
            cleaned = cleanImage(new Uint8Array(await f.arrayBuffer()), f.type);
        }
        catch (e) {
            fail((e as Error).message);
        }
        const ext = f.type === 'image/jpeg' ? 'jpg' : f.type === 'image/png' ? 'png' : 'webp', key = id() + '.' + ext;
        await env.BUCKET!.put(key, cleaned!, { httpMetadata: { contentType: f.type } });
        await run('INSERT INTO uploads(id,owner,created) VALUES(?,?,?)', key, user.id, now());
        return { url: '/api/media/' + key };
    }
    if (path[0] === 'dashboard' && method === 'GET')
        return { reports: (await all('SELECT * FROM reports WHERE owner=? ORDER BY created DESC', user.id)).map(r => ({ ...publicReport(r), privateDetails: r.privateDetails })), saved: (await all('SELECT r.* FROM saved s JOIN reports r ON r.id=s.reportId WHERE s.userId=? AND r.hidden=0', user.id)).map(publicReport), claims: await all('SELECT c.*,r.title,r.owner,r.images,r.status AS reportStatus FROM claims c JOIN reports r ON r.id=c.reportId WHERE c.claimant=? OR r.owner=? ORDER BY c.created DESC', user.id, user.id), notifications: await all('SELECT * FROM notifications WHERE userId=? ORDER BY created DESC LIMIT 100', user.id), blocks: await all('SELECT b.blocked,u.name FROM blocks b LEFT JOIN user u ON u.id=b.blocked WHERE b.userId=?', user.id) };
    let b: Row = {};
    if (method !== 'GET' && method !== 'DELETE')
        try {
            const raw = new TextDecoder().decode(await boundedBody(req, 20000));
            if (raw.length > 20000)
                fail('Request is too large.', 413);
            b = JSON.parse(raw || '{}');
        }
        catch (e) {
            if ((e as any).status)
                throw e;
            fail('Please send valid form data.');
        }
    if (path[0] === 'notifications' && method === 'POST') {
        await run('UPDATE notifications SET read=1 WHERE userId=?', user.id);
        return { ok: true };
    }
    if (path[0] === 'blocks' && method === 'POST') {
        const target = z.string().min(1).max(100).parse(b.userId);
        if (target === user.id)
            fail('You cannot block yourself.');
        if (b.remove)
            await run('DELETE FROM blocks WHERE userId=? AND blocked=?', user.id, target);
        else
            await run('INSERT OR IGNORE INTO blocks(userId,blocked) VALUES(?,?)', user.id, target);
        return { ok: true };
    }
    if (path[0] === 'reports' && ['POST', 'PATCH', 'DELETE'].includes(method)) {
        const existing = path[1] ? await one('SELECT * FROM reports WHERE id=?', path[1]) : null;
        if (path[1] && (!existing || existing.owner !== user.id))
            fail('You cannot change this report.', 403);
        if (method === 'DELETE') {
            if (['Return Arranged', 'Returned'].includes(existing!.status))
                fail('Reports with arranged or completed returns cannot be deleted.');
            const result = await run('DELETE FROM reports WHERE id=? AND owner=? AND status IN (\'Open\',\'Claim Pending\',\'Closed\')', path[1], user.id);
            if (!result.meta.changes)
                fail('This report changed before it could be deleted. Refresh and try again.', 409);
            return { ok: true };
        }
        if (existing?.hidden)
            fail('This report is under moderation. Contact the site operator.', 403);
        if (b.action === 'close') {
            if (!existing || !['Open', 'Claim Pending'].includes(existing.status))
                fail('This report cannot be closed in its current state.');
            const result = await db().batch([db().prepare('UPDATE reports SET status=\'Closed\' WHERE id=? AND owner=? AND hidden=0 AND status IN (\'Open\',\'Claim Pending\')').bind(existing.id, user.id), db().prepare('UPDATE claims SET status=\'Rejected\' WHERE reportId=? AND status=\'Pending\' AND EXISTS(SELECT 1 FROM reports WHERE id=? AND status=\'Closed\')').bind(existing.id, existing.id)]);
            if (!result[0].meta.changes)
                fail('This report changed before it could be closed. Refresh and try again.', 409);
            return { ok: true };
        }
        if (existing && !['Open', 'Claim Pending'].includes(existing.status))
            fail('Only open reports can be edited.');
        const data = reportSchema.parse(b);
        if (existing && data.type !== existing.type)
            fail('Report type cannot change after publication.');
        const publicText = [data.title, data.description, data.location].join(' ');
        if (/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(publicText) || /(?:\d[\s()-]*){9,}/.test(publicText))
            fail('Keep email addresses, phone and document numbers out of public fields.');
        for (const image of data.images) {
            const key = image.replace('/api/media/', '');
            if (image !== `/api/media/${key}` || !(await one('SELECT id FROM uploads WHERE id=? AND owner=?', key, user.id)))
                fail('Use your own uploaded images.');
        }
        const reportId = existing?.id || id();
        const fields = ['type', 'title', 'category', 'description', 'colour', 'brand', 'date', 'location', 'privateDetails', 'images'];
        const vals = fields.map(k => k === 'images' ? JSON.stringify(data.images) : (data as Row)[k]);
        if (existing) {
            const result = await run(`UPDATE reports SET ${fields.map(k => k + '=?').join(',')} WHERE id=? AND owner=? AND hidden=0 AND status IN ('Open','Claim Pending')`, ...vals, reportId, user.id);
            if (!result.meta.changes)
                fail('This report changed before it could be edited. Refresh and try again.', 409);
        }
        else
            await run(`INSERT INTO reports(id,owner,${fields.join(',')},created) VALUES(${Array(13).fill('?').join(',')})`, reportId, user.id, ...vals, now());
        const r = await one('SELECT * FROM reports WHERE id=?', reportId);
        const matches = await suggestions(r!);
        const notices: any[] = [];
        for (const m of matches) {
            if (m.report.owner !== user.id && !await blocked(user.id, m.report.owner)) {
                notices.push(notify(m.report.owner, `A possible match for your report: ${data.title}`, `/?report=${reportId}`));
            }
        }
        if (matches.length)
            notices.push(notify(user.id, `${matches.length} possible matches for ${data.title}`, `/?report=${reportId}`));
        if (notices.length)
            await db().batch(notices);
        return { id: reportId };
    }
    if (path[0] === 'save' && method === 'POST') {
        const rid = z.string().parse(b.reportId);
        if (!await one('SELECT id FROM reports WHERE id=? AND hidden=0', rid))
            fail('Report unavailable.', 404);
        if (b.saved)
            await run('INSERT OR IGNORE INTO saved(userId,reportId) VALUES(?,?)', user.id, rid);
        else
            await run('DELETE FROM saved WHERE userId=? AND reportId=?', user.id, rid);
        return { ok: true };
    }
    if (path[0] === 'flags' && method === 'POST') {
        const reason = z.string().trim().min(10).max(1000).parse(b.reason);
        if (!await one('SELECT id FROM reports WHERE id=?', b.reportId))
            fail('Report unavailable.', 404);
        await run('INSERT INTO flags(id,userId,reportId,reason,created) VALUES(?,?,?,?,?)', id(), user.id, b.reportId, reason, now());
        return { ok: true };
    }
    if (path[0] === 'admin') {
        if (!admin)
            fail('Administrator access required.', 403);
        if (method === 'GET')
            return { flags: await all('SELECT f.*,r.title,r.hidden FROM flags f JOIN reports r ON r.id=f.reportId ORDER BY f.created DESC') };
        const f = await one('SELECT * FROM flags WHERE id=?', b.id);
        if (!f)
            fail('Flag unavailable.', 404);
        if (!['hide', 'restore', 'dismiss'].includes(b.action))
            fail('Invalid moderation action.');
        const actions = [db().prepare('UPDATE flags SET status=? WHERE id=?').bind(b.action, b.id)];
        if (b.action !== 'dismiss')
            actions.push(db().prepare('UPDATE reports SET hidden=? WHERE id=?').bind(b.action === 'hide' ? 1 : 0, f!.reportId));
        await db().batch(actions);
        return { ok: true };
    }
    if (path[0] === 'claims') {
        if (!path[1] && method === 'POST') {
            const evidence = z.string().trim().min(15).max(2000).parse(b.evidence), r = await one('SELECT * FROM reports WHERE id=? AND hidden=0', b.reportId);
            if (!r || r.type !== 'found' || !['Open', 'Claim Pending'].includes(r.status))
                fail('This item is not accepting claims.');
            if (r!.demo)
                fail('Demo reports illustrate discovery. Create a real found report to test claims.');
            if (r!.owner === user.id)
                fail('You cannot claim your own report.');
            if (await blocked(user.id, r!.owner))
                fail('This conversation is unavailable.', 403);
            if (await one('SELECT id FROM claims WHERE reportId=? AND claimant=? AND status IN (\'Pending\',\'Approved\',\'Returned\')', r!.id, user.id))
                fail('You already have an active claim for this item.');
            const cid = id();
            await db().batch([db().prepare('INSERT INTO claims(id,reportId,claimant,evidence,created) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM reports WHERE id=? AND status IN (\'Open\',\'Claim Pending\'))').bind(cid, r!.id, user.id, evidence, now(), r!.id), db().prepare('UPDATE reports SET status=\'Claim Pending\' WHERE id=? AND status=\'Open\'').bind(r!.id), notify(r!.owner, 'A new ownership claim needs your review.', '/?claim=' + cid)]);
            return { id: cid };
        }
        const c = await one('SELECT c.*,r.owner,r.title,r.hidden,r.status AS reportStatus FROM claims c JOIN reports r ON r.id=c.reportId WHERE c.id=?', path[1]);
        if (!c || (c.claimant !== user.id && c.owner !== user.id))
            fail('Conversation unavailable.', 403);
        if (method === 'GET')
            return { claim: c, messages: await all('SELECT id,sender,body,created FROM messages WHERE claimId=? ORDER BY created,id', c!.id), blocked: await blocked(user.id, user.id === c!.owner ? c!.claimant : c!.owner) };
        // A participant may always stop sharing their completed return, including
        // when the other participant blocks them or moderation hides the listing.
        if (method === 'POST' && b.action === 'consent' && b.value === false) {
            if (c!.status !== 'Returned')
                fail('Sharing is available after a completed return.');
            const field = user.id === c!.owner ? 'finderConsent' : 'claimantConsent';
            await run(`UPDATE claims SET ${field}=0 WHERE id=? AND status='Returned'`, c!.id);
            return { ok: true };
        }
        if (await blocked(c!.owner, c!.claimant))
            fail('Unblock this participant before continuing.', 403);
        if (c!.hidden)
            fail('This listing is under moderation.', 403);
        const other = user.id === c!.owner ? c!.claimant : c!.owner;
        if (path[2] === 'messages' && method === 'POST') {
            if (!['Pending', 'Approved'].includes(c!.status))
                fail('This conversation is closed.');
            const body = z.string().trim().min(1).max(2000).parse(b.body);
            await db().batch([db().prepare('INSERT INTO messages(id,claimId,sender,body,created) VALUES(?,?,?,?,?)').bind(id(), c!.id, user.id, body, now()), notify(other, 'You have a new private message.', '/?claim=' + c!.id)]);
            return { ok: true };
        }
        if (method === 'POST') {
            if (b.action === 'approve') {
                if (user.id !== c!.owner || c!.status !== 'Pending')
                    fail('Only the finder can approve a pending claim.', 403);
                await db().batch([db().prepare('UPDATE claims SET status=\'Approved\' WHERE id=? AND status=\'Pending\' AND EXISTS(SELECT 1 FROM reports WHERE id=? AND status IN (\'Open\',\'Claim Pending\'))').bind(c!.id, c!.reportId), db().prepare('UPDATE reports SET status=\'Return Arranged\' WHERE id=? AND EXISTS(SELECT 1 FROM claims WHERE id=? AND status=\'Approved\')').bind(c!.reportId, c!.id)]);
                if ((await one('SELECT status FROM claims WHERE id=?', c!.id))!.status !== 'Approved')
                    fail('Another claim has already been approved.', 409);
            }
            else if (b.action === 'reject' || b.action === 'withdraw') {
                if ((b.action === 'reject' && user.id !== c!.owner) || (b.action === 'withdraw' && user.id !== c!.claimant) || c!.status !== 'Pending')
                    fail('This action is unavailable.', 403);
                await db().batch([db().prepare('UPDATE claims SET status=? WHERE id=? AND status=\'Pending\'').bind(b.action === 'reject' ? 'Rejected' : 'Withdrawn', c!.id), db().prepare('UPDATE reports SET status=\'Open\' WHERE id=? AND status=\'Claim Pending\' AND NOT EXISTS(SELECT 1 FROM claims WHERE reportId=? AND status=\'Pending\')').bind(c!.reportId, c!.reportId)]);
            }
            else if (b.action === 'confirm') {
                if (c!.status !== 'Approved')
                    fail('Only an arranged return can be confirmed.');
                const field = user.id === c!.owner ? 'finderConfirmed' : 'claimantConfirmed';
                await db().batch([db().prepare(`UPDATE claims SET ${field}=1 WHERE id=? AND status='Approved'`).bind(c!.id), db().prepare('UPDATE claims SET status=\'Returned\' WHERE id=? AND finderConfirmed=1 AND claimantConfirmed=1').bind(c!.id), db().prepare('UPDATE reports SET status=\'Returned\' WHERE id=? AND EXISTS(SELECT 1 FROM claims WHERE id=? AND status=\'Returned\')').bind(c!.reportId, c!.id), db().prepare('UPDATE claims SET status=\'Rejected\' WHERE reportId=? AND status=\'Pending\' AND EXISTS(SELECT 1 FROM reports WHERE id=? AND status=\'Returned\')').bind(c!.reportId, c!.reportId)]);
            }
            else if (b.action === 'consent') {
                if (c!.status !== 'Returned')
                    fail('Sharing is available after a completed return.');
                const field = user.id === c!.owner ? 'finderConsent' : 'claimantConsent';
                await run(`UPDATE claims SET ${field}=? WHERE id=?`, b.value === true ? 1 : 0, c!.id);
            }
            else
                fail('Unknown claim action.');
            await db().batch([notify(other, `Claim update: ${b.action === 'confirm' ? 'a handover confirmation was received' : b.action}.`, '/?claim=' + c!.id)]);
            return { ok: true };
        }
    }
    fail('This action is unavailable.', 404);
}
async function route(req: Request) { try {
    const result = await handle(req);
    return result instanceof Response ? result : Response.json(result, { headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
catch (e) {
    const err = e as Error & {
        status?: number;
    };
    return Response.json({ error: e instanceof z.ZodError ? e.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') : err.status ? err.message : 'Something went wrong. Please try again.' }, { status: e instanceof z.ZodError ? 400 : err.status || 500 });
} }
export const GET = route;
export const POST = route;
export const PATCH = route;
export const DELETE = route;
