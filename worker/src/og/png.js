/**
 * A tiny indexed-colour raster and PNG encoder for share cards. No dependencies: rows are drawn as byte fills
 * and compressed with the platform's CompressionStream('deflate'), which produces the zlib stream PNG needs.
 */

const CRC = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    CRC[n] = c >>> 0;
}

function crc32(bytes, start, end) {
    let c = 0xffffffff;
    for (let i = start; i < end; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

async function deflate(bytes) {
    const cs = new CompressionStream('deflate');
    const writer = cs.writable.getWriter();
    writer.write(bytes);
    writer.close();
    return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}

export class Raster {
    /** The first colour is the background. */
    constructor(w, h, background) {
        this.w = w;
        this.h = h;
        this.stride = w + 1; // each row starts with its PNG filter byte (0 = none)
        this.px = new Uint8Array(this.stride * h);
        this.palette = [];
        this.index = new Map();
        this.color(background);
    }

    color(hex) {
        let i = this.index.get(hex);
        if (i === undefined) {
            if (this.palette.length >= 256) throw new Error('palette full');
            i = this.palette.length;
            this.palette.push(hex);
            this.index.set(hex, i);
        }
        return i;
    }

    /**
     * Fill the whole raster with a grid: background plus 1-px lines every `step` px. One template row per
     * kind, copied down the image, so this costs a few hundred copies instead of thousands of fills.
     */
    grid(step, hex) {
        const bg = 0;
        const line = this.color(hex);
        const plain = new Uint8Array(this.stride).fill(bg);
        plain[0] = 0;
        for (let x = 0; x < this.w; x += step) plain[1 + x] = line;
        const full = new Uint8Array(this.stride).fill(line);
        full[0] = 0;
        for (let y = 0; y < this.h; y++)
            this.px.set(y % step === 0 ? full : plain, y * this.stride);
    }

    rect(x, y, w, h, hex) {
        const x0 = Math.max(0, Math.round(x));
        const y0 = Math.max(0, Math.round(y));
        const x1 = Math.min(this.w, Math.round(x + w));
        const y1 = Math.min(this.h, Math.round(y + h));
        if (x1 <= x0 || y1 <= y0) return;
        const c = this.color(hex);
        for (let yy = y0; yy < y1; yy++) {
            const o = yy * this.stride + 1;
            this.px.fill(c, o + x0, o + x1);
        }
    }

    async png() {
        const idat = await deflate(this.px);
        const plte = new Uint8Array(this.palette.length * 3);
        this.palette.forEach((hex, i) => {
            const v = parseInt(hex.slice(1), 16);
            plte[i * 3] = v >> 16;
            plte[i * 3 + 1] = (v >> 8) & 255;
            plte[i * 3 + 2] = v & 255;
        });
        const ihdr = new Uint8Array(13);
        const dv = new DataView(ihdr.buffer);
        dv.setUint32(0, this.w);
        dv.setUint32(4, this.h);
        ihdr.set([8, 3, 0, 0, 0], 8); // 8-bit, indexed colour
        const chunks = [
            ['IHDR', ihdr],
            ['PLTE', plte],
            ['IDAT', idat],
            ['IEND', new Uint8Array(0)]
        ];
        const size = 8 + chunks.reduce((n, [, d]) => n + 12 + d.length, 0);
        const out = new Uint8Array(size);
        out.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
        let p = 8;
        const odv = new DataView(out.buffer);
        for (const [type, data] of chunks) {
            odv.setUint32(p, data.length);
            for (let i = 0; i < 4; i++) out[p + 4 + i] = type.charCodeAt(i);
            out.set(data, p + 8);
            odv.setUint32(p + 8 + data.length, crc32(out, p + 4, p + 8 + data.length));
            p += 12 + data.length;
        }
        return out;
    }
}
