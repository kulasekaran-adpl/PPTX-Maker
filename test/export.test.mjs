/* Verifies the export pipelines outside the browser:
   - builds a real .pptx and asserts the Google Slides compatibility fixes
   - builds a real .pdf from an injected slide capture
   Run with: npm run test:export */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import JSZip from 'jszip'
import { buildPptx, exportFileName } from '../src/export/exportPptx.ts'
import { buildPdf } from '../src/export/exportPdf.ts'
import { SLIDES_SAFE_FONTS } from '../src/export/pptxCompat.ts'
import { buildStarterDeck } from '../src/templates/skyBlue.ts'

/* 1×1 PNG — stands in for a rasterised slide in the PDF test. */
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const baseDeck = () => ({
  schema: 1,
  id: 'test',
  title: 'ADPL Test Deck',
  size: { w: 13.3333, h: 7.5 },
  theme: 'sky-blue',
  showLogo: true,
  logoVariant: 'blue',
  pageNumbers: true,
  footer: '',
  slides: buildStarterDeck(),
})

const resolveImage = async (src) => {
  if (src.startsWith('data:')) return src
  const buf = readFileSync(resolve(process.cwd(), 'public', src))
  return `data:image/png;base64,${buf.toString('base64')}`
}

let failures = 0
const check = (label, ok, detail = '') => {
  if (!ok) failures += 1
  console.log(ok ? '✅' : '❌', label, detail ? `— ${detail}` : '')
}

async function main() {
  mkdirSync('.tmp', { recursive: true })

  const deck = baseDeck()
  deck.slides[4].elements.push({
    id: 'img1', kind: 'image', name: 'Sample', src: 'logo/adpl-logo-blue.png', alt: 'sample',
    x: 7, y: 2.4, w: 5.7, h: 4, rotation: 0, opacity: 0.9, fit: 'cover', radius: 0.1,
    borderColor: '#097DC2', borderWidth: 1.5, shadow: null,
  })
  deck.slides[9].elements.push({
    id: 'shp1', kind: 'shape', name: 'Arrow', shape: 'chevron', fill: '#4FAEE0', fillOpacity: 0.5,
    line: '#05395A', lineWidth: 2, dash: 'dash', radius: 0, x: 1, y: 1, w: 2, h: 1, rotation: 335,
    opacity: 1, shadow: { color: '#05395A', opacity: 0.25, blur: 6, offset: 3, angle: 45 },
  })
  deck.slides[3].notes = 'Speaker notes land in PowerPoint’s presenter view.'

  /* ------------------------------- PPTX ------------------------------- */
  const t0 = Date.now()
  const blob = await buildPptx(deck, { resolveImage })
  const buf = Buffer.from(await blob.arrayBuffer())
  writeFileSync('.tmp/adpl-test-deck.pptx', buf)
  console.log(`\n— PPTX built: .tmp/adpl-test-deck.pptx ${buf.length} bytes in ${Date.now() - t0} ms`)
  console.log('  filename:', exportFileName(deck, 'pptx'))

  const zip = await JSZip.loadAsync(buf)
  const slideNames = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
  const xml = (await Promise.all(slideNames.map((n) => zip.file(n).async('string')))).join('\n')

  const typefaces = [...new Set(xml.match(/typeface="([^"]+)"/g) ?? [])].map((m) => m.slice(10, -1))

  check('all slides present', slideNames.length === deck.slides.length, `${slideNames.length} slides`)
  check('no rogue empty outlines on text boxes', !/<a:ln\s*\/>|<a:ln><\/a:ln>/.test(xml))
  check('autofit pinned off everywhere', (xml.match(/<a:noAutofit\/>/g) ?? []).length >= 60, `${(xml.match(/<a:noAutofit\/>/g) ?? []).length} boxes`)
  check('no autofit-shrink or autofit-grow', !/normAutofit|spAutoFit/.test(xml))
  check('line spacing in points, not percent', (xml.match(/<a:spcPts/g) ?? []).length > 0 && !/<a:lnSpc><a:spcPct/.test(xml), `${(xml.match(/<a:lnSpc><a:spcPts/g) ?? []).length} paragraphs`)
  check('short labels pinned to a single line', /wrap="none"/.test(xml), `${(xml.match(/wrap="none"/g) ?? []).length} boxes`)
  check(
    'only Google Slides-native fonts are emitted',
    typefaces.every((f) => f === '' || SLIDES_SAFE_FONTS.includes(f)),
    typefaces.join(', '),
  )
  {
    // the bullets layout title is 12.0933in wide on the design canvas; on export it
    // should gain ~4% slack while staying inside the slide
    // ppt/slides/slide4.xml is the "Key points" layout, whose title box is
    // 12.0933in wide on the design canvas
    const bulletsSlide = await zip.file('ppt/slides/slide4.xml').async('string')
    const widths = [...bulletsSlide.matchAll(/<a:ext cx="(\d+)" cy="(\d+)"\/>/g)].map((m) => Number(m[1]) / 914400)
    const widest = Math.max(...widths)
    check(
      'width slack applied to text boxes',
      widest > 12.09 && widest <= 13.3333,
      `widest text box ${widest.toFixed(3)}in (design 12.093in)`,
    )
  }
  check('notes survive', Object.keys(zip.files).some((n) => n.startsWith('ppt/notesSlides/notesSlide')))
  check('media embedded', Object.keys(zip.files).filter((n) => n.startsWith('ppt/media/')).length >= 10)

  /* as-designed mode keeps the requested fonts */
  const native = await buildPptx(deck, { resolveImage, fonts: 'as-designed' })
  const nativeZip = await JSZip.loadAsync(Buffer.from(await native.arrayBuffer()))
  const nativeXml = await nativeZip.file('ppt/slides/slide2.xml').async('string')
  check('as-designed mode keeps the chosen font', nativeXml.includes('typeface="Arial"') || nativeXml.includes('typeface="Calibri"'))

  /* -------------------------------- PDF ------------------------------- */
  let captured = 0
  const pdfBlob = await buildPdf(deck, {
    captureSlide: async () => {
      captured += 1
      return TINY_PNG
    },
  })
  const pdfBuf = Buffer.from(await pdfBlob.arrayBuffer())
  writeFileSync('.tmp/adpl-test-deck.pdf', pdfBuf)
  const pdfText = pdfBuf.toString('latin1')
  const pageCount = (pdfText.match(/\/Type\s*\/Page[^s]/g) ?? []).length

  console.log(`\n— PDF built: .tmp/adpl-test-deck.pdf ${pdfBuf.length} bytes`)
  console.log('  filename:', exportFileName(deck, 'pdf'))
  check('pdf has the right header', pdfText.startsWith('%PDF-'))
  check('pdf has one page per slide', pageCount === deck.slides.length, `${pageCount} pages`)
  check('every slide was rasterised', captured === deck.slides.length, `${captured} captures`)
  check('pdf declares clean 16:9 page size', /\/MediaBox\s*\[\s*0\s+0\s+960\.?\s+540\.?\s*\]/.test(pdfText), (pdfText.match(/\/MediaBox\s*\[[^\]]*\]/) ?? [''])[0])
  check('pdf ends cleanly', pdfText.trimEnd().endsWith('%%EOF'))

  console.log(failures ? `\n${failures} check(s) failed` : '\nAll export checks passed')
  process.exit(failures ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
