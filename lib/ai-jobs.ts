import { env } from 'cloudflare:workers';
import { MODEL_VERSION, publicEmbeddingText } from './intelligence';
import { recordOperation } from './operations';
import { notifyStrongMatches } from '../app/api/[...path]/route';
type Row = Record<string, any>;
type Encoder = (text: string, images: Uint8Array[]) => Promise<{ textVector: number[]; imageVector: number[] | null }>;
const db = () => env.DB!;
async function imagesFor(paths: string[], owner: string) {
    const images: Uint8Array[] = [];
    for (const path of paths.slice(0, 5)) {
        if (!/^\/api\/media\/[a-f0-9-]+\.(png|jpg|webp)$/.test(path)) throw new Error('Invalid image reference');
        const key = path.slice('/api/media/'.length);
        if (!await db().prepare('SELECT 1 FROM uploads WHERE id=? AND owner=?').bind(key, owner).first()) throw new Error('Image ownership mismatch');
        const object = await env.BUCKET!.get(key);
        if (!object) throw new Error('Image unavailable');
        const bytes = new Uint8Array(await new Response(object.body).arrayBuffer());
        if (bytes.length > 5 * 1024 * 1024) throw new Error('Image too large');
        images.push(bytes);
    }
    return images;
}
function encoded(result: Awaited<ReturnType<Encoder>>) {
    const valid = (v: number[], n: number) => Array.isArray(v) && v.length === n && v.every(Number.isFinite) && v.some(x => x !== 0);
    if (!valid(result.textVector, 384) || (result.imageVector !== null && !valid(result.imageVector, 512))) throw new Error('Invalid model output');
    return [JSON.stringify(result.textVector), result.imageVector ? JSON.stringify(result.imageVector) : null] as const;
}
/** Bounded, lease-protected work. No model executes in an HTTP request. */
export async function processEmbeddingJobs(encode: Encoder, count = 10) {
    let processed = 0;
    await db().prepare("UPDATE embedding_jobs SET state='failed',lease=NULL,error='lease_expired' WHERE reportId IN (SELECT reportId FROM embedding_jobs WHERE state='running' AND available<=? AND attempts>=3 LIMIT 100)").bind(Date.now()).run();
    for (let i = 0; i < Math.min(100, count); i++) {
        const time = Date.now(), lease = crypto.randomUUID();
        const job = await db().prepare(`UPDATE embedding_jobs SET state='running',lease=?,available=?,attempts=attempts+1
          WHERE reportId=(SELECT reportId FROM embedding_jobs WHERE state IN ('pending','failed','running') AND available<=? AND attempts<3 ORDER BY available LIMIT 1)
          RETURNING *`).bind(lease, time + 900000, time).first<Row>();
        if (!job) break;
        try {
            const r = await db().prepare('SELECT * FROM reports WHERE id=?').bind(job.reportId).first<Row>();
            if (!r || r.demo || r.hidden || !['Open','Claim Pending'].includes(r.status)) {
                await db().prepare("UPDATE embedding_jobs SET state='skipped',lease=NULL WHERE reportId=? AND lease=?").bind(job.reportId, lease).run(); continue;
            }
            const [text, image] = encoded(await encode(publicEmbeddingText(r), await imagesFor(JSON.parse(r.images), r.owner)));
            const writes = await db().batch([
                db().prepare(`INSERT INTO embeddings(reportId,revision,model,textVector,imageVector,created)
                  SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM reports r JOIN embedding_jobs j ON j.reportId=r.id
                    WHERE r.id=? AND r.matchRevision=? AND r.hidden=0 AND r.demo=0 AND r.status IN ('Open','Claim Pending') AND j.lease=?)
                  ON CONFLICT(reportId) DO UPDATE SET revision=excluded.revision,model=excluded.model,textVector=excluded.textVector,imageVector=excluded.imageVector,created=excluded.created RETURNING reportId`)
                  .bind(r.id, r.matchRevision, MODEL_VERSION, text, image, Date.now(), r.id, r.matchRevision, lease),
                db().prepare("UPDATE embedding_jobs SET state='ready',error=NULL WHERE reportId=? AND lease=? AND EXISTS(SELECT 1 FROM reports r WHERE r.id=embedding_jobs.reportId AND r.hidden=0 AND r.demo=0 AND r.status IN ('Open','Claim Pending'))").bind(r.id, lease),
            ]);
            if (!writes[0].results?.length) {
                await db().prepare("UPDATE embedding_jobs SET state='skipped',lease=NULL WHERE reportId=? AND lease=?").bind(r.id, lease).run();
                continue;
            }
            // Re-read to reject changes during inference. The notification transaction also checks revisions.
            const latest = await db().prepare('SELECT * FROM reports WHERE id=?').bind(r.id).first<Row>();
            if (latest && latest.matchRevision === r.matchRevision) await notifyStrongMatches(latest);
            await recordOperation('embedding', 'ok', Date.now() - time); processed++;
        } catch {
            await db().prepare("UPDATE embedding_jobs SET state='failed',error='processing_failed',available=? WHERE reportId=? AND lease=?")
                .bind(Date.now() + 60000 * 2 ** job.attempts, job.reportId, lease).run();
            await recordOperation('embedding', 'failed', Date.now() - time);
        }
    }
    return processed;
}
export async function processSearchJobs(encode: Encoder, count = 5) {
    let processed = 0;
    await db().prepare("UPDATE search_jobs SET state='failed',lease=NULL WHERE id IN (SELECT id FROM search_jobs WHERE state='running' AND available<=? AND attempts>=3 LIMIT 100)").bind(Date.now()).run();
    for (let i = 0; i < Math.min(20, count); i++) {
        const time = Date.now(), lease = crypto.randomUUID();
        const job = await db().prepare(`UPDATE search_jobs SET state='running',lease=?,available=?,attempts=attempts+1
          WHERE id=(SELECT id FROM search_jobs WHERE state IN ('pending','running','failed') AND available<=? AND attempts<3 AND created>? ORDER BY created LIMIT 1) RETURNING *`)
          .bind(lease, time + 900000, time, time - 86400000).first<Row>();
        if (!job) break;
        try {
            const [text, image] = encoded(await encode(job.query, await imagesFor(job.image ? [job.image] : [], job.userId)));
            await db().prepare("UPDATE search_jobs SET textVector=?,imageVector=?,model=?,state='ready' WHERE id=? AND lease=?")
              .bind(text, image, MODEL_VERSION, job.id, lease).run();
            await recordOperation('search', 'ok', Date.now() - time); processed++;
        } catch {
            await db().prepare("UPDATE search_jobs SET state='failed',available=? WHERE id=? AND lease=?").bind(Date.now()+60000*2**job.attempts, job.id, lease).run();
            await recordOperation('search', 'failed', Date.now() - time);
        }
    }
    return processed;
}
export async function workerHeartbeat() { await recordOperation('worker', 'ok'); }
