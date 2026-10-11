import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {api, auth, env} from '../.sites-runtime/test-entry.mjs';

const origin = 'http://127.0.0.1:3000';
class Client {
  cookie = '';
  async call(path, body, method = body ? 'POST' : 'GET', expected = 200) {
    const response = await (path.startsWith('auth/') ? auth : api)[method](new Request(origin + '/api/' + path, {
      method,
      headers: {origin, cookie: this.cookie, 'content-type': 'application/json'},
      body: body ? JSON.stringify(body) : undefined,
    }));
    const data = await response.json();
    assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`);
    for (const cookie of response.headers.getSetCookie()) {
      if (cookie.startsWith('better-auth.session_token=')) this.cookie = cookie.split(';')[0];
    }
    return data;
  }
}

const finder = new Client(), claimant = new Client(), stranger = new Client(), anonymous = new Client();
for (const [client, name] of [[finder, 'Finder'], [claimant, 'Claimant'], [stranger, 'Stranger']]) {
  await client.call('auth/sign-up/email', {name, email: name.toLowerCase() + '@regression.test', password: randomBytes(24).toString('base64url')});
}
const finderId = (await finder.call('me')).user.id;
const claimantId = (await claimant.call('me')).user.id;
process.env.ADMIN_USER_IDS = finderId;
const reportData = {
  type: 'found', title: 'Canvas backpack', category: 'Bags', description: 'A canvas backpack with brown straps.',
  colour: 'Green', brand: '', date: '2026-10-08', location: 'Public library', privateDetails: 'Hidden blue stitching.', images: [],
};

// Pause a real request immediately after its report read. An actual approval can
// then commit before the original request continues, without timing-based sleeps.
async function afterReportSnapshot(reportId, task, competingTask) {
  const originalPrepare = env.DB.prepare;
  let release, reached;
  const resumed = new Promise(resolve => { release = resolve; });
  const snapshot = new Promise(resolve => { reached = resolve; });
  let intercepted = false;
  env.DB.prepare = function(query) {
    const prepared = originalPrepare.call(this, query);
    if (query !== 'SELECT * FROM reports WHERE id=?') return prepared;
    const originalBind = prepared.bind;
    prepared.bind = function(...args) {
      const bound = originalBind.apply(this, args);
      if (args[0] !== reportId || intercepted) return bound;
      intercepted = true;
      const originalFirst = bound.first;
      bound.first = async function(...firstArgs) {
        const row = await originalFirst.apply(this, firstArgs);
        reached();
        await resumed;
        return row;
      };
      return bound;
    };
    return prepared;
  };
  const pending = task();
  try {
    await Promise.race([snapshot, pending.then(() => { throw new Error('Report snapshot was not intercepted.'); })]);
    await competingTask();
  } finally {
    env.DB.prepare = originalPrepare;
    release();
  }
  await pending;
}

let returnedClaim;
for (const operation of ['edit', 'close', 'delete']) {
  const report = await finder.call('reports', {...reportData, title: `${operation} race backpack`});
  const claim = await claimant.call('claims', {reportId: report.id, evidence: 'It has hidden blue stitching inside the pocket.'});
  const method = operation === 'delete' ? 'DELETE' : 'PATCH';
  const body = operation === 'delete' ? undefined : operation === 'close' ? {action: 'close'} : {...reportData, title: 'Changed after approval'};
  await afterReportSnapshot(report.id,
    () => finder.call('reports/' + report.id, body, method, 409),
    () => finder.call('claims/' + claim.id, {action: 'approve'}));
  const actual = (await anonymous.call('reports/' + report.id)).report;
  assert.equal(actual.status, 'Return Arranged');
  assert.equal(actual.title, `${operation} race backpack`);
  assert.equal((await claimant.call('claims/' + claim.id)).claim.status, 'Approved');
  returnedClaim = claim;
  console.log(`PASS Concurrent approval prevents stale report ${operation}`);
}

await finder.call('claims/' + returnedClaim.id, {action: 'confirm'});
await claimant.call('claims/' + returnedClaim.id, {action: 'confirm'});
await finder.call('claims/' + returnedClaim.id, {action: 'consent', value: true});
await claimant.call('claims/' + returnedClaim.id, {action: 'consent', value: true});
assert.equal((await anonymous.call('stats')).happy.length, 1);
await finder.call('blocks', {userId: claimantId});
await stranger.call('claims/' + returnedClaim.id, {action: 'consent', value: false}, 'POST', 403);
await claimant.call('claims/' + returnedClaim.id, {action: 'consent', value: false});
assert.equal((await anonymous.call('stats')).happy.length, 0);
await claimant.call('claims/' + returnedClaim.id, {action: 'consent', value: true}, 'POST', 403);
console.log('PASS A blocked participant can revoke sharing consent; outsiders and blocked opt-ins are rejected');

await finder.call('blocks', {userId: claimantId, remove: true});
await claimant.call('claims/' + returnedClaim.id, {action: 'consent', value: true});
const reportId = (await claimant.call('claims/' + returnedClaim.id)).claim.reportId;
await claimant.call('flags', {reportId, reason: 'Please review this report for the moderation regression.'});
const flag = (await finder.call('admin')).flags[0];
await finder.call('admin', {id: flag.id, action: 'hide'});
await claimant.call('claims/' + returnedClaim.id, {action: 'consent', value: false});
await claimant.call('claims/' + returnedClaim.id, {action: 'consent', value: true}, 'POST', 403);
assert.equal((await claimant.call('claims/' + returnedClaim.id)).claim.claimantConsent, 0);
await finder.call('admin', {id: flag.id, action: 'restore'});
assert.equal((await anonymous.call('stats')).happy.length, 0);
console.log('PASS Consent revoked during moderation stays revoked after the listing is restored');

// Exercise the same successful writes as the guards protect; closed reports must
// remain deletable and the close transition must still reject pending claims.
const editable = await finder.call('reports', {...reportData, title: 'Editable report'});
await finder.call('reports/' + editable.id, {...reportData, title: 'Edited report'}, 'PATCH');
const pendingClaim = await claimant.call('claims', {reportId: editable.id, evidence: 'The small inside pocket has blue stitching.'});
await finder.call('reports/' + editable.id, {action: 'close'}, 'PATCH');
assert.equal((await claimant.call('claims/' + pendingClaim.id)).claim.status, 'Rejected');
await finder.call('reports/' + editable.id, undefined, 'DELETE');
await anonymous.call('reports/' + editable.id, undefined, 'GET', 404);
console.log('PASS Open reports still edit and close, and closed reports still delete');
