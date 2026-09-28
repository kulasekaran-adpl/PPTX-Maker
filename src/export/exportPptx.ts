import PptxGenJS from 'pptxgenjs'
import type { Background, Deck, El, ImageEl, ShapeEl, Slide, TextEl } from '../types'
import { parseRichText, safeFileName, type Paragraph } from '../lib/util'
import { stripHash } from '../theme'

/* ------------------------------------------------------------------
 * Deck -> .pptx
 * Every element maps onto a native PowerPoint object (text box, picture
 * or autoshape) so the result is fully editable in Office — no images
 * of slides.
 * ------------------------------------------------------------------ */

export interface ExportOptions {
  /** Inline an image src into a data URL. Injectable so the pipeline can
   *  be unit-tested outside the browser. */
  resolveImage?: (src: string) => Promise<string>
  progress?: (done: number, total: number, label: string) => void
}

const TRANSPARENT = 'FFFFFF'

const parseAlpha = (hex: string, fallback = 1): { color: string; alpha: number } => {
  // accepts #RGB, #RRGGBB, #RRGGBBAA and rgba() strings already resolved upstream
  const h = (hex || '#000000').replace('#', '')
  if (h.length === 8) return { color: h.slice(0, 6), alpha: parseInt(h.slice(6, 8), 16) / 255 }
  if (h.length === 3) return { color: h.split('').map((c) => c + c).join(''), alpha: fallback }
  return { color: h.slice(0, 6) || '000000', alpha: fallback }
}

const fillOf = (color: string | null, opacity: number) => {
  if (!color) return { color: TRANSPARENT, transparency: 100 }
  const { color: c, alpha } = parseAlpha(color)
  return { color: c, transparency: Math.round((1 - alpha * opacity) * 100) }
}

const lineOf = (color: string | null, widthPt: number, dash: ShapeEl['dash'], opacity: number) => {
  if (!color || widthPt <= 0) return { color: TRANSPARENT, transparency: 100, width: 0 }
  const { color: c, alpha } = parseAlpha(color)
  return {
    color: c,
    width: Math.max(0.25, widthPt),
    dashType: dash === 'dash' ? 'dash' : dash === 'dot' ? 'sysDot' : 'solid',
    transparency: Math.round((1 - alpha * opacity) * 100),
  }
}

const shadowOf = (el: El) => {
  if (!el.shadow) return undefined
  return {
    type: 'outer' as const,
    color: stripHash(el.shadow.color),
    opacity: el.shadow.opacity,
    blur: el.shadow.blur,
    offset: el.shadow.offset,
    angle: el.shadow.angle,
  }
}

/** PowerPoint text metrics: text sits inside an inset of ~0.05" by default. */
const marginPt = (insetInches: number) => Math.round(Math.max(0, insetInches) * 72 * 100) / 100

function textBody(el: TextEl) {
  const paras: Paragraph[] = parseRichText(el.text, el.bullets, {
    color: stripHash(el.color),
    size: el.size,
    bold: el.bold,
    italic: el.italic,
    underline: el.underline,
  })

  const runs = paras.map((p: Paragraph) => ({
    text: p.runs.map((r) => r.text).join('') || ' ',
    options: {
      ...(p.runs.length
        ? {
            bold: !!p.runs[0].bold,
            italic: !!p.runs[0].italic,
            underline: p.runs[0].underline ? { style: 'sng' as const } : undefined,
            color: p.runs[0].color ?? stripHash(el.color),
            fontSize: p.runs[0].size ?? el.size,
          }
        : {}),
      breakLine: true,
      bullet: p.bullet ? { code: '2022', indent: 18 } : false,
      ...(p.runs[0]?.text?.startsWith('http')
        ? { hyperlink: { url: p.runs[0].text.split(/\s/)[0] } }
        : {}),
    },
  }))

  return {
    text: runs.length ? runs : [{ text: ' ', options: {} }],
    options: {
      x: el.x,
      y: el.y,
      w: Math.max(0.2, el.w),
      h: Math.max(0.2, el.h),
      rotate: el.rotation || 0,
      fontFace: el.font,
      fontSize: el.size,
      color: stripHash(el.color),
      bold: el.bold,
      italic: el.italic,
      underline: el.underline ? { style: 'sng' as const } : undefined,
      align: el.align,
      valign: el.valign,
      charSpacing: el.charSpacing,
      lineSpacingMultiple: el.lineSpacing,
      margin: marginPt(el.padding),
      fill: el.fill ? (fillOf(el.fill, el.opacity) as never) : undefined,
      shadow: shadowOf(el),
      isTextBox: true,
      objectName: el.name || 'Text',
      wrap: true,
      fit: 'none' as const,
    },
  }
}

function shapeOptions(el: ShapeEl) {
  const base: Record<string, unknown> = {
    x: el.x,
    y: el.y,
    w: Math.max(0.01, el.w),
    h: Math.max(0.01, el.h),
    rotate: el.rotation || 0,
    objectName: el.name || el.shape,
    shadow: shadowOf(el),
  }
  if (el.shape === 'line') {
    return {
      ...base,
      line: lineOf(el.line ?? el.fill, el.lineWidth || 1.5, el.dash, el.opacity),
    }
  }
  if (el.shape === 'roundRect') base.rectRadius = Math.min(el.radius, Math.min(el.w, el.h) / 2)
  return {
    ...base,
    fill: fillOf(el.fill, el.fillOpacity * el.opacity),
    line: lineOf(el.line, el.lineWidth, el.dash, el.opacity),
  }
}

function gradientDataUrl(bg: Extract<Background, { type: 'gradient' }>, w: number, h: number): string {
  const canvas = document.createElement('canvas')
  canvas.width = 1600
  canvas.height = Math.round((1600 * h) / w)
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const rad = ((bg.angle - 90) * Math.PI) / 180
  const cx = canvas.width / 2
  const cy = canvas.height / 2
  const len = Math.abs(canvas.width * Math.cos(rad)) + Math.abs(canvas.height * Math.sin(rad))
  const g = ctx.createLinearGradient(
    cx - (Math.cos(rad) * len) / 2,
    cy - (Math.sin(rad) * len) / 2,
    cx + (Math.cos(rad) * len) / 2,
    cy + (Math.sin(rad) * len) / 2,
  )
  g.addColorStop(0, bg.from)
  g.addColorStop(1, bg.to)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/png')
}

async function applyBackground(
  slide: PptxGenJS.Slide,
  pptx: PptxGenJS,
  bg: Background,
  deckW: number,
  deckH: number,
  resolve: (s: string) => Promise<string>,
) {
  switch (bg.type) {
    case 'solid':
      slide.background = { color: stripHash(bg.color) }
      break
    case 'gradient': {
      const data = gradientDataUrl(bg, deckW, deckH)
      if (data) slide.background = { data }
      else slide.background = { color: stripHash(bg.from) }
      break
    }
    case 'image': {
      const data = await resolve(bg.src)
      slide.background = { color: TRANSPARENT }
      slide.addImage({
        data,
        x: 0,
        y: 0,
        w: deckW,
        h: deckH,
        sizing: bg.fit === 'cover' ? { type: 'cover', w: deckW, h: deckH } : { type: 'contain', w: deckW, h: deckH },
        objectName: 'Background image',
      } as never)
      if (bg.overlay) {
        slide.addShape(pptx.ShapeType.rect, {
          x: 0,
          y: 0,
          w: deckW,
          h: deckH,
          fill: fillOf(bg.overlay, bg.overlayOpacity),
          line: { color: TRANSPARENT, transparency: 100, width: 0 },
          objectName: 'Background overlay',
        } as never)
      }
      break
    }
    default:
      slide.background = { color: TRANSPARENT }
  }
}

async function renderSlide(
  pptx: PptxGenJS,
  deck: Deck,
  slide: Slide,
  layoutName: string,
  resolve: (s: string) => Promise<string>,
) {
  const ps = pptx.addSlide({ masterName: layoutName })
  await applyBackground(ps, pptx, slide.bg, deck.size.w, deck.size.h, resolve)

  for (const el of slide.elements) {
    if (el.hidden) continue

    if (el.kind === 'text') {
      const { text, options } = textBody(el)
      ps.addText(text as never, options as never)
      continue
    }

    if (el.kind === 'shape') {
      const shape = pptx.ShapeType[el.shape as keyof typeof pptx.ShapeType] ?? pptx.ShapeType.rect
      ps.addShape(shape as never, shapeOptions(el) as never)
      continue
    }

    const imgEl = el as ImageEl
    const raw = imgEl.src
    if (!raw) continue
    const data = await resolve(raw)
    const opts: Record<string, unknown> = {
      x: el.x,
      y: el.y,
      w: Math.max(0.05, el.w),
      h: Math.max(0.05, el.h),
      rotate: el.rotation || 0,
      objectName: el.name || 'Picture',
      altText: imgEl.alt || 'Image',
      shadow: shadowOf(el),
      rounding: imgEl.radius > 0,
      transparency: Math.round((1 - el.opacity) * 100),
    }
    if (imgEl.fit === 'cover') opts.sizing = { type: 'cover', w: el.w, h: el.h }
    if (imgEl.fit === 'contain') opts.sizing = { type: 'contain', w: el.w, h: el.h }
    if (imgEl.borderColor && imgEl.borderWidth > 0) {
      opts.line = lineOf(imgEl.borderColor, imgEl.borderWidth, 'solid', 1)
    }
    if (data) opts.data = data
    else opts.path = raw
    ps.addImage(opts as never)
  }

  if (slide.notes) ps.addNotes(slide.notes)
}

export async function buildPptx(deck: Deck, opts: ExportOptions = {}): Promise<Blob> {
  const resolve = opts.resolveImage ?? (async (s: string) => s)
  const pptx = new PptxGenJS()

  pptx.layout = 'LAYOUT_WIDE'
  pptx.defineLayout({ name: 'ADPL_CUSTOM', width: deck.size.w, height: deck.size.h })
  pptx.layout = 'ADPL_CUSTOM'
  pptx.author = 'ADPL'
  pptx.company = 'ADPL'
  pptx.title = deck.title || 'Presentation'
  pptx.subject = deck.title || 'Presentation'
  pptx.theme = {
    headFontFace: 'Calibri',
    bodyFontFace: 'Calibri',
  }

  // Named, reusable master so recipients see the ADPL sky-blue layout in
  // PowerPoint's Design pane and can re-apply it to new slides.
  const layoutName = 'ADPL Sky Blue'
  pptx.defineSlideMaster({
    title: layoutName,
    background: { color: TRANSPARENT },
    objects: [],
    slideNumber: undefined,
  })

  const total = deck.slides.length
  for (let i = 0; i < total; i += 1) {
    opts.progress?.(i, total, `Rendering slide ${i + 1} of ${total}`)
    await renderSlide(pptx, deck, deck.slides[i], layoutName, resolve)
  }
  opts.progress?.(total, total, 'Packaging .pptx')

  const out = await pptx.write({ outputType: 'blob' })
  return out as Blob
}

/* ------------------------------------------------------------------
 * Slide -> PNG (rasterised from the live preview DOM, so no screen-2-file
 * geometry drift is possible)
 * ------------------------------------------------------------------ */

export function exportFileName(deck: Deck, ext: string): string {
  const stamp = new Date().toISOString().slice(0, 10)
  return `${safeFileName(deck.title)}-ADPL-${stamp}.${ext}`
}
