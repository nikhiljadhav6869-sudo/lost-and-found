import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {checkAccessibility} from './accessibility.mjs';

export async function checkMobileReturn(browser, origin) {
  const contexts = [];
  async function participant(role, width) {
    const context = await browser.newContext({viewport: {width, height: 844}, isMobile: true, hasTouch: true});
    context.setDefaultTimeout(25000);
    contexts.push(context);
    const signup = await context.request.post(origin + '/api/auth/sign-up/email', {
      headers: {origin},
      data: {name: role, email: role.toLowerCase() + '@ui.test', password: randomBytes(24).toString('hex')},
    });
    assert.equal(signup.status(), 200);
    const page = await context.newPage();
    await page.goto(origin);
    return page;
  }
  async function publish(page, type) {
    await page.getByRole('button', {name: 'I ' + type + ' something', exact: true}).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByText('Add more details (optional)', {exact:true}).click();
    await dialog.getByLabel('Item name').fill('Indigo commuter backpack');
    await dialog.getByLabel('Public description').fill('Indigo woven commuter backpack with reflective straps.');
    await dialog.getByLabel('Approximate location').fill('Campus library');
    await dialog.getByLabel('Colour', {exact: true}).fill('Indigo');
    await dialog.getByLabel('Brand (optional)').fill('Commuter');
    if (type === 'found') {
      await dialog.locator('input[type=file]').setInputFiles('public/icons/icon-192.png');
      await dialog.getByRole('img', {name: 'Upload 1'}).waitFor();
    }
    await dialog.getByRole('button', {name: 'Publish report'}).click();
    await page.getByRole('dialog').getByRole('heading', {name: 'Indigo commuter backpack'}).waitFor();
    await page.keyboard.press('Escape');
  }
  async function matchAlert(page) {
    await page.reload();
    await page.getByRole('button', {name: 'Notifications', exact: true}).click();
    const alert = page.getByRole('button', {name: /High Similarity.*Indigo commuter backpack/i});
    await alert.waitFor();
    assert.equal(await alert.count(), 1);
    return alert;
  }
  try {
    const owner = await participant('Owner', 375);
    const finder = await participant('Finder', 390);
    await publish(owner, 'lost');
    await publish(finder, 'found');
    await matchAlert(finder);
    await (await matchAlert(owner)).click();
    await owner.waitForURL(url => url.searchParams.has('report'));
    const reportId = new URL(owner.url()).searchParams.get('report');
    await checkAccessibility(owner,'mobile-report-detail');
    const guest = await browser.newContext();
    contexts.push(guest);
    async function publicReport() {
      const response = await guest.request.get(origin + '/api/reports/' + reportId);
      assert.equal(response.status(), 200);
      return (await response.json()).report;
    }
    await owner.getByRole('button', {name: 'This might be mine'}).click();
    const evidence = 'There is a tiny orange triangle sewn inside the lining.';
    await owner.getByLabel('Private ownership evidence').fill(evidence);
    await checkAccessibility(owner,'mobile-private-claim');
    await owner.getByRole('button', {name: 'Send private claim'}).click();
    await owner.getByText(evidence, {exact: true}).waitFor();
    const claimUrl = owner.url();
    const claimId = new URL(claimUrl).searchParams.get('claim');
    assert.ok(claimId);
    const privateResponse = await guest.request.get(origin + '/api/claims/' + claimId);
    assert.equal(privateResponse.status(), 401);
    await finder.goto(claimUrl);
    await finder.getByText(evidence, {exact: true}).waitFor();
    await checkAccessibility(finder,'mobile-conversation');
    const question = 'Which pocket contains the triangle?';
    const answer = 'The inside pocket beneath the zip.';
    await finder.getByLabel('Private message').fill(question);
    await finder.getByRole('button', {name: 'Send', exact: true}).click();
    await owner.getByText(question, {exact: true}).waitFor();
    await owner.getByLabel('Private message').fill(answer);
    await owner.getByRole('button', {name: 'Send', exact: true}).click();
    await finder.getByText(answer, {exact: true}).waitFor();
    await finder.getByRole('button', {name: 'Approve & arrange return'}).click();
    const confirm = 'I confirm the item was handed over';
    await finder.getByRole('button', {name: confirm}).click();
    const waiting = finder.getByRole('button', {name: 'Waiting for the other person'});
    await waiting.waitFor();
    assert.ok(await waiting.isDisabled());
    assert.equal((await publicReport()).status, 'Return Arranged');
    await owner.getByText('✓ Finder confirmed · ○ Owner confirmed', {exact: true}).waitFor();
    await owner.getByRole('button', {name: confirm}).click();
    for (const page of [owner, finder]) {
      await page.getByRole('heading', {name: 'A happy return, confirmed.'}).waitFor();
      await page.getByText('✓ Finder confirmed · ✓ Owner confirmed', {exact: true}).waitFor();
    }
    assert.equal((await publicReport()).status, 'Returned');
    await checkAccessibility(owner,'mobile-returned');
    console.log('PASS two mobile sessions publish, both receive a match, exchange a private claim and confirm a return');
  } finally {
    await Promise.all(contexts.map(context => context.close()));
  }
}
