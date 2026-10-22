type Database = D1Database;
const staleUpload = `u.created < ? AND NOT EXISTS
  (SELECT 1 FROM reports r, json_each(r.images) image WHERE image.value='/api/media/' || u.id)`;

// Seven days allows a saved draft time to finish. A queue reservation and the
// report INSERT/UPDATE guards prevent a concurrent report attaching a deleted photo.
export async function maintain(db: Database, bucket: R2Bucket, { apply = false, time = Date.now() } = {}) {
  const cutoff = time - 7 * 86400000;
  const candidates = (await db.prepare(`SELECT id FROM uploads u WHERE ${staleUpload} ORDER BY created LIMIT 100`).bind(cutoff).all<{ id: string }>()).results;
  const queued = (await db.prepare('SELECT id FROM upload_cleanup ORDER BY created LIMIT 100').all<{ id: string }>()).results;
  const expired = (await db.prepare('SELECT key FROM limits').all<{ key: string }>()).results.filter(({ key }) => {
    const minute = key.slice(key.lastIndexOf(':') + 1);
    return /^\d+$/.test(minute) && Number(minute) < Math.floor(time / 60000) - 1440;
  });
  const result = { apply, candidates: candidates.length, queued: queued.length, expiredLimits: expired.length, deletedUploads: 0, deletedLimits: 0, failedUploads: 0 };
  if (!apply) return result;
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
