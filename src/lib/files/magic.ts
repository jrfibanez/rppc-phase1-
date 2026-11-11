export const ALLOWED_MIME = [
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const
export type AllowedMime = (typeof ALLOWED_MIME)[number]
export const MAX_BYTES = 10 * 1024 * 1024
export const ENTITY_TYPES = ['account', 'opportunity', 'ticket', 'activity'] as const
export type EntityType = (typeof ENTITY_TYPES)[number]

/** Detect the real type from file contents (magic bytes), not the extension. */
export function sniffMime(bytes: Uint8Array, fileName: string): AllowedMime | null {
  const b = bytes
  const starts = (...sig: number[]) => sig.every((v, i) => b[i] === v)
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return 'application/pdf'                 // %PDF-
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg'
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png'
  if (starts(0x52, 0x49, 0x46, 0x46) && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp'
  if (starts(0x50, 0x4b, 0x03, 0x04)) {                                               // ZIP container (OOXML)
    const ext = fileName.toLowerCase().split('.').pop()
    const text = new TextDecoder('latin1').decode(b.subarray(0, Math.min(b.length, 64 * 1024)))
    if (ext === 'docx' && text.includes('word/')) return ALLOWED_MIME[4]
    if (ext === 'xlsx' && text.includes('xl/')) return ALLOWED_MIME[5]
    if (text.includes('[Content_Types].xml')) {
      if (ext === 'docx') return ALLOWED_MIME[4]
      if (ext === 'xlsx') return ALLOWED_MIME[5]
    }
  }
  return null
}

export function safeFileName(name: string) {
  const base = name.normalize('NFKD').replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '_').replace(/^\.+/, '')
  return (base || 'file').slice(-120)
}
