import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const source = fs.readFileSync(path.join(publicDir, 'sw.js'), 'utf8');
const origin = 'https://lost-found.example';
const cacheName = 'lost-found-offline-v1';
const offlinePath = '/offline.html';
const offlineHTML = fs.readFileSync(path.join(publicDir, 'offline.html'), 'utf8');
let passed = 0;

async function check(name, run) {
  await run();
  passed++;
  console.log(`PASS ${name}`);
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return {promise, resolve};
}

async function microtasks() {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

function urlOf(value) {
  return new URL(typeof value === 'string' ? value : value.url, origin).href;
}

// A browser-free worker environment. Every possible cache mutation and network
// request is recorded so a future change cannot silently cache account data.
function worker({initialCaches = [], addGate, deleteGate} = {}) {
  const listeners = new Map();
  const stores = new Map(initialCaches.map(name => [name, new Map()]));
  const writes = [];
  const deleted = [];
  const network = [];
  const matches = [];
  let claimCount = 0;
  let skipWaitingCount = 0;
  let networkResult = () => Promise.resolve(new Response('online'));

  function cache(name) {
    if (!stores.has(name)) stores.set(name, new Map());
    const values = stores.get(name);
    return {
      async add(value) {
        writes.push({name, url: urlOf(value), operation: 'add'});
        if (addGate) await addGate.promise;
        values.set(urlOf(value), new Response(offlineHTML, {headers: {'Content-Type': 'text/html'}}));
      },
      async addAll(values) {
        await Promise.all(Array.from(values, value => this.add(value)));
      },
      async put(value, response) {
        writes.push({name, url: urlOf(value), operation: 'put'});
        values.set(urlOf(value), response);
      },
      async match(value) {
        matches.push({name, url: urlOf(value)});
        return values.get(urlOf(value))?.clone();
      },
      async delete(value) {
        writes.push({name, url: urlOf(value), operation: 'delete-entry'});
        return values.delete(urlOf(value));
      },
      async keys() { return [...values.keys()]; },
    };
  }

  const caches = {
    async open(name) { return cache(name); },
    async keys() { return [...stores.keys()]; },
    async delete(name) {
      deleted.push(name);
      if (deleteGate) await deleteGate.promise;
      return stores.delete(name);
    },
    async match(value) {
      for (const name of stores.keys()) {
        const found = await cache(name).match(value);
        if (found) return found;
      }
    },
  };
  const self = {
    location: new URL(`${origin}/sw.js`),
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    clients: {async claim() { claimCount++; }},
    async skipWaiting() { skipWaitingCount++; },
  };
  vm.runInNewContext(source, {
    self, caches, URL, Request, Response, Headers, console,
    fetch(request) {
      network.push(request);
      return networkResult(request);
    },
  }, {filename: 'public/sw.js', timeout: 1000});

  function dispatch(type, fields = {}) {
    const waits = [];
    const responses = [];
    const event = {
      ...fields,
      waitUntil(value) { waits.push(Promise.resolve(value)); },
      respondWith(value) { responses.push(Promise.resolve(value)); },
    };
    for (const listener of listeners.get(type) || []) listener(event);
    return {waits, responses, done: Promise.all(waits)};
  }

  return {
    dispatch, stores, writes, deleted, network, matches,
    setNetwork(fn) { networkResult = fn; },
    get claimCount() { return claimCount; },
    get skipWaitingCount() { return skipWaitingCount; },
  };
}

function navigation(url = '/', overrides = {}) {
  return {url: new URL(url, origin).href, method: 'GET', mode: 'navigate', ...overrides};
}

async function installedWorker() {
  const instance = worker();
  await instance.dispatch('install').done;
  instance.writes.length = 0;
  return instance;
}

function pngSize(relativePath) {
  assert.equal(new URL(relativePath, origin).origin, origin, 'Icons must be local assets');
  const pathname = decodeURIComponent(new URL(relativePath, origin).pathname);
  const filename = path.resolve(publicDir, `.${pathname}`);
  assert.ok(filename.startsWith(publicDir + path.sep), 'Icon path must remain inside public');
  const bytes = fs.readFileSync(filename);
  assert.deepEqual(bytes.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), `${relativePath} must be PNG`);
  assert.equal(bytes.toString('ascii', 12, 16), 'IHDR', `${relativePath} needs a PNG size header`);
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

await check('manifest launches at the app root with correctly sized install icons', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(publicDir, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.id, '/');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.name?.trim());
  assert.ok(manifest.short_name?.trim());
  for (const icon of manifest.icons) {
    const size = pngSize(icon.src);
    assert.equal(icon.type, 'image/png');
    assert.ok(icon.sizes.split(/\s+/).includes(`${size[0]}x${size[1]}`), 'Declared icon size must match its file');
  }
  for (const size of [192, 512]) {
    assert.ok(manifest.icons.some(icon => icon.sizes.split(/\s+/).includes(`${size}x${size}`)
      && (icon.purpose || 'any').split(/\s+/).includes('any')), `Missing regular ${size}px icon`);
  }
  assert.ok(manifest.icons.some(icon => icon.sizes.split(/\s+/).includes('512x512')
    && icon.purpose?.split(/\s+/).includes('maskable')), 'Missing 512px maskable icon');
  assert.deepEqual(pngSize('/icons/apple-touch-icon.png'), [180, 180]);
});

await check('installation waits for only the public offline document to be cached', async () => {
  const gate = deferred();
  const instance = worker({addGate: gate});
  const install = instance.dispatch('install');
  assert.ok(install.waits.length > 0, 'Install must extend its lifetime with waitUntil');
  let finished = false;
  install.done.then(() => { finished = true; });
  await microtasks();
  assert.equal(finished, false, 'Install cannot complete before offline caching');
  gate.resolve();
  await install.done;
  assert.deepEqual(instance.writes.map(({name, url}) => ({name, url})), [
    {name: cacheName, url: `${origin}${offlinePath}`},
  ]);
  assert.equal(instance.network.length, 0);
  assert.equal(instance.skipWaitingCount, 0, 'Updates must not force activation into an active session');
});

await check('activation waits for old offline caches and preserves unrelated caches', async () => {
  const gate = deferred();
  const instance = worker({
    initialCaches: ['lost-found-offline-v0', cacheName, 'another-app-cache', 'lost-found-images'],
    deleteGate: gate,
  });
  const activate = instance.dispatch('activate');
  assert.ok(activate.waits.length > 0, 'Activate must use waitUntil');
  let finished = false;
  activate.done.then(() => { finished = true; });
  await microtasks();
  assert.equal(finished, false, 'Activation must wait for cache cleanup');
  assert.equal(instance.claimCount, 0, 'Clients should be claimed after cleanup');
  gate.resolve();
  await activate.done;
  assert.deepEqual(instance.deleted, ['lost-found-offline-v0']);
  assert.deepEqual([...instance.stores.keys()].sort(), [cacheName, 'another-app-cache', 'lost-found-images'].sort());
  assert.equal(instance.claimCount, 1);
  assert.equal(instance.skipWaitingCount, 0);
  assert.deepEqual(instance.writes, []);
});

await check('online navigations return fresh responses without caching private content', async () => {
  const instance = await installedWorker();
  for (const pathname of ['/', '/reports/private?claim=123', '/apiary']) {
    const request = navigation(pathname);
    const online = new Response('private authenticated page');
    instance.setNetwork(() => Promise.resolve(online));
    const event = instance.dispatch('fetch', {request});
    assert.equal(event.responses.length, 1);
    assert.equal(await event.responses[0], online);
    await event.done;
    assert.equal(instance.network.at(-1), request, 'Fetch must preserve the original navigation request');
  }
  assert.deepEqual(instance.writes, []);
  assert.deepEqual(instance.matches, [], 'Online pages must not be served from a cache');
});

await check('network failures return only the static offline document', async () => {
  const instance = await installedWorker();
  instance.setNetwork(() => Promise.reject(new TypeError('Network unavailable')));
  const event = instance.dispatch('fetch', {request: navigation('/private/report/123')});
  assert.equal(event.responses.length, 1);
  const response = await event.responses[0];
  assert.equal(await response.text(), offlineHTML);
  await event.done;
  assert.ok(instance.matches.length > 0);
  assert.ok(instance.matches.every(match => match.url === `${origin}${offlinePath}`));
  assert.deepEqual(instance.writes, []);
});

await check('HTTP errors remain visible instead of being disguised as offline pages', async () => {
  const instance = await installedWorker();
  for (const status of [401, 403, 404, 500, 503]) {
    const errorResponse = new Response(`HTTP ${status}`, {status});
    instance.setNetwork(() => Promise.resolve(errorResponse));
    const event = instance.dispatch('fetch', {request: navigation('/reports')});
    assert.equal(event.responses.length, 1);
    assert.equal(await event.responses[0], errorResponse);
    await event.done;
  }
  assert.deepEqual(instance.matches, []);
  assert.deepEqual(instance.writes, []);
});

await check('API, cross-origin, non-GET, and non-navigation requests bypass the worker', async () => {
  const instance = await installedWorker();
  const requests = [
    navigation('/api'), navigation('/api?private=true'), navigation('/api/'),
    navigation('/api/auth/get-session'), navigation('/api/reports?id=1'),
    navigation('https://external.example/'),
    navigation('/', {method: 'POST'}), navigation('/', {method: 'HEAD'}),
    navigation('/icons/icon-192.png', {mode: 'no-cors'}),
    navigation('/uploads/private-photo.png', {mode: 'cors'}),
    navigation('/api/private', {mode: 'same-origin'}),
  ];
  for (const request of requests) {
    const event = instance.dispatch('fetch', {request});
    assert.equal(event.responses.length, 0, `Unexpected interception: ${request.method} ${request.url} (${request.mode})`);
    await event.done;
  }
  assert.deepEqual(instance.network, []);
  assert.deepEqual(instance.matches, []);
  assert.deepEqual(instance.writes, []);
});

console.log(`All ${passed} PWA installation and private-data cache checks passed.`);
