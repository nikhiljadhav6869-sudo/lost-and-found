const requiredRemote = ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN', 'SUPABASE_URL', 'SUPABASE_STORAGE_BUCKET'];

export function storageConfiguration(source = process.env) {
  const remotePresent = [...requiredRemote, 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY'].some(key => source[key]);
  const mode = source.STORAGE_MODE || (remotePresent ? 'remote' : 'local');
  if (!['local', 'remote'].includes(mode)) throw new Error('STORAGE_MODE must be local or remote.');
  if (mode === 'local') {
    if (remotePresent) throw new Error('Remote storage settings cannot be combined with STORAGE_MODE=local.');
    if (source.RENDER && source.ALLOW_EPHEMERAL_STORAGE !== 'true' && !source.RENDER_DISK_ID)
      throw new Error('Render requires external storage. Set STORAGE_MODE=remote and configure Turso and a private Supabase bucket.');
    return { mode };
  }
  const missing = requiredRemote.filter(key => !source[key]);
  const secretKey = source.SUPABASE_SECRET_KEY || source.SUPABASE_SERVICE_ROLE_KEY;
  if (!secretKey) missing.push('SUPABASE_SECRET_KEY');
  if (missing.length) throw new Error('Missing remote storage settings: ' + missing.join(', '));
  let database, storage;
  try { database = new URL(source.TURSO_DATABASE_URL); storage = new URL(source.SUPABASE_URL); }
  catch { throw new Error('Remote storage URLs are invalid.'); }
  if (!['libsql:', 'https:'].includes(database.protocol) || database.username || database.password || database.search || database.hash)
    throw new Error('TURSO_DATABASE_URL must be a secure libsql:// or https:// database URL without credentials or query parameters.');
  if (storage.protocol !== 'https:' || storage.username || storage.password || storage.search || storage.hash || !['', '/'].includes(storage.pathname))
    throw new Error('SUPABASE_URL must be the HTTPS project origin.');
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(source.SUPABASE_STORAGE_BUCKET)) throw new Error('Invalid SUPABASE_STORAGE_BUCKET.');
  if (secretKey.startsWith('sb_publishable_')) throw new Error('Use a server secret key, not a Supabase publishable key.');
  return { mode, databaseUrl: source.TURSO_DATABASE_URL, authToken: source.TURSO_AUTH_TOKEN, storageUrl: storage.origin, secretKey, bucket: source.SUPABASE_STORAGE_BUCKET };
}
