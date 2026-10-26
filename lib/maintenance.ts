type Database = D1Database;
const staleUpload = `u.created < ? AND NOT EXISTS
  (SELECT 1 FROM reports r, json_each(r.images) image WHERE image.value='/api/media/' || u.id)`;

// Seven days allows a saved draft time to finish. A queue reservation and the
// report INSERT/UPDATE guards prevent a concurrent report attaching a deleted photo.
export async function maintain(db: Database, bucket: R2Bucket, { apply = false, time = Date.now() } = {}) {
  const cutoff = time - 7 * 86400000;
  const candidates = (await db.prepare(`SELECT id FROM uploads u WHERE ${staleUpload} ORDER BY created LIMIT 100`).bind(cutoff).all<{ id: string }>()).results;
  const queued = (await db.prepare('SELECT id FROM upload_cleanup ORDER BY created LIMIT 100').all<{ id: string }>()).results;
  const expired = (await db.prepare("SELECT key FROM limits WHERE substr(rtrim(key,'0123456789'),-1)=':' AND length(key)>length(rtrim(key,'0123456789')) AND CAST(substr(key,length(rtrim(key,'0123456789'))+1) AS INTEGER)<? LIMIT 1000").bind(Math.floor(time/60000)-1440).all<{key:string}>()).results;
  const result = { apply, candidates: candidates.length, queued: queued.length, expiredLimits: expired.length, deletedUploads: 0, deletedLimits: 0, failedUploads: 0 };
  const expiry = await db.prepare('SELECT (SELECT count(*) FROM session WHERE expiresAt<?) AS sessions,(SELECT count(*) FROM verification WHERE expiresAt<?) AS tokens').bind(time,time).first<{sessions:number;tokens:number}>();
  Object.assign(result,{expiredSessions:expiry?.sessions||0,expiredTokens:expiry?.tokens||0});
  if (!apply) return result;
  await db.batch([
    db.prepare('DELETE FROM session WHERE id IN (SELECT id FROM session WHERE expiresAt<? LIMIT 500)').bind(time),
    db.prepare('DELETE FROM verification WHERE id IN (SELECT id FROM verification WHERE expiresAt<? LIMIT 500)').bind(time),
    db.prepare('DELETE FROM operations WHERE id IN (SELECT id FROM operations WHERE created<? LIMIT 1000)').bind(time-30*86400000),
    db.prepare('DELETE FROM search_jobs WHERE id IN (SELECT id FROM search_jobs WHERE created<? LIMIT 500)').bind(time-86400000),
  ]);
  for (const { id } of candidates) {
    await db.prepare(`INSERT OR IGNORE INTO upload_cleanup(id,created)
      SELECT u.id,? FROM uploads u WHERE u.id=? AND ${staleUpload}`).bind(time, id, cutoff).run();
  }
  const work = (await db.prepare('SELECT id FROM upload_cleanup ORDER BY created LIMIT 100').all<{ id: string }>()).results;
  for (const { id } of work) {
    // Defensive recheck also protects installations upgraded from older app code.
    const reference = await db.prepare("SELECT 1 FROM reports r,json_each(r.images) image WHERE image.value=? LIMIT 1").bind('/api/media/' + id).first();
    if (reference) { await db.prepare('DELETE FROM upload_cleanup WHERE id=?').bind(id).run(); continue; }
    try {
      await bucket.delete(id);
      await db.batch([db.prepare('DELETE FROM uploads WHERE id=?').bind(id), db.prepare('DELETE FROM upload_cleanup WHERE id=?').bind(id)]);
      result.deletedUploads++;
    } catch { result.failedUploads++; } // Queue remains retryable; never claim deletion succeeded.
  }
  for (let offset = 0; offset < expired.length; offset += 100) {
    await db.batch(expired.slice(offset, offset + 100).map(({ key }) => db.prepare('DELETE FROM limits WHERE key=?').bind(key)));
  }
  result.deletedLimits = expired.length;
  return result;
}
