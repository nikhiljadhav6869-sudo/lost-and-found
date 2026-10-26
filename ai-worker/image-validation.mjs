import assert from 'node:assert/strict';
import fs from 'node:fs';
import sharp from 'sharp';
import {validateImageInput,embed} from './models.mjs';

const png=fs.readFileSync(new URL('../tests/fixtures/sample.png',import.meta.url));
for(const [format,bytes] of [['png',png],['jpeg',await sharp(png).jpeg().toBuffer()],['webp',await sharp(png).webp({lossless:true}).toBuffer()]]){
 const metadata=await validateImageInput(bytes);
 assert.equal(metadata.format,format);
 assert.ok(metadata.width>0 && metadata.height>0);
}
console.log('PASS worker accepts real JPEG, PNG and still WebP headers');

// Tiny lossless WebP header: 8192 x 8192 = 67M pixels, with no VP8X chunk.
// Header inspection must reject this before full pixel decoding or model loading.
const huge=Buffer.alloc(26);
huge.write('RIFF');huge.writeUInt32LE(18,4);huge.write('WEBP',8);
huge.write('VP8L',12);huge.writeUInt32LE(5,16);huge[20]=0x2f;
huge.writeUInt32LE(((8192-1)|((8192-1)<<14))>>>0,21);
await assert.rejects(()=>validateImageInput(huge),/pixel limit|dimensions too large/i);
await assert.rejects(()=>embed('No models should load for rejected input',[huge]),/pixel limit|dimensions too large/i);
console.log('PASS oversized simple VP8L rejected before full decode and inference');

const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8"/></svg>');
await assert.rejects(()=>validateImageInput(svg),/JPEG, PNG, or WebP/);
await assert.rejects(()=>validateImageInput(new Uint8Array(5*1024*1024+1)),/too large/);
await assert.rejects(()=>validateImageInput(new Uint8Array()),/empty/);
await assert.rejects(()=>validateImageInput(Buffer.from('not an image')));
console.log('PASS SVG, oversized bytes, empty and malformed images rejected');
