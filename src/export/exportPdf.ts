import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { toPng } from 'html-to-image'
import type { Deck, Slide } from '../types'
import { SlideView } from '../components/SlideView'

/* ------------------------------------------------------------------
 * Deck -> PDF.
 *
 * Pages are rasterised from the very same <SlideView> the canvas uses, so
 * the PDF is a pixel-accurate copy of what you see — text wrapping, the
 * rotated sky-blue cover art, images, everything. Slides are rendered one
 * at a time into an off-screen container to keep memory flat on long decks.
 * ------------------------------------------------------------------ */

export interface PdfOptions {
  /** Raster resolution; 192 px/in gives a 2560×1440 page for 16:9. */
  pxPerInch?: number
  onProgress?: (done: number, total: number, label: string) => void
  /** Injectable for tests — returns a PNG data URL for one slide. */
  captureSlide?: (slide: Slide, index: number, pxPerInch: number, deck: Deck) => Promise<string>
  /** Printable page margin in inches (0 = full-bleed, like the slides). */
  margin?: number
}

/** Wait for <img> elements inside `node` to finish decoding. */
async function waitForImages(node: HTMLElement): Promise<void> {
  const imgs = Array.from(node.querySelectorAll('img'))
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete && img.naturalWidth > 0) return resolve()
          const done = () => resolve()
          img.addEventListener('load', done, { once: true })
          img.addEventListener('error', done, { once: true })
          setTimeout(done, 4000)
        }),
    ),
  )
}

/** Render one slide into a detached container and capture it as a PNG. */
async function captureSlideDom(slide: Slide, _index: number, pxPerInch: number, deck: Deck): Promise<string> {
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText = 'position:fixed;left:-100000px;top:0;pointer-events:none;opacity:0;'
  document.body.appendChild(host)

  const root = createRoot(host)
  try {
    flushSync(() => {
      root.render(createElement(SlideView, { slide, deck, px: pxPerInch }))
    })
    // web fonts must be settled before rasterising, or text reflows mid-capture
    if (document.fonts?.ready) await document.fonts.ready
    await waitForImages(host)
    const target = host.firstElementChild as HTMLElement | null
    if (!target) throw new Error('slide did not render')
    return await toPng(target, {
      pixelRatio: 1,
      width: Math.round(deck.size.w * pxPerInch),
      height: Math.round(deck.size.h * pxPerInch),
      backgroundColor: '#FFFFFF',
      style: { transform: 'none', margin: '0' },
    })
  } finally {
    root.unmount()
    host.remove()
  }
}

export async function buildPdf(deck: Deck, opts: PdfOptions = {}): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const pxPerInch = opts.pxPerInch ?? 192
  const margin = opts.margin ?? 0
  const capture = opts.captureSlide ?? captureSlideDom

  // Work in points so the PDF declares clean page dimensions (16:9 = 960×540pt)
  // instead of a long float from an inch->point conversion.
  const pageW = Math.round(deck.size.w * 72)
  const pageH = Math.round(deck.size.h * 72)
  const portrait = pageH > pageW
  const pad = Math.round(margin * 72)

  const doc = new jsPDF({
    unit: 'pt',
    format: [pageW, pageH],
    orientation: portrait ? 'portrait' : 'landscape',
    compress: true,
  })
  doc.setProperties({
    title: deck.title || 'Presentation',
    author: 'ADPL',
    creator: 'ADPL Deck Studio',
    subject: deck.title || 'Presentation',
  })

  const total = deck.slides.length
  for (let i = 0; i < total; i += 1) {
    opts.onProgress?.(i, total, `Rendering slide ${i + 1} of ${total}`)
    if (i > 0) doc.addPage([pageW, pageH], portrait ? 'portrait' : 'landscape')
    const dataUrl = await capture(deck.slides[i], i, pxPerInch, deck)
    if (!dataUrl) continue
    doc.addImage(dataUrl, 'PNG', pad, pad, pageW - pad * 2, pageH - pad * 2, `slide-${i + 1}`, 'FAST')
  }
  opts.onProgress?.(total, total, 'Writing PDF')

  return doc.output('blob')
}
