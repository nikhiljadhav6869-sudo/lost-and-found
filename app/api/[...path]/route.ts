import { MAX_UPLOAD_BODY_BYTES } from '../../../lib/photo-limits.mjs';
import { env } from 'cloudflare:workers';
import { auth, authCapabilities } from '../../../lib/auth';
import { match, matchDifferences, categories, isStrongMatch, type Matchable } from '../../../lib/matching';
import { multimodal, rankingWeights, MODEL_VERSION, cosine, vector } from '../../../lib/intelligence';
import { featureRoute, intelligenceAvailable } from '../../../lib/features';
import { recordOperation } from '../../../lib/operations';
import { cleanImage } from '../../../lib/images';
import { z } from 'zod';
import { ensureDemo } from '../../../lib/demo';
import { boundedBody } from '../../../lib/body';
import { maintain } from '../../../lib/maintenance';
import {workspaceRoute,requireWorkspace,canStaff,digest} from '../../../lib/workspaces';
import {productInput,productDetails,canonicalProductURL} from '../../../lib/product-data';
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
const publicReport = (r: Row): Row => { const { privateDetails, textVector, imageVector, model, revision, matchRevision, ...safe } = r; return { ...safe, images: JSON.parse(r.images),productData:r.productData?JSON.parse(r.productData):null }; };
async function blocked(a: string, b: string) { return !!await one('SELECT 1 FROM blocks WHERE (userId=? AND blocked=?) OR (userId=? AND blocked=?)', a, b, b, a); }
const reportSchema = z.object({ productData:productDetails.nullable().optional(),referenceImage:z.coerce.boolean().default(false),lostTime:z.string().regex(/^$|^([01][0-9]|2[0-3]):[0-5][0-9]$/).default(''), workspaceId:z.string().uuid().nullable().optional(), submissionId:z.string().uuid().optional(), type: z.enum(['lost', 'found']), title: z.string().trim().min(3).max(100), category: z.string().refine(x => categories.includes(x)), description: z.string().trim().max(2000), colour: z.string().trim().max(50), brand: z.string().trim().max(60), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(x => Number.isFinite(Date.parse(x)) && new Date(x).toISOString().slice(0, 10) === x && x <= new Date().toISOString().slice(0, 10)), location: z.string().trim().min(2).max(100), privateDetails: z.string().trim().max(2000), images: z.array(z.string().max(150)).max(5) }).refine(data => data.type === 'found' || data.description.length >= 10, { path: ['description'], message: 'Describe your lost item in at least 10 characters.' });
async function matchingReports(r: Row) {
    if (r.hidden || !['Open', 'Claim Pending'].includes(r.status)) return [];
    const sourceEmbedding = await one('SELECT * FROM embeddings WHERE reportId=? AND revision=?', r.id, r.matchRevision);
    const candidates = await all(`SELECT candidate.*, e.textVector,e.imageVector,e.model,e.revision FROM reports candidate LEFT JOIN embeddings e ON e.reportId=candidate.id AND e.revision=candidate.matchRevision
        WHERE candidate.workspaceId IS ? AND candidate.type!=? AND candidate.owner!=? AND candidate.hidden=0 AND candidate.demo=? AND candidate.status IN ('Open','Claim Pending')
        AND NOT EXISTS(SELECT 1 FROM blocks WHERE (userId=? AND blocked=candidate.owner) OR (userId=candidate.owner AND blocked=?))
        ORDER BY candidate.created DESC LIMIT 1000`, r.workspaceId||null, r.type, r.owner, r.demo, r.owner, r.owner);
    return candidates.map(b => {
        const result = multimodal(r as Matchable, b as Matchable, sourceEmbedding as any, b.model ? b as any : null, rankingWeights((env as unknown as Row).MATCH_WEIGHTS));
        return { report: publicReport(b), revision: b.matchRevision, ...result, differences:matchDifferences(r as Matchable,b as Matchable), strongMatch: isStrongMatch(result.score) };
    }).filter(m => m.score >= 40).sort((a, b) => b.score - a.score);
}
async function suggestions(r: Row) { return (await matchingReports(r)).slice(0, 8); }

// Unique report pairs and event IDs make notifications idempotent even when
// both reports are edited at once. Each batch inserts both recipients or none.
export async function notifyStrongMatches(r: Row) {
    if (r.demo || r.hidden || !['Open', 'Claim Pending'].includes(r.status)) return;
    const snapshots = ['type', 'owner', 'category', 'title', 'description', 'colour', 'brand', 'date', 'location', 'matchRevision','workspaceId'];
    for (const m of (await matchingReports(r)).filter(m => m.strongMatch)) {
        const other = m.report, eventId = id(), created = now();
        const [reportA, reportB] = [r.id, other.id].sort();
        const snapshotGuard = snapshots.map(field => `a.${field} IS ? AND b.${field} IS ?`).join(' AND ');
        const snapshotValues = snapshots.flatMap(field => [r[field], field === 'matchRevision' ? m.revision : other[field]]);
        const reserve = db().prepare(`INSERT INTO match_alerts(id,reportA,reportB,score,created)
            SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM reports a JOIN reports b ON b.id=?
                WHERE a.id=? AND a.owner!=b.owner AND a.type!=b.type
                AND a.hidden=0 AND b.hidden=0 AND a.demo=0 AND b.demo=0
                AND a.status IN ('Open','Claim Pending') AND b.status IN ('Open','Claim Pending')
                AND NOT EXISTS(SELECT 1 FROM blocks WHERE (userId=a.owner AND blocked=b.owner) OR (userId=b.owner AND blocked=a.owner))
                AND ${snapshotGuard}) ON CONFLICT(reportA,reportB) DO NOTHING`)
            .bind(eventId, reportA, reportB, m.score, created, other.id, r.id, ...snapshotValues);
        const notice = (recipient: string, title: string, target: Row) => db().prepare(`INSERT INTO notifications(id,userId,body,link,created)
            SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM match_alerts WHERE id=?) AND NOT EXISTS(SELECT 1 FROM preferences WHERE userId=? AND matches=0)`)
            .bind(id(), recipient, `Strong match — High Similarity for "${title}": "${target.title}". Review the details and verify ownership.`, '/?report=' + target.id, created, eventId, recipient);
        await db().batch([reserve, notice(r.owner, r.title, other), notice(other.owner, other.title, r)]);
    }
}
async function handle(req: Request) {
    const url = new URL(req.url), path = url.pathname.replace(/^\/api\//, '').split('/'), method = req.method;
    if (method !== 'GET') {
        if (req.headers.get('origin') !== url.origin)
            fail('Request origin could not be verified.', 403);
        if (Number(req.headers.get('content-length') || 0) > (path[0] === 'upload' ? MAX_UPLOAD_BODY_BYTES : 6 * 1024 * 1024))
            fail('Request is too large.', 413);
    }
    if (path[0] === 'health' && method === 'GET') { await one('SELECT 1'); return { ok: true }; }
    if (path[0] === 'config' && method === 'GET')
        return { auth: authCapabilities(), intelligence: await intelligenceAvailable(db()) };
    const viewer=await current(req);
    const platform=!!viewer&&((env as unknown as Row).ADMIN_USER_IDS||'').split(',').map((s:string)=>s.trim()).includes(viewer.id);
    if (path[0] === 'media' && method === 'GET') {
        const key = path[1];
        if (!/^[a-f0-9-]+\.(jpg|png|webp)$/.test(key))
            fail('Image not found.', 404);
        const meta = await one('SELECT owner FROM uploads WHERE id=?', key);
        if (!meta)
            fail('Image not found.', 404);
        const published = await one('SELECT id FROM reports WHERE hidden=0 AND (workspaceId IS NULL OR ? OR EXISTS(SELECT 1 FROM workspace_members m WHERE m.workspaceId=reports.workspaceId AND m.userId=?)) AND images LIKE ?',platform?1:0,viewer?.id||'', `%/api/media/${key}%`);
        if (!published && viewer?.id !== meta.owner)
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
            await requireWorkspace(db(),r!.workspaceId,viewer?.id,platform);
            return { report: publicReport(r!), matches: await suggestions(r!) };
        }
        const wid=url.searchParams.get('workspace')||null;await requireWorkspace(db(),wid,viewer?.id,platform);
        const clauses = ['hidden=0', 'demo=?','workspaceId IS ?'];
        const values: any[] = [url.searchParams.get('demo') === '1' ? 1 : 0,wid];
        for (const field of ['type', 'category', 'colour'])
            if (url.searchParams.get(field)) {
                clauses.push(`${field}=? COLLATE NOCASE`);
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
        const page = Math.max(0, Math.min(10000, Math.floor(Number(url.searchParams.get('page')) || 0)));
        const rows = await all(`SELECT * FROM reports WHERE ${clauses.join(' AND ')} ORDER BY ${sort} LIMIT 24 OFFSET ?`, ...values, page * 24);
        return { items: rows.map(publicReport), total: (await one(`SELECT count(*) AS n FROM reports WHERE ${clauses.join(' AND ')}`, ...values))!.n };
    }
    if (path[0] === 'stats' && method === 'GET') {
        const [counts,happy] = await Promise.all([
            one("SELECT coalesce(sum(demo=0 AND status IN ('Open','Claim Pending')),0) AS open,coalesce(sum(demo=0 AND status='Returned'),0) AS returned,coalesce(sum(demo=1),0) AS demo FROM reports WHERE hidden=0 AND workspaceId IS NULL"),
            all("SELECT r.category,r.date FROM claims c JOIN reports r ON r.id=c.reportId WHERE c.status='Returned' AND c.finderConsent=1 AND c.claimantConsent=1 AND r.hidden=0 AND r.demo=0 AND r.workspaceId IS NULL ORDER BY c.created DESC LIMIT 12")
        ]);
        return {...counts,happy};
    }
    const u = viewer;
    if (path[0] === 'me' && method === 'GET')
        return { user: u ? { id: u.id, name: u.name, email: u.email, emailVerified: u.emailVerified, admin: ((env as unknown as Row).ADMIN_USER_IDS || '').split(',').map((s: string) => s.trim()).includes(u.id) } : null };
    if (!u)
        fail('Please sign in to continue.', 401);
    const user = u!;
    if(req.headers.has('X-Expected-User')&&req.headers.get('X-Expected-User')!==user.id)fail('Sign in to the account that saved this report.',401);
    const admin = ((env as unknown as Row).ADMIN_USER_IDS || '').split(',').map((s: string) => s.trim()).includes(user.id);
    if (method !== 'GET')
        await limit(user.id + ':' + path[0], path[0] === 'reports' ? 10 : path[0] === 'smart-search' ? 5 : 30);
    if (path[0] === 'upload' && method === 'POST') {
        const bytes = await boundedBody(req, MAX_UPLOAD_BODY_BYTES);
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
    if (path[0] === 'dashboard' && method === 'GET'){
        const visible=(alias:string)=>`(${alias}.workspaceId IS NULL OR ${admin?1:0} OR EXISTS(SELECT 1 FROM workspace_members m WHERE m.workspaceId=${alias}.workspaceId AND m.userId=?))`;
        return {reports:(await all('SELECT r.* FROM reports r WHERE owner=? AND '+visible('r')+' ORDER BY created DESC',user.id,user.id)).map(r=>({...publicReport(r),privateDetails:r.privateDetails})),
        saved:(await all('SELECT r.* FROM saved s JOIN reports r ON r.id=s.reportId WHERE s.userId=? AND r.hidden=0 AND '+visible('r'),user.id,user.id)).map(publicReport),
        claims:await all('SELECT c.*,r.title,r.owner,r.images,r.status AS reportStatus FROM claims c JOIN reports r ON r.id=c.reportId WHERE (c.claimant=? OR r.owner=?) AND '+visible('r')+' ORDER BY c.created DESC',user.id,user.id,user.id),
        notifications:await all(`SELECT n.* FROM notifications n WHERE n.userId=? AND NOT EXISTS(SELECT 1 FROM reports r WHERE r.workspaceId IS NOT NULL AND (n.link='/?report='||r.id OR n.link IN (SELECT '/?claim='||c.id FROM claims c WHERE c.reportId=r.id)) AND NOT ${visible('r')}) ORDER BY n.created DESC LIMIT 100`,user.id,user.id),
        blocks:await all('SELECT b.blocked,u.name FROM blocks b LEFT JOIN user u ON u.id=b.blocked WHERE b.userId=?',user.id)};
    }
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
    if(path[0]==='product-extract'&&method==='POST'){
        await limit('product-extract:'+user.id,5);
        const input=productInput.parse(b),extract=(env as unknown as Row).extractCatalogProduct;
        if(typeof extract!=='function')fail('Product extraction is unavailable on this host. Enter details manually or upload a screenshot.',503);
        let result:Row;try{result=await extract(input);}catch(e){fail((e as Error).message,400);}
        if(result!.image){
            try{const image=result!.image,bytes=await cleanImage(new Uint8Array(image.bytes),image.type),ext=image.type==='image/jpeg'?'jpg':image.type==='image/png'?'png':'webp',key=id()+'.'+ext;
                await env.BUCKET!.put(key,bytes,{httpMetadata:{contentType:image.type}});await run('INSERT INTO uploads(id,owner,created) VALUES(?,?,?)',key,user.id,now());result!.product.product_image='/api/media/'+key;
            }catch{result!.warnings.push('The reference image could not be saved. You can continue without it.');}
        }
        return {product:productDetails.parse(result!.product),warnings:result!.warnings,method:result!.method};
    }
    const workspace=await workspaceRoute(db(),path,method,b,user,admin);if(workspace!==null)return workspace;
    const feature = await featureRoute(db(), path, method, b, user, url, publicReport, admin);
    if (feature !== null) return feature;
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
        if(existing)await requireWorkspace(db(),existing.workspaceId,user.id,admin);
        if(existing&&await one('SELECT 1 FROM custody WHERE reportId=?',existing.id))fail('College staff manage this item after receiving it.',409);
        if (method === 'DELETE') {
            if (existing!.status === 'Return Arranged')
                fail('Complete or cancel the arranged return before deleting this report.');
            const deletable = "SELECT id FROM reports WHERE id=? AND owner=? AND status IN ('Open','Claim Pending','Closed','Returned') AND NOT EXISTS(SELECT 1 FROM custody WHERE reportId=reports.id)";
            const result = await db().batch([
                db().prepare(`DELETE FROM notifications WHERE (link='/?report='||? OR link IN (SELECT '/?claim='||id FROM claims WHERE reportId=?)) AND EXISTS(${deletable})`).bind(path[1],path[1],path[1],user.id),
                db().prepare(`DELETE FROM reports WHERE id IN (${deletable})`).bind(path[1],user.id),
            ]);
            if (!result[1].meta.changes)
                fail('This report changed before it could be deleted. Refresh and try again.', 409);
            return { ok: true };
        }
        if (existing?.hidden)
            fail('This report is under moderation. Contact the site operator.', 403);
        if (b.action === 'close') {
            if (!existing || !['Open', 'Claim Pending'].includes(existing.status))
                fail('This report cannot be closed in its current state.');
            const result = await db().batch([db().prepare('UPDATE reports SET status=\'Closed\' WHERE id=? AND owner=? AND hidden=0 AND status IN (\'Open\',\'Claim Pending\') AND NOT EXISTS(SELECT 1 FROM custody WHERE reportId=reports.id)').bind(existing.id, user.id), db().prepare('UPDATE claims SET status=\'Rejected\' WHERE reportId=? AND status=\'Pending\' AND EXISTS(SELECT 1 FROM reports WHERE id=? AND status=\'Closed\')').bind(existing.id, existing.id)]);
            if (!result[0].meta.changes)
                fail('This report changed before it could be closed. Refresh and try again.', 409);
            return { ok: true };
        }
        if (existing && !['Open', 'Claim Pending'].includes(existing.status))
            fail('Only open reports can be edited.');
        const data = reportSchema.parse(b);
        if(data.type!=='lost'&&(data.productData||data.referenceImage))fail('Product references belong on lost-item reports.');
        if(data.productData?.product_url){try{canonicalProductURL(data.productData.product_url);}catch{fail('Enter a public HTTPS product link without account credentials.');}}
        const requestHash=data.submissionId?await digest(JSON.stringify(data)):'';
        if(!existing&&data.submissionId){const receipt=await one('SELECT reportId,requestHash FROM report_submissions WHERE userId=? AND submissionId=?',user.id,data.submissionId);if(receipt){if(receipt.requestHash!==requestHash)fail('This submission was already used for different details.',409);return {id:receipt.reportId};}}

        await requireWorkspace(db(),data.workspaceId,user.id,admin);
        if(existing&&(existing.workspaceId||null)!==(data.workspaceId||null))fail('A published report cannot move between workspaces.');
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
        const fields = ['workspaceId','type', 'title', 'category', 'description', 'colour', 'brand', 'date', 'location', 'privateDetails', 'images','productData','referenceImage','lostTime'];
        const product=data.productData?{...data.productData,product_name:data.title,brand:data.brand,color:data.colour,description:data.description,product_url:data.productData.product_url?canonicalProductURL(data.productData.product_url):'',product_image:data.productData.product_image&&data.images.includes(data.productData.product_image)?data.productData.product_image:''}:null;
        const vals = fields.map(k => k === 'images' ? JSON.stringify(data.images) : k==='productData'?product?JSON.stringify(product):null:k==='referenceImage'?Number(data.referenceImage):(data as Row)[k]??null);
        const imageGuard = data.images.map(() => 'EXISTS(SELECT 1 FROM uploads u WHERE u.id=? AND u.owner=? AND NOT EXISTS(SELECT 1 FROM upload_cleanup q WHERE q.id=u.id))').join(' AND ') || '1';
        const imageParams = data.images.flatMap(image => [image.slice('/api/media/'.length), user.id]);
        if (existing) {
            const result = await run(`UPDATE reports SET ${fields.map(k => k + '=?').join(',')} WHERE id=? AND owner=? AND hidden=0 AND status IN ('Open','Claim Pending') AND NOT EXISTS(SELECT 1 FROM custody WHERE reportId=reports.id) AND ${imageGuard}`, ...vals, reportId, user.id, ...imageParams);
            if (!result.meta.changes)
                fail('This report changed before it could be edited. Refresh and try again.', 409);
        }
        else {
            if(data.submissionId){
                await db().batch([
                  db().prepare(`INSERT OR IGNORE INTO report_submissions(userId,submissionId,reportId,requestHash,created) SELECT ?,?,?,?,? WHERE ${imageGuard}`).bind(user.id,data.submissionId,reportId,requestHash,now(),...imageParams),
                  db().prepare(`INSERT INTO reports(id,owner,${fields.join(',')},created) SELECT ${Array(fields.length+3).fill('?').join(',')} WHERE EXISTS(SELECT 1 FROM report_submissions WHERE userId=? AND submissionId=? AND reportId=?)`).bind(reportId,user.id,...vals,now(),user.id,data.submissionId,reportId)
                ]);
                const receipt=await one('SELECT reportId,requestHash FROM report_submissions WHERE userId=? AND submissionId=?',user.id,data.submissionId);
                if(!receipt)fail('A photo expired before publication. Upload it again and retry.',409);
                if(receipt.requestHash!==requestHash)fail('This submission was already used for different details.',409);
                await notifyStrongMatches((await one('SELECT * FROM reports WHERE id=?',receipt.reportId))!);return {id:receipt.reportId};
            }
            const result = await run(`INSERT INTO reports(id,owner,${fields.join(',')},created) SELECT ${Array(fields.length+3).fill('?').join(',')} WHERE ${imageGuard}`, reportId, user.id, ...vals, now(), ...imageParams);
            if (!result.meta.changes) fail('A photo expired before publication. Upload it again and retry.', 409);
        }
        const r = await one('SELECT * FROM reports WHERE id=?', reportId);
        await notifyStrongMatches(r!);
        return { id: reportId };
    }
    if (path[0] === 'save' && method === 'POST') {
        const rid = z.string().parse(b.reportId);
        if (!await one('SELECT id FROM reports WHERE id=? AND hidden=0', rid))
            fail('Report unavailable.', 404);
        const target=await one('SELECT workspaceId FROM reports WHERE id=?',rid);await requireWorkspace(db(),target?.workspaceId,user.id,admin);
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
        const flagged=await one('SELECT workspaceId FROM reports WHERE id=?',b.reportId);await requireWorkspace(db(),flagged?.workspaceId,user.id,admin);
        await run('INSERT INTO flags(id,userId,reportId,reason,created) VALUES(?,?,?,?,?)', id(), user.id, b.reportId, reason, now());
        return { ok: true };
    }
    if (path[0] === 'admin') {
        if (!admin)
            fail('Administrator access required.', 403);
        if (path[1] === 'operations' && method === 'GET')
            return { storage: (env as unknown as Row).STORAGE_MODE || 'managed', auth: authCapabilities(), cleanup: await maintain(db(), env.BUCKET!), intelligence: await intelligenceAvailable(db()), jobs: await all('SELECT state,count(*) AS count FROM embedding_jobs GROUP BY state'), events: await all('SELECT kind,status,count(*) AS count,round(avg(duration)) AS averageMs FROM operations WHERE created>? GROUP BY kind,status',now()-86400000), users: await one('SELECT count(*) AS count FROM user'), activity: await all("SELECT category,count(*) AS count FROM reports WHERE demo=0 AND hidden=0 GROUP BY category ORDER BY count DESC"), resolution: await one("SELECT count(*) AS measuredReturns,round(avg(c.resolvedAt-r.created)/86400000.0,1) AS averageDays FROM claims c JOIN reports r ON r.id=c.reportId WHERE c.status='Returned' AND c.resolvedAt IS NOT NULL AND r.demo=0") };
        if (path[1] === 'users' && method === 'GET') { const page = Math.max(0,Math.min(10000,Math.floor(Number(url.searchParams.get('page'))||0))); return {items: await all('SELECT id,name,emailVerified,createdAt FROM user ORDER BY createdAt DESC LIMIT 25 OFFSET ?',page*25)}; }
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
            await requireWorkspace(db(),r!.workspaceId,user.id,admin);
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
            if(!await one('SELECT 1 FROM claims WHERE id=?',cid))fail('This report changed before your claim was submitted.',409);
            await run("INSERT INTO notifications(id,userId,body,link,created) SELECT lower(hex(randomblob(16))),m.userId,'A new ownership claim needs your review.',?,? FROM workspace_members m JOIN custody k ON k.reportId=? WHERE m.workspaceId=? AND m.role IN ('staff','admin') AND m.userId!=? AND m.userId!=?",'/?claim='+cid,now(),r!.id,r!.workspaceId||null,r!.owner,user.id);
            return { id: cid };
        }
        const c = await one('SELECT c.*,r.owner,r.title,r.hidden,r.workspaceId,r.status AS reportStatus,k.receivedBy AS custodyReceived FROM claims c JOIN reports r ON r.id=c.reportId LEFT JOIN custody k ON k.reportId=r.id WHERE c.id=?', path[1]);
        const staff=!!c?.custodyReceived&&c.claimant!==user.id&&(admin||await canStaff(db(),c.workspaceId,user.id));
        if (!c || (c.claimant !== user.id && c.owner !== user.id&&!staff))
            fail('Conversation unavailable.', 403);
        await requireWorkspace(db(),c!.workspaceId,user.id,admin);
        if (method === 'GET')
            return { claim: {...c,staff,managed:!!c!.custodyReceived,...(staff?{verificationNotes:(await one('SELECT privateDetails FROM reports WHERE id=?',c!.reportId))?.privateDetails}:{} )}, messages: await all('SELECT id,sender,body,created FROM messages WHERE claimId=? ORDER BY created,id', c!.id), blocked: await blocked(user.id, user.id === c!.owner ? c!.claimant : c!.owner) };
        // Either participant can leave an arrangement, including after a block
        // or moderation action. A completed return can never be reopened here.
        if(staff&&c!.owner!==user.id&&c!.claimant!==user.id&&(!!path[2]||!['approve','reject'].includes(b.action))&&method!=='GET')fail('Staff can review claims; participants manage their private conversation.',403);
        if(c!.custodyReceived&&['confirm'].includes(b.action))fail('Use the staff collection-code process for this item.',409);
        if (method === 'POST' && b.action === 'cancel' && !path[2]) {
            if (c!.status !== 'Approved')
                fail('Only an arranged return can be cancelled.', 409);
            const result = await db().batch([
                db().prepare(`UPDATE claims SET status='Cancelled',finderConfirmed=0,claimantConfirmed=0,finderConsent=0,claimantConsent=0
                    WHERE id=? AND status='Approved' AND EXISTS(SELECT 1 FROM reports WHERE id=? AND status='Return Arranged')`).bind(c!.id, c!.reportId),
                db().prepare(`UPDATE reports SET status=CASE WHEN EXISTS(SELECT 1 FROM claims WHERE reportId=? AND status='Pending') THEN 'Claim Pending' ELSE 'Open' END
                    WHERE id=? AND status='Return Arranged' AND EXISTS(SELECT 1 FROM claims WHERE id=? AND status='Cancelled')
                    AND NOT EXISTS(SELECT 1 FROM claims WHERE reportId=? AND status IN ('Approved','Returned'))`).bind(c!.reportId, c!.reportId, c!.id, c!.reportId),
            ]);
            if (!result[0].meta.changes)
                fail('This arrangement changed before it could be cancelled. Refresh and try again.', 409);
            await db().batch([notify(user.id === c!.owner ? c!.claimant : c!.owner, 'The return arrangement was cancelled. The report is open to claims again.', '/?claim=' + c!.id)]);
            return { ok: true };
        }
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
        const other = staff||user.id === c!.owner ? c!.claimant : c!.owner;
        // Recheck authority inside the write transaction. Custody or a staff role
        // can change after this request reads the claim.
        const currentMember=`(r.workspaceId IS NULL OR ${Number(admin)}=1 OR EXISTS(SELECT 1 FROM workspace_members m WHERE m.workspaceId=r.workspaceId AND m.userId=?))`;
        const unblocked="NOT EXISTS(SELECT 1 FROM blocks WHERE (userId=r.owner AND blocked=claims.claimant) OR (userId=claims.claimant AND blocked=r.owner))";
        const reviewerGuard=`EXISTS(SELECT 1 FROM reports r WHERE r.id=claims.reportId AND r.hidden=0 AND r.status IN ('Open','Claim Pending') AND ${currentMember} AND ${unblocked} AND ((NOT EXISTS(SELECT 1 FROM custody WHERE reportId=r.id) AND r.owner=?) OR (EXISTS(SELECT 1 FROM custody WHERE reportId=r.id) AND (${Number(admin)}=1 OR EXISTS(SELECT 1 FROM workspace_members m WHERE m.workspaceId=r.workspaceId AND m.userId=? AND m.role IN ('staff','admin'))))))`;
        if (path[2] === 'messages' && method === 'POST') {
            if (!['Pending', 'Approved'].includes(c!.status))
                fail('This conversation is closed.');
            const body = z.string().trim().min(1).max(2000).parse(b.body);
            await db().batch([db().prepare('INSERT INTO messages(id,claimId,sender,body,created) VALUES(?,?,?,?,?)').bind(id(), c!.id, user.id, body, now()), notify(other, 'You have a new private message.', '/?claim=' + c!.id)]);
            return { ok: true };
        }
        if (method === 'POST') {
            if (b.action === 'approve') {
                if(c!.claimant===user.id)fail('Another staff member must review your own claim.',403);
                if ((c!.custodyReceived?!staff:user.id!==c!.owner) || c!.status !== 'Pending')
                    fail('Only the finder can approve a pending claim.', 403);
                const result=await db().batch([db().prepare(`UPDATE claims SET status='Approved' WHERE id=? AND claimant!=? AND status='Pending' AND ${reviewerGuard}`).bind(c!.id,user.id,user.id,user.id,user.id), db().prepare('UPDATE reports SET status=\'Return Arranged\' WHERE id=? AND EXISTS(SELECT 1 FROM claims WHERE id=? AND status=\'Approved\')').bind(c!.reportId, c!.id)]);
                if (!result[0].meta.changes)fail('This claim or your review access changed. Refresh and try again.',409);
            }
            else if (b.action === 'reject' || b.action === 'withdraw') {
                if ((b.action === 'reject' && (c!.custodyReceived?!staff:user.id !== c!.owner)) || (b.action === 'withdraw' && user.id !== c!.claimant) || c!.status !== 'Pending')
                    fail('This action is unavailable.', 403);
                const guard=b.action==='reject'?reviewerGuard:`claimant=? AND EXISTS(SELECT 1 FROM reports r WHERE r.id=claims.reportId AND ${currentMember})`;
                const args=b.action==='reject'?[user.id,user.id,user.id]:[user.id,user.id];
                const result=await db().batch([db().prepare(`UPDATE claims SET status=? WHERE id=? AND status='Pending' AND ${guard}`).bind(b.action==='reject'?'Rejected':'Withdrawn',c!.id,...args), db().prepare('UPDATE reports SET status=\'Open\' WHERE id=? AND status=\'Claim Pending\' AND NOT EXISTS(SELECT 1 FROM claims WHERE reportId=? AND status=\'Pending\')').bind(c!.reportId, c!.reportId)]);
                if(!result[0].meta.changes)fail('This claim or your review access changed. Refresh and try again.',409);
            }
            else if (b.action === 'confirm') {
                if (c!.status !== 'Approved')
                    fail('Only an arranged return can be confirmed.');
                const field = user.id === c!.owner ? 'finderConfirmed' : 'claimantConfirmed';
                const result = await db().batch([db().prepare(`UPDATE claims SET ${field}=1 WHERE id=? AND status='Approved' AND ${field}=0 AND NOT EXISTS(SELECT 1 FROM custody WHERE reportId=claims.reportId) AND EXISTS(SELECT 1 FROM reports r WHERE r.id=claims.reportId AND r.hidden=0 AND r.status='Return Arranged' AND ${currentMember} AND ${unblocked})`).bind(c!.id,user.id), db().prepare('UPDATE claims SET status=\'Returned\' WHERE id=? AND status=\'Approved\' AND finderConfirmed=1 AND claimantConfirmed=1').bind(c!.id), db().prepare('UPDATE reports SET status=\'Returned\' WHERE id=? AND EXISTS(SELECT 1 FROM claims WHERE id=? AND status=\'Returned\')').bind(c!.reportId, c!.id), db().prepare('UPDATE claims SET status=\'Rejected\' WHERE reportId=? AND status=\'Pending\' AND EXISTS(SELECT 1 FROM reports WHERE id=? AND status=\'Returned\')').bind(c!.reportId, c!.reportId)]);
                if (!result[0].meta.changes)
                    fail('This arrangement changed before it could be confirmed. Refresh and try again.', 409);
            }
            else if (b.action === 'consent') {
                if (c!.status !== 'Returned')
                    fail('Sharing is available after a completed return.');
                const field = user.id === c!.owner ? 'finderConsent' : 'claimantConsent';
                await run(`UPDATE claims SET ${field}=? WHERE id=?`, b.value === true ? 1 : 0, c!.id);
            }
            else
                fail('Unknown claim action.');
            const notice=c!.custodyReceived&&b.action==='approve'?'Your claim is approved. Request a collection code when you reach the college desk.':`Claim update: ${b.action === 'confirm' ? 'a handover confirmation was received' : b.action}.`;
            await db().batch([notify(other,notice,'/?claim='+c!.id),...(c!.custodyReceived&&['approve','reject'].includes(b.action)?[db().prepare('INSERT INTO handover_events(id,workspaceId,reportId,actor,recipient,event,detail,created) VALUES(?,?,?,?,?,?,?,?)').bind(id(),c!.workspaceId,c!.reportId,user.id,c!.claimant,'claim-'+b.action,'',now())]:[])]);
            return { ok: true };
        }
    }
    fail('This action is unavailable.', 404);
}
async function route(req: Request) { const started=Date.now(); try {
    const result = await handle(req);
    if (Date.now()-started>2000) await recordOperation('api','ok',Date.now()-started);
    return result instanceof Response ? result : Response.json(result, { headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
catch (e) {
    const err = e as Error & {
        status?: number;
    };
    if (!(e instanceof z.ZodError) && (!err.status || err.status>=500)) await recordOperation('api','failed',Date.now()-started);
    return Response.json({ error: e instanceof z.ZodError ? e.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') : err.status ? err.message : 'Something went wrong. Please try again.' }, { status: e instanceof z.ZodError ? 400 : err.status || 500, headers: {'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'} });
} }
export const GET = route;
export const POST = route;
export const PATCH = route;
export const DELETE = route;
