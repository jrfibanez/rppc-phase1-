// Generates the PWA icons (red rounded square with a white "R") as PNGs at build time, dependency-free.
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'

const R = ['11110', '10001', '10001', '11110', '10100', '10010', '10001'] // 5x7 glyph
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td))
  return Buffer.concat([len, td, c])
}

function icon(size, { radius, glyphScale }) {
  const px = Buffer.alloc(size * (size * 4 + 1))
  const cell = Math.floor((size * glyphScale) / 7)
  const gw = cell * 5, gh = cell * 7, gx = Math.floor((size - gw) / 2), gy = Math.floor((size - gh) / 2)
  for (let y = 0; y < size; y++) {
    px[y * (size * 4 + 1)] = 0
    for (let x = 0; x < size; x++) {
      const dx = Math.max(radius - x, x - (size - 1 - radius), 0), dy = Math.max(radius - y, y - (size - 1 - radius), 0)
      const inside = dx * dx + dy * dy <= radius * radius
      const gxi = Math.floor((x - gx) / cell), gyi = Math.floor((y - gy) / cell)
      const glyph = x >= gx && y >= gy && gxi < 5 && gyi < 7 && R[gyi][gxi] === '1'
      const o = y * (size * 4 + 1) + 1 + x * 4
      if (!inside) { px[o + 3] = 0; continue }
      const [r, g, b] = glyph ? [255, 255, 255] : [181, 18, 27]
      px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = 255
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(px)), chunk('IEND', Buffer.alloc(0))])
}

mkdirSync('public/icons', { recursive: true })
writeFileSync('public/icons/icon-192.png', icon(192, { radius: 34, glyphScale: 0.5 }))
writeFileSync('public/icons/icon-512.png', icon(512, { radius: 92, glyphScale: 0.5 }))
writeFileSync('public/icons/icon-maskable-512.png', icon(512, { radius: 0, glyphScale: 0.36 }))
console.log('icons generated')
