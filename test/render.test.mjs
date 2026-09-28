/* Server-renders the whole app to catch runtime errors in component logic
   (no browser needed). Effects don't run in SSR, so this covers render paths. */
import { renderToString } from 'react-dom/server'
import { createElement as h } from 'react'
import App from '../src/App.tsx'

const html = renderToString(h(App))
const checks = {
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
