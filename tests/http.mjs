import assert from 'node:assert/strict';
import fs from 'node:fs';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import {server} from '../.sites-runtime/http-server.mjs';

if (!server.listening) await once(server, 'listening');
const origin = `http://127.0.0.1:${process.env.PORT}`;
let cookie = '';
async function request(path, body, expected = 200) {
  const headers = {origin, cookie};
  if (body && !(body instanceof FormData)) headers['content-type'] = 'application/json';
  const response = await fetch(origin + path, {
    method: body ? 'POST' : 'GET', headers,
    body: body ? body instanceof FormData ? body : JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const type = response.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await response.json() : new Uint8Array(await response.arrayBuffer());
  assert.equal(response.status, expected, `${path}: ${JSON.stringify(data)}`);
  for (const value of response.headers.getSetCookie()) {
    if (value.startsWith('better-auth.session_token=')) cookie = value.split(';')[0];
  }
  return {data, type, headers: response.headers};
}
try {
  if (fs.existsSync('dist/local/index.html')) {
    const page = await request('/');
    assert.ok(page.type.startsWith('text/html'));
    const html = new TextDecoder().decode(page.data);
    assert.ok(html.includes('Lost &amp; Found') || html.includes('Lost & Found'));
    const script = html.match(/src="([^"]+\.js)"/)[1];
    assert.ok((await request(script)).type.startsWith('text/javascript'));
    console.log('PASS HTTP serves the built interface and JavaScript bundle');
    assert.match(html, /rel="manifest"[^>]*href="\/manifest.webmanifest"/);
    assert.match(html, /rel="apple-touch-icon"/);
    const manifestResponse = await request('/manifest.webmanifest');
    assert.ok(manifestResponse.type.startsWith('application/manifest+json'));
    const manifest = JSON.parse(new TextDecoder().decode(manifestResponse.data));
    assert.equal(manifest.display, 'standalone');
    for (const icon of manifest.icons) {
      const response = await request(icon.src);
      assert.equal(response.type, 'image/png');
      assert.equal(Buffer.from(response.data).readUInt32BE(16), Number(icon.sizes.split('x')[0]));
    }
    const worker = await request('/sw.js');
    assert.ok(worker.type.startsWith('text/javascript'));
    assert.equal(worker.headers.get('cache-control'), 'no-cache');
    const offline = await request('/offline.html');
    assert.ok(offline.type.startsWith('text/html'));
    assert.match(new TextDecoder().decode(offline.data), /Check your internet connection/);
    await request('/icons/missing.png', undefined, 404);
    console.log('PASS HTTP manifest, install icons, service-worker update headers and offline page');
  } else console.log('SKIP HTTP static-build check: run npm run build:local to include it');
  await request('/api/dashboard', undefined, 401);
  await request('/api/auth/sign-up/email', {name:'HTTP Tester',email:'http@integration.test',password:randomBytes(24).toString('base64url')});
  assert.ok(cookie.startsWith('better-auth.session_token='));
  assert.ok((await request('/api/me')).data.user.id);
  console.log('PASS HTTP registration sets a usable cookie and enforces protected access');
  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync('tests/fixtures/sample.png')], {type:'image/png'}), 'sample.png');
  const image = (await request('/api/upload',form)).data.url;
  const item = (await request('/api/reports', {type:'found',title:'HTTP canvas bag',category:'Bags',description:'A green canvas bag found near the public library.',colour:'Green',brand:'',date:'2026-10-08',location:'Public library',privateDetails:'Inside stitching is blue.',images:[image]})).data;
  assert.equal((await request('/api/reports/'+item.id)).data.report.privateDetails,undefined);
  assert.equal((await request('/api/reports?q=HTTP')).data.total,1);
  const downloaded = await request(image);
  assert.equal(downloaded.type,'image/png');
  assert.ok(downloaded.data.length > 20);
  console.log('PASS HTTP multipart upload, report persistence, search and media streaming');
  await request('/api/auth/sign-out',{});
  await request('/api/dashboard',undefined,401);
  console.log('PASS HTTP logout invalidates protected access');
} finally {
  await new Promise(resolve=>server.close(resolve));
}
