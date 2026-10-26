import path from 'node:path';
import fs from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { pipeline, AutoProcessor, CLIPVisionModelWithProjection, RawImage, env } from '@huggingface/transformers';
env.cacheDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '.cache');
// Byte-based cache avoids native ONNX filename access failures on some Windows hosts.
env.useFSCache = false; env.useCustomCache = true;
const cacheFile = key => path.join(env.cacheDir, createHash('sha256').update(String(key)).digest('hex'));
env.customCache = {
    async match(key) {
        try { return new Response(await fs.readFile(cacheFile(key))); } catch {}
        // Reuse downloads made by the library's filesystem cache before this adapter.
        try {
            const url = new URL(key);
            if (url.origin !== 'https://huggingface.co') return undefined;
            const parts = url.pathname.slice(1).split('/');
            if (parts[0] !== 'Xenova' || parts[2] !== 'resolve' || parts.some(p => p === '..')) return undefined;
            parts.splice(2,1);
            return new Response(await fs.readFile(path.join(env.cacheDir,...parts)));
        } catch { return undefined; }
    },
    async put(key,response) {
        await fs.mkdir(env.cacheDir,{recursive:true});
        const file=cacheFile(key), temp=file+'.'+randomUUID()+'.tmp';
        await fs.writeFile(temp,new Uint8Array(await response.arrayBuffer())); await fs.rename(temp,file);
    }
};
const textRevision = '751bff37182d3f1213fa05d7196b954e230abad9';
const imageRevision = 'd15189d7028b43f1d3e65039190477f6af591c2a';
const normalize = data => { const v = Array.from(data); const norm = Math.hypot(...v); if (!norm || v.some(x => !Number.isFinite(x))) throw new Error('Invalid embedding'); return v.map(x => x / norm); };
const MAX_IMAGE_PIXELS = 40000000;
/** Read headers before allocating decoded pixels or loading an inference model. */
export async function validateImageInput(bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength > 5 * 1024 * 1024) throw new Error('Image too large or empty');
    const metadata = await sharp(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), { limitInputPixels: MAX_IMAGE_PIXELS, failOn: 'error' }).metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format)) throw new Error('Choose a JPEG, PNG, or WebP image');
    if (!Number.isInteger(metadata.width) || !Number.isInteger(metadata.height) || metadata.width < 1 || metadata.height < 1 || metadata.width * metadata.height > MAX_IMAGE_PIXELS) throw new Error('Image dimensions too large');
    if ((metadata.pages || 1) !== 1) throw new Error('Choose a still image');
    return metadata;
}
let textModel, imageModel, processor;
export async function embed(text, images = []) {
    const photos = images.slice(0, 5);
    for (const bytes of photos) await validateImageInput(bytes);
    textModel ??= await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { revision: textRevision, dtype: 'q8', device: 'cpu', session_options: { intraOpNumThreads: 2, interOpNumThreads: 1 } });
    const textVector = normalize((await textModel(text || 'item', { pooling: 'mean', normalize: true })).data);
    const vectors = [];
    for (const bytes of photos) {
        processor ??= await AutoProcessor.from_pretrained('Xenova/clip-vit-base-patch32', { revision: imageRevision });
        imageModel ??= await CLIPVisionModelWithProjection.from_pretrained('Xenova/clip-vit-base-patch32', { revision: imageRevision, dtype: 'q8', device: 'cpu', session_options: { intraOpNumThreads: 2, interOpNumThreads: 1 } });
        const image = await RawImage.fromBlob(new Blob([bytes]));
        if (image.width * image.height > MAX_IMAGE_PIXELS) throw new Error('Image dimensions too large');
        const { image_embeds } = await imageModel(await processor(image));
        vectors.push(normalize(image_embeds.data));
    }
    const imageVector = vectors.length ? normalize(vectors[0].map((_, i) => vectors.reduce((sum, v) => sum + v[i], 0) / vectors.length)) : null;
    return { textVector, imageVector };
}
