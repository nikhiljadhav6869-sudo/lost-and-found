// Metadata is discarded on the server even if a caller bypasses browser re-encoding.
export function cleanImage(bytes: Uint8Array, type: string): Uint8Array {
    if (bytes.length < 20 || bytes.length > 5 * 1024 * 1024)
        throw new Error('Images must be valid and smaller than 5 MB.');
    const chunks: Uint8Array[] = [];
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const str = (a: number, b: number) => String.fromCharCode(...bytes.slice(a, b));
    if (type === 'image/png') {
        if (str(1, 4) !== 'PNG' || bytes[0] !== 137 || view.getUint32(4) !== 0x0d0a1a0a || str(12, 16) !== 'IHDR')
            throw new Error('Invalid PNG image.');
        if (view.getUint32(16) > 4096 || view.getUint32(20) > 4096)
            throw new Error('Image dimensions exceed 4096 pixels.');
        chunks.push(bytes.slice(0, 8));
        let p = 8, ended = false, hasData = false;
        while (p + 12 <= bytes.length) {
            const n = view.getUint32(p), tag = str(p + 4, p + 8);
            if (n > bytes.length - p - 12)
                throw new Error('Truncated PNG.');
            if (['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS'].includes(tag))
                chunks.push(bytes.slice(p, p + n + 12));
            if (tag === 'IDAT')
                hasData = true;
            p += n + 12;
            if (tag === 'IEND') {
                ended = true;
                break;
            }
        }
        if (!ended || !hasData)
            throw new Error('Incomplete PNG.');
    }
    else if (type === 'image/jpeg') {
        if (bytes[0] !== 255 || bytes[1] !== 216 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217)
            throw new Error('Invalid JPEG image.');
        chunks.push(bytes.slice(0, 2));
        let p = 2, scan = false;
        while (p < bytes.length - 2) {
            if (bytes[p] !== 255)
                throw new Error('Malformed JPEG.');
            const marker = bytes[p + 1];
            if (marker === 218) {
                chunks.push(bytes.slice(p));
                scan = true;
                break;
            }
            const n = view.getUint16(p + 2);
            if (n < 2 || p + n + 2 > bytes.length)
                throw new Error('Truncated JPEG.');
            if ([192, 193, 194].includes(marker) && (view.getUint16(p + 5) > 4096 || view.getUint16(p + 7) > 4096))
                throw new Error('Image dimensions exceed 4096 pixels.');
            if (!(marker >= 224 && marker <= 239) && marker !== 254)
                chunks.push(bytes.slice(p, p + n + 2));
            p += n + 2;
        }
        if (!scan)
            throw new Error('Incomplete JPEG.');
    }
    else if (type === 'image/webp') {
        if (str(0, 4) !== 'RIFF' || str(8, 12) !== 'WEBP' || view.getUint32(4, true) + 8 !== bytes.length)
            throw new Error('Invalid WebP image.');
        chunks.push(bytes.slice(0, 12));
        let p = 12, hasData = false;
        while (p + 8 <= bytes.length) {
            const tag = str(p, p + 4), n = view.getUint32(p + 4, true), end = p + 8 + n + (n % 2);
            if (end > bytes.length)
                throw new Error('Truncated WebP.');
            if (['ANIM', 'ANMF'].includes(tag))
                throw new Error('Please upload a still WebP image.');
            if (['VP8 ', 'VP8L'].includes(tag))
                hasData = true;
            if (!['EXIF', 'XMP ', 'ICCP'].includes(tag)) {
                const chunk = bytes.slice(p, end);
                if (tag === 'VP8X') {
                    chunk[8] &= ~(0x20 | 0x08 | 0x04);
                    const w = 1 + chunk[12] + (chunk[13] << 8) + (chunk[14] << 16), h = 1 + chunk[15] + (chunk[16] << 8) + (chunk[17] << 16);
                    if (w > 4096 || h > 4096)
                        throw new Error('Image dimensions exceed 4096 pixels.');
                }
                chunks.push(chunk);
            }
            p = end;
        }
        if (!hasData || p !== bytes.length)
            throw new Error('Incomplete WebP.');
    }
    else
        throw new Error('Choose a JPEG, PNG, or WebP image.');
    const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
    let offset = 0;
    for (const c of chunks) {
        out.set(c, offset);
        offset += c.length;
    }
    if (type === 'image/webp')
        new DataView(out.buffer).setUint32(4, out.length - 8, true);
    return out;
}
