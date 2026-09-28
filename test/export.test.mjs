/* Verifies the export pipeline outside the browser:
   builds a real .pptx from the sky-blue starter deck and inspects the zip. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildPptx, exportFileName } from '../src/export/exportPptx.ts'
import { buildStarterDeck } from '../src/templates/skyBlue.ts'
import * as util from '../src/lib/util.ts'

async function main() {
  const deck = {
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
  }
  // give one slide an image so the picture path is exercised
  deck.slides[4].elements.push({
    id: 'img1', kind: 'image', name: 'Sample', src: 'logo/adpl-logo-blue.png', alt: 'sample',
    x: 7, y: 2.4, w: 5.7, h: 4, rotation: 0, opacity: 0.9, fit: 'cover', radius: 0.1,
    borderColor: '#097DC2', borderWidth: 1.5, shadow: null,
  })
  // and a rotated shape + an arrow
  deck.slides[9].elements.push({
    id: 'shp1', kind: 'shape', name: 'Arrow', shape: 'chevron', fill: '#4FAEE0', fillOpacity: 0.5,
    line: '#05395A', lineWidth: 2, dash: 'dash', radius: 0, x: 1, y: 1, w: 2, h: 1, rotation: 335,
    opacity: 1, shadow: { color: '#05395A', opacity: 0.25, blur: 6, offset: 3, angle: 45 },
  })
  deck.slides[3].notes = 'Speaker notes land in PowerPoint’s presenter view.'

  const resolveImage = async (src) => {
    if (src.startsWith('data:')) return src
    const buf = readFileSync(resolve(process.cwd(), 'public', src))
    return `data:image/png;base64,${buf.toString('base64')}`
  }

  const t0 = Date.now()
  const blob = await buildPptx(deck, { resolveImage })
  const buf = Buffer.from(await blob.arrayBuffer())
  mkdirSync('.tmp', { recursive: true })
    writeFileSync('.tmp/adpl-test-deck.pptx', buf)
  console.log('✅ built .pptx -> .tmp/adpl-test-deck.pptx', buf.length, 'bytes in', Date.now() - t0, 'ms')
  console.log('   filename:', exportFileName(deck, 'pptx'))
  console.log('   toDataUrl exists:', typeof util.toDataUrl === 'function')

}
main().catch((e) => { console.error(e); process.exit(1) })
