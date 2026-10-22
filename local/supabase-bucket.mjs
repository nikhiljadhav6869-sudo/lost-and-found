export const storageKeyPattern = /^[a-f0-9-]+\.(jpg|png|webp)$/;
export function checkedStorageKey(key) {
  if (!storageKeyPattern.test(key)) throw new Error('Invalid storage key.');
  return key;
}
export const imageMime = key => key.endsWith('.png') ? 'image/png' : key.endsWith('.jpg') ? 'image/jpeg' : 'image/webp';

export function createSupabaseBucket({ storageUrl, secretKey, bucket }, fetcher = fetch) {
  const base = storageUrl + '/storage/v1';
  const auth = { apikey: secretKey };
  if (!secretKey.startsWith('sb_secret_')) auth.Authorization = 'Bearer ' + secretKey;
  async function request(resource, options = {}) {
    let response;
    try {
      response = await fetcher(base + resource, {
        ...options, headers: { ...auth, ...options.headers }, redirect: 'error', signal: AbortSignal.timeout(20000),
      });
    } catch { throw new Error('Photo storage could not be reached. Please try again.'); }
    return response;
  }
  const objectPath = key => '/object/' + encodeURIComponent(bucket) + '/' + encodeURIComponent(checkedStorageKey(key));
  return {
    async verifyPrivate() {
      const response = await request('/bucket/' + encodeURIComponent(bucket));
      if (!response.ok) throw new Error('Cannot access the configured photo bucket. Check the server key and bucket name.');
      const information = await response.json();
      if (information.public !== false) throw new Error('The photo bucket must be private. Public buckets expose unpublished photos.');
    },
    async put(key, body) {
      const response = await request(objectPath(key), { method: 'POST', headers: { 'Content-Type': imageMime(key), 'x-upsert': 'false', 'Cache-Control': 'private, no-store' }, body });
      if (!response.ok) throw new Error('Photo upload failed. Please try again.');
    },
    async get(key) {
      const response = await request(objectPath(key));
      if (response.status === 404) return null;
      if (!response.ok) {
        const failure = await response.json().catch(() => ({}));
        if (failure.code === 'NoSuchKey' || failure.code === 'not_found' || String(failure.statusCode) === '404') return null;
        throw new Error('Photo download failed. Please try again.');
      }
      return { body: response.body, httpMetadata: { contentType: imageMime(key) } };
    },
    async delete(key) {
      checkedStorageKey(key);
      const response = await request('/object/' + encodeURIComponent(bucket), { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: [key] }) });
      if (!response.ok) throw new Error('Photo deletion failed. Please try again.');
    },
  };
}
