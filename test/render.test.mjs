/* Server-renders the whole app to catch runtime errors in component logic
   (no browser needed). Effects don't run in SSR, so this covers render paths. */
import { renderToString } from 'react-dom/server'
import { createElement as h } from 'react'
import App from '../src/App.tsx'
import { migrateDeck, makeStarter } from '../src/state/useStore.tsx'
import { SlideView } from '../src/components/SlideView.tsx'
import { captureOptions } from '../src/export/exportPdf.ts'

/* ---- deck migrations ---- */
const legacy = makeStarter()
legacy.schema = 1
legacy.slides[0].elements = legacy.slides[0].elements.map((el) =>
  el.name === 'Sky field' || el.name === 'Accent sliver'
    ? { ...el, shape: 'rect', w: 20, h: 20, rotation: 335 }
    : el,
)
legacy.slides[0].elements[5].text = 'Client-specific subtitle kept by the migration'
const migrated = migrateDeck(legacy)
const coverArt = migrated.slides[0].elements.filter(
  (e) => e.name === 'Sky field' || e.name === 'Accent sliver',
)
const migrationChecks = {
  'legacy cover art replaced': coverArt.every((e) => e.shape === 'freeform' && Array.isArray(e.points)),
  'legacy art no longer oversized': coverArt.every((e) => e.w <= 13.34 && e.h <= 7.51),
  'migration keeps the rest of the slide': migrated.slides[0].elements.some(
    (e) => e.text === 'Client-specific subtitle kept by the migration',
  ),
  'migration is idempotent': migrateDeck(migrated) === migrated,
}

/* ---- slide backgrounds survive rasterisation ---- */
const deckForBg = makeStarter()
const slideHtml = (i) => renderToString(h(SlideView, { slide: deckForBg.slides[i], deck: deckForBg, px: 1 }))
const sectionHtml = slideHtml(2)   // section divider — solid #097DC2
const closingHtml = slideHtml(9)   // closing — solid #05395A
const coverHtml = slideHtml(0)     // cover — solid #F5FAFE

const bgLayerColor = (html) => {
  const m = /class="slide-bg"[^>]*style="([^"]*)"/.exec(html) ?? /style="([^"]*)"[^>]*class="slide-bg"/.exec(html)
  return m ? m[1] : ''
}
const captureOpts = captureOptions(2560, 1440)

const backgroundChecks = {
  'slide background is its own layer': sectionHtml.includes('class="slide-bg"'),
  'section divider exports sky blue (#097DC2)': /#097DC2/i.test(bgLayerColor(sectionHtml)),
  'closing slide exports deep navy (#05395A)': /#05395A/i.test(bgLayerColor(closingHtml)),
  'cover keeps its pale sky (#F5FAFE)': /#F5FAFE/i.test(bgLayerColor(coverHtml)),
  // the rasteriser must not override the element background — this is the bug
  // that exported the dark slides as white
  'rasteriser does not override the background': !('backgroundColor' in captureOpts),
  'rasteriser still gets explicit dimensions':
    captureOpts.width === 2560 && captureOpts.height === 1440,
}

const html = renderToString(h(App))
const checks = {
  ...migrationChecks,
  ...backgroundChecks,
  'renders markup': html.length > 5000,
  'has sky-blue cover': html.includes('Add your presentation title here'),
  'logo present': html.includes('adpl-logo-blue.png'),
  'inspector panels': html.includes('Slide') && html.includes('Properties'),
  'filmstrip': html.includes('slide-thumb'),
  'insert palette text': html.includes('Close the slide with a clear takeaway'),
  'layout thumbs': (html.match(/thumb-wire/g) || []).length >= 10,
  'brand sky colour': html.includes('#097DC2'),
}
let ok = true
for (const [k, v] of Object.entries(checks)) {
  if (!v) ok = false
  console.log(v ? '✅' : '❌', k)
}
console.log('html length:', html.length)
process.exit(ok ? 0 : 1)
