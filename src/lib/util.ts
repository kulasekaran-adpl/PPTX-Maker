/* ------------------------------------------------------------------
 * Small shared helpers: ids, math, rich-text parsing, image plumbing.
 * ------------------------------------------------------------------ */

let counter = 0

export const uid = (prefix = 'el'): string => {
  counter += 1
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`
}

export const clamp = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, v))

/** Round to 2 decimals — keeps the UI tidy without losing precision. */
export const r2 = (v: number): number => Math.round(v * 100) / 100

export const round = (v: number, d = 2): number => {
  const f = 10 ** d
  return Math.round(v * f) / f
}

export const deg2rad = (d: number): number => (d * Math.PI) / 180

/** Rotate a vector by `deg` clockwise (screen/PowerPoint convention). */
export function rotateVec(x: number, y: number, deg: number): { x: number; y: number } {
  const c = Math.cos(deg2rad(deg))
  const s = Math.sin(deg2rad(deg))
  return { x: x * c - y * s, y: x * s + y * c }
}

/* ------------------------- rich text ------------------------- */

export interface Run {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  color?: string
  size?: number
}

export interface Paragraph {
  runs: Run[]
  bullet?: boolean
}

const INLINE = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\s][^*]*\*|~~[^~]+~~)/g

/**
 * Minimal inline markup so non-technical users can emphasise words:
 *   **bold**   *italic*   __underline__
 * Line level: a line that is only "---" becomes a hairline rule hint and is
 * dropped; blank lines become paragraph spacing.
 */
export function parseRichText(
  raw: string,
  bullets: boolean,
  base: Omit<Run, 'text'> = {},
): Paragraph[] {
  const lines = (raw ?? '').replace(/\r\n/g, '\n').split('\n')
  return lines.map((line, i) => {
    if (line.trim() === '---') return { runs: [], bullet: false }
    const parts = line.split(INLINE).filter((p) => p !== '')
    const runs: Run[] = parts.map((p) => {
      if (p.startsWith('**') && p.endsWith('**') && p.length > 4)
        return { ...base, text: p.slice(2, -2), bold: true }
      if (p.startsWith('__') && p.endsWith('__') && p.length > 4)
        return { ...base, text: p.slice(2, -2), underline: true }
      if (p.startsWith('~~') && p.endsWith('~~') && p.length > 4)
        return { ...base, text: p.slice(2, -2) }
      if (p.startsWith('*') && p.endsWith('*') && p.length > 2)
        return { ...base, text: p.slice(1, -1), italic: true }
      return { ...base, text: p }
    })
    if (runs.length === 0) runs.push({ ...base, text: '' })
    // A leading "- " or "• " always forces a bullet on that line.
    const bulleted = /^\s*[-•]\s+/.test(line) || (bullets && line.trim() !== '')
    if (/^\s*[-•]\s+/.test(line) && runs[0]) runs[0].text = runs[0].text.replace(/^\s*[-•]\s+/, '')
    return { runs, bullet: i === lines.length - 1 && !bulleted ? false : bulleted }
  })
}

/* ------------------------- colours ------------------------- */

export function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.replace('#', ''), 16)
  const pb = parseInt(b.replace('#', ''), 16)
  const ar = (pa >> 16) & 255
  const ag = (pa >> 8) & 255
  const ab = pa & 255
  const br = (pb >> 16) & 255
  const bg = (pb >> 8) & 255
  const bb = pb & 255
  const to = (v: number) => Math.round(v).toString(16).padStart(2, '0')
  return `#${to(ar + (br - ar) * t)}${to(ag + (bg - ag) * t)}${to(ab + (bb - ab) * t)}`.toUpperCase()
}

export const darken = (hex: string, t: number) => mixHex(hex, '#000000', t)
export const lighten = (hex: string, t: number) => mixHex(hex, '#FFFFFF', t)

/** Pick readable ink for a given background. */
export function readableInk(bgHex: string): string {
  const n = parseInt(bgHex.replace('#', ''), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.62 ? '#0E2A3D' : '#FFFFFF'
}

/* ------------------------- images ------------------------- */

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result))
    fr.onerror = () => reject(fr.error)
    fr.readAsDataURL(file)
  })
}

export function loadImageSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 })
    img.onerror = () => resolve({ w: 4, h: 3 })
    img.src = src
  })
}

/**
 * Downscale an uploaded photo so projects stay small and exports fast.
 * Anything above `maxEdge` px is resampled through a canvas.
 */
export async function normalizeUpload(file: File, maxEdge = 2200): Promise<string> {
  const raw = await fileToDataUrl(file)
  if (file.type === 'image/svg+xml') return raw
  try {
    const { w, h } = await loadImageSize(raw)
    const scale = Math.min(1, maxEdge / Math.max(w, h))
    if (scale >= 1 && raw.length < 2_600_000) return raw
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image()
      i.onload = () => res(i)
      i.onerror = rej
      i.src = raw
    })
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(w * scale))
    canvas.height = Math.max(1, Math.round(h * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return raw
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const isPng = file.type === 'image/png' || file.type === 'image/svg+xml'
    const out = canvas.toDataURL(isPng ? 'image/png' : 'image/jpeg', isPng ? undefined : 0.9)
    return out.length < raw.length ? out : raw
  } catch {
    return raw
  }
}

/** Fetch any URL / asset path and inline it as a data URL (for export). */
const inlineCache = new Map<string, string>()

export async function toDataUrl(src: string): Promise<string> {
  if (!src) return ''
  if (src.startsWith('data:')) return src
  const cached = inlineCache.get(src)
  if (cached) return cached
  const res = await fetch(src, { credentials: 'omit' })
  const blob = await res.blob()
  const data = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result))
    fr.onerror = () => reject(fr.error)
    fr.readAsDataURL(blob)
  })
  inlineCache.set(src, data)
  return data
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export const safeFileName = (s: string): string =>
  (s || 'presentation').replace(/[^a-z0-9\-_ ]/gi, '').trim().replace(/\s+/g, '-') || 'presentation'

/** 1234567 -> "12,34,567"? No — keep it simple and international. */
export const fmtNum = (v: number, d = 2): string => {
  const s = v.toFixed(d)
  return s.replace(/\.?0+$/, '') || '0'
}
