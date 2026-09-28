/* Server-renders the whole app to catch runtime errors in component logic
   (no browser needed). Effects don't run in SSR, so this covers render paths. */
import { renderToString } from 'react-dom/server'
import { createElement as h } from 'react'
import App from '../src/App.tsx'
import { migrateDeck, makeStarter } from '../src/state/useStore.tsx'

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

const html = renderToString(h(App))
const checks = {
  ...migrationChecks,
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
