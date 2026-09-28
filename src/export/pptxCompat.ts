import JSZip from 'jszip'
import type { ShapeEl, TextEl } from '../types'
import { SLIDES_SAFE_FONTS } from '../theme'

/* ------------------------------------------------------------------
 * Google Slides compatibility.
 *
 * Google Slides renders .pptx with slightly different text metrics and
 * defaults from PowerPoint, which is what makes an imported deck look
 * "unaligned". Four concrete causes, all handled here:
 *
 *  1. Font substitution — Slides has no Calibri, so it swaps in a font with
 *     different glyph widths and the text re-wraps. → use a font Slides
 *     ships natively (see SLIDES_NATIVE_FONTS).
 *  2. Re-wrapping — because of (1) a line that just fits in PowerPoint can
 *     spill onto a second line in Slides. → give every text box a little
 *     width slack, and pin short single-line labels to wrap="none".
 *  3. Line spacing — percentage spacing (<a:spcPct/>) is interpreted more
 *     loosely than absolute points. → emit <a:spcPts/> instead.
 *  4. Autofit — a text box with no explicit autofit setting can be resized
 *     to fit its text by Slides, moving it. → pin <a:noAutofit/>.
 *
 * Plus one plain bug shared by PowerPoint and Keynote: pptxgenjs writes an
 * empty <a:ln></a:ln> on text boxes, which both apps draw as a thin border.
 * We replace it with an explicit "no outline".
 * ------------------------------------------------------------------ */

/** Fonts Google Slides renders natively, so no substitution happens. */
export { SLIDES_SAFE_FONTS }

const NATIVE = new Set<string>(SLIDES_SAFE_FONTS)

export type FontMode = 'slides-safe' | 'as-designed'

export const SAFE_FALLBACK_FONT = 'Arial'

export function resolveFont(font: string, mode: FontMode): string {
  if (mode === 'as-designed') return font
  return NATIVE.has(font) ? font : SAFE_FALLBACK_FONT
}

/* --------------------------- text metrics --------------------------- */

/** Fractions of the box size added on export to absorb metric differences. */
export const WIDTH_SLACK = 0.04
export const HEIGHT_SLACK = 0.07

/**
 * Conservative estimate of how wide a string renders, in inches.
 * Deliberately errs wide (0.55em average advance) so we never mark text as
 * "single line" when PowerPoint would actually wrap it.
 */
export function estimateTextWidth(text: string, sizePt: number, charSpacing = 0, bold = false): number {
  const longest = text.split('\n').reduce((n, l) => Math.max(n, l.length), 0)
  // bold glyphs are a touch wider; erring wide keeps us from pinning text to
  // one line when the real renderer would wrap it
  const advance = sizePt * (bold ? 0.6 : 0.55) + charSpacing
  return (longest * advance) / 72
}

export interface BoxGeometry {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Grow a text box just enough to survive metric drift in other renderers,
 * anchored so the visible text does not move: left/centre/right aligned
 * boxes keep their alignment edge, and top/middle/bottom boxes keep their
 * anchor edge.
 */
export function slackenBox(
  el: TextEl,
  slide: { w: number; h: number },
  margin = 0.02,
): BoxGeometry {
  const growW = Math.min(0.6, Math.max(0.1, el.w * WIDTH_SLACK))
  const growH = Math.min(0.5, Math.max(0.06, el.h * HEIGHT_SLACK * 2))

  let w = el.w + growW
  let x = el.x
  if (el.align === 'center') x = el.x - growW / 2
  else if (el.align === 'right') x = el.x - growW
  // keep inside the slide where there is room; never shrink below the design
  if (x < margin) x = margin
  if (x + w > slide.w - margin) {
    const clamped = slide.w - margin - x
    if (clamped >= el.w) w = clamped
    else {
      x = el.x
      w = el.w + growW
    }
  }

  let h = el.h + growH
  let y = el.y
  if (el.valign === 'middle') y = el.y - growH / 2
  else if (el.valign === 'bottom') y = el.y - growH
  if (y < margin) y = margin
  if (y + h > slide.h - margin) {
    const clamped = slide.h - margin - y
    if (clamped >= el.h) h = clamped
    else {
      y = el.y
      h = el.h + growH
    }
  }

  return {
    x: Math.round(x * 10000) / 10000,
    y: Math.round(y * 10000) / 10000,
    w: Math.round(w * 10000) / 10000,
    h: Math.round(h * 10000) / 10000,
  }
}

/**
 * True when a label clearly fits on one line inside `boxWidth`, so we can set
 * wrap="none" and make wrapping impossible in any renderer.
 */
export function fitsOnOneLine(el: TextEl, boxWidth: number): boolean {
  if (el.text.includes('\n')) return false
  if (!el.text.trim()) return false
  const need = estimateTextWidth(el.text, el.size, el.charSpacing, el.bold)
  return need <= boxWidth * 0.88
}

/* ------------------------ post-processing ------------------------ */

const NO_OUTLINE = '<a:ln><a:noFill/></a:ln>'
const SLIDE_XML = /^ppt\/slides\/slide\d+\.xml$/

/**
 * Rewrites the generated slide XML in place:
 *  - empty <a:ln></a:ln>  →  explicit no-outline (kills rogue text-box borders)
 *  - <a:bodyPr …>         →  …<a:noAutofit/>  (text can never be auto-resized)
 */
export async function polishPptxXml(blob: Blob, freeforms: FreeformMap = new Map()): Promise<Blob> {
  const zip = await JSZip.loadAsync(blob)
  const names = Object.keys(zip.files).filter((n) => SLIDE_XML.test(n) || n === 'ppt/slideLayouts/slideLayout1.xml')
  if (!names.length) return blob

  for (const name of names) {
    const entry = zip.file(name)
    if (!entry) continue
    let xml = await entry.async('string')
    const before = xml

    // 0. exact polygons for freeform art (no rotation involved)
    if (freeforms.size) {
      xml = xml.replace(/<p:sp>[\s\S]*?<\/p:sp>/g, (sp) => {
        const named = /name="(ADPLFF_[^"]+)"/.exec(sp)
        if (!named) return sp
        const pts = freeforms.get(named[1])
        if (!pts) return sp
        const ext = /<a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(sp)
        if (!ext) return sp
        const geom = custGeomXml(pts, Number(ext[1]) / EMU, Number(ext[2]) / EMU)
        if (!geom) return sp
        return sp.replace(/<a:prstGeom[\s\S]*?<\/a:prstGeom>/, geom)
      })
    }

    // 1. no rogue outlines around text boxes
    xml = xml.replace(/<a:ln\s*\/>/g, NO_OUTLINE).replace(/<a:ln><\/a:ln>/g, NO_OUTLINE)

    // 2. pin autofit off (self-closing bodyPr first, then insert the marker)
    xml = xml.replace(/<a:bodyPr([^>]*?)\/>/g, '<a:bodyPr$1></a:bodyPr>')
    xml = xml.replace(/(<a:bodyPr\b[^>]*>)(?!<a:(?:no|norm|sp)Autofit)/g, '$1<a:noAutofit/>')

    if (xml !== before) zip.file(name, xml)
  }

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })
}


/* --------------------------- freeform geometry --------------------------- */

export type FreeformMap = Map<string, [number, number][]>

/** EMU per inch, as used by OOXML. */
const EMU = 914400

/**
 * Replace a placeholder rectangle with an exact polygon path.
 * PowerPoint, Google Slides, LibreOffice and Keynote all draw <a:custGeom>
 * from the same numbers, so diagonal art comes out identical everywhere —
 * unlike a rotated oversized rectangle, whose placement depends on how each
 * app interprets rotation.
 */
export function custGeomXml(points: [number, number][], wIn: number, hIn: number): string {
  const w = Math.max(1, Math.round(wIn * EMU))
  const h = Math.max(1, Math.round(hIn * EMU))
  const pts = points
    .map(([x, y]) => ({ x: Math.round(x * w), y: Math.round(y * h) }))
  if (!pts.length) return ''
  const [first, ...rest] = pts
  const moves = rest.map((p) => `<a:lnTo><a:pt x="${p.x}" y="${p.y}"/></a:lnTo>`).join('')
  return (
    '<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/>' +
    `<a:rect l="0" t="0" r="${w}" b="${h}"/>` +
    `<a:pathLst><a:path w="${w}" h="${h}">` +
    `<a:moveTo><a:pt x="${first.x}" y="${first.y}"/></a:moveTo>${moves}<a:close/>` +
    '</a:path></a:pathLst></a:custGeom>'
  )
}

/**
 * Corner points of a rectangle after rotating it about its centre, in slide
 * inches. Used to bake rotation into a polygon on export: the visual result
 * is identical, but nothing depends on a renderer's rotation handling.
 */
export function rotatedRectPoints(el: ShapeEl): [number, number][] {
  const rad = (el.rotation * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const cx = el.x + el.w / 2
  const cy = el.y + el.h / 2
  const rotate = (px: number, py: number): [number, number] => {
    const dx = px - cx
    const dy = py - cy
    return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos]
  }
  return [
    rotate(el.x, el.y),
    rotate(el.x + el.w, el.y),
    rotate(el.x + el.w, el.y + el.h),
    rotate(el.x, el.y + el.h),
  ]
}

/** Normalise absolute points into a 0..1 box + the box's inches. */
export function normalisePoints(points: [number, number][]) {
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  const w = Math.max(0.01, Math.max(...xs) - x)
  const h = Math.max(0.01, Math.max(...ys) - y)
  return {
    x,
    y,
    w,
    h,
    points: points.map(([px, py]) => [(px - x) / w, (py - y) / h] as [number, number]),
  }
}
