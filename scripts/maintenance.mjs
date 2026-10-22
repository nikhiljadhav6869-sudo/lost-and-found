import './load-env.mjs';
import { build } from 'esbuild';
await build({ entryPoints: ['lib/maintenance.ts'], outfile: '.sites-runtime/maintenance.mjs', bundle: true, platform: 'node', format: 'esm' });
const { maintain } = await import('../.sites-runtime/maintenance.mjs');
const { DB, BUCKET } = await import('../local/storage.mjs');
const apply = process.argv.includes('--apply');
console.log(apply ? 'Applying the seven-day unattached-photo and one-day rate-limit retention policy.' : 'Preview only. Add --apply to clean the listed eligible records.');
console.log(JSON.stringify(await maintain(DB, BUCKET, { apply }), null, 2));
