import type { El, Slide } from '../types'
import { uid } from '../lib/util'
import { DEFAULT_FONT } from '../theme'

/* ------------------------------------------------------------------
 * Layout geometry — every number is inches on a 13.333 × 7.5 stage.
 * ------------------------------------------------------------------ */

export const SW = 13.3333
export const SH = 7.5
export const M = 0.62 // page margin
export const CW = SW - M * 2 // content width = 12.0933
const CONTENT_TOP = 2.16
const CONTENT_BOTTOM = 6.72

export interface LayoutDef {
  id: string
  name: string
  hint: string
  build: () => Omit<Slide, 'id'>
}

export const LOGO_H = 0.4
export const LOGO_W = LOGO_H * 1.646

export function logoEl(
  x: number,
  y: number,
  h = LOGO_H,
  variant: 'blue' | 'white' | 'navy' = 'blue',
): El {
  return {
    id: uid('img'),
    kind: 'image',
    name: 'ADPL logo',
    brand: 'logo',
    src: `logo/adpl-logo-${variant}.png`,
    alt: 'ADPL',
    x,
    y,
    w: Math.round(h * 1.646 * 1000) / 1000,
    h,
    rotation: 0,
    opacity: 1,
    fit: 'contain',
    radius: 0,
    borderColor: null,
    borderWidth: 0,
    shadow: null,
  }
}

export function pageNumberEl(): El {
  return {
    id: uid('txt'),
    kind: 'text',
    name: 'Slide number',
    text: '01',
    font: DEFAULT_FONT,
    size: 10,
    color: '#8AA4B5',
    bold: false,
    italic: false,
    underline: false,
    align: 'right',
    valign: 'middle',
    lineSpacing: 1,
    charSpacing: 0.4,
    bullets: false,
    fill: null,
    padding: 0,
    x: SW - M - 1.2,
    y: 6.86,
    w: 1.2,
    h: 0.28,
    rotation: 0,
    opacity: 1,
    shadow: null,
  }
}

/* ---------------------------- element factories ---------------------------- */

type TextOpts = Partial<Extract<El, { kind: 'text' }>>

export function T(x: number, y: number, w: number, h: number, text: string, o: TextOpts = {}): El {
  return {
    id: uid('txt'),
    kind: 'text',
    text,
    font: DEFAULT_FONT,
    size: 16,
    color: '#0E2A3D',
    bold: false,
    italic: false,
    underline: false,
    align: 'left',
    valign: 'top',
    lineSpacing: 1.2,
    charSpacing: 0,
    bullets: false,
    fill: null,
    padding: 0,
    x,
    y,
    w,
    h,
    rotation: 0,
    opacity: 1,
    shadow: null,
    ...o,
  } as El
}

type ShapeOpts = Partial<Extract<El, { kind: 'shape' }>>

export function S(
  shape: Extract<El, { kind: 'shape' }>['shape'],
  x: number,
  y: number,
  w: number,
  h: number,
  o: ShapeOpts = {},
): El {
  return {
    id: uid('shp'),
    kind: 'shape',
    shape,
    fill: '#097DC2',
    fillOpacity: 1,
    line: null,
    lineWidth: 0,
    dash: 'solid',
    radius: 0.12,
    x,
    y,
    w,
    h,
    rotation: 0,
    opacity: 1,
    shadow: null,
    ...o,
  } as El
}

/** Exact polygon from absolute slide coordinates (inches).
 *  The points are normalised into the element box, so nothing is rotated:
 *  every renderer draws the identical outline.                      */
export function freeform(points: [number, number][], o: ShapeOpts = {}): El {
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const w = Math.max(0.01, Math.max(...xs) - minX)
  const h = Math.max(0.01, Math.max(...ys) - minY)
  return S('freeform', minX, minY, w, h, {
    points: points.map(([x, y]) => [
      Math.round(((x - minX) / w) * 100000) / 100000,
      Math.round(((y - minY) / h) * 100000) / 100000,
    ]),
    ...o,
  })
}

/**
 * Cover artwork geometry.
 *
 * The sky-blue field is a trapezoid whose diagonal edge runs from
 * (10.60in, 0) at the top to (5.20in, 7.5in) at the bottom, with a lighter
 * sliver tracing its outer edge. Both are plain polygons — the earlier
 * version built them from a 20in × 20in square rotated by 25 degrees, which
 * is why the diagonal came out wrong (and inverted) after upload.
 */
export const COVER_GEOMETRY = {
  /** right-hand sky-blue field */
  field: [
    [10.6, 0],
    [SW, 0],
    [SW, SH],
    [5.2, SH],
  ] as [number, number][],
  /** lighter accent band hugging the diagonal, 0.3in wide */
  sliver: [
    [10.2303, 0],
    [10.6, 0],
    [5.2, SH],
    [4.8305, SH],
  ] as [number, number][],
  /** leftmost x the diagonal allows at a given y (keeps copy clear of the art) */
  edgeX: (y: number) => 10.6 - (y / SH) * 5.4,
}

/** Slide-number / footer furniture shared by every content layout. */
function furniture(opts: { number?: boolean; logo?: boolean } = {}) {
  const out: El[] = []
  if (opts.logo !== false) out.push(logoEl(M, 0.4, LOGO_H, 'blue'))
  if (opts.number !== false) out.push(pageNumberEl())
  out.push(
    S('rect', M, 6.88, CW, 0.01, { fill: '#D9E8F3', name: 'Footer rule' }),
  )
  return out
}

/* ------------------------------- headings ------------------------------- */

function heading(eyebrow: string, title: string): El[] {
  return [
    T(M, 1.02, CW, 0.3, eyebrow.toUpperCase(), {
      name: 'Eyebrow',
      size: 10.5,
      bold: true,
      color: '#2E96D3',
      charSpacing: 1.6,
      valign: 'middle',
      h: 0.28,
    }),
    T(M, 1.34, CW, 0.7, title, {
      name: 'Title',
      size: 30,
      bold: true,
      color: '#05395A',
      lineSpacing: 1.05,
      valign: 'middle',
      h: 0.62,
    }),
    S('rect', M, 2.0, 0.86, 0.075, { fill: '#097DC2', name: 'Accent rule' }),
  ]
}

/** Blank-image placeholder card (dashed sky outline + hint copy). */
function imageSlot(
  x: number,
  y: number,
  w: number,
  h: number,
  label = 'Drop an image here',
): El[] {
  return [
    S('roundRect', x, y, w, h, {
      name: 'Image frame',
      fill: '#E4F2FB',
      line: '#A3D3EF',
      lineWidth: 1,
      dash: 'dash',
      radius: 0.14,
    }),
    T(x, y + h / 2 - 0.28, w, 0.28, label, {
      name: 'Image hint',
      size: 12,
      color: '#4B6779',
      align: 'center',
      valign: 'middle',
      h: 0.26,
    }),
    T(x, y + h / 2 + 0.02, w, 0.24, 'replace from Insert → Image', {
      size: 9,
      color: '#8AA4B5',
      align: 'center',
      valign: 'middle',
      h: 0.22,
    }),
  ]
}

/* ============================== LAYOUTS ============================== */

const cover: LayoutDef = {
  id: 'cover',
  name: 'Cover',
  hint: 'Title slide with sky-blue diagonal',
  build: () => ({
    layout: 'cover',
    name: 'Cover',
    bg: { type: 'solid', color: '#F5FAFE' },
    notes: 'Open with the deck title, who it is for and the date.',
    elements: [
      freeform(COVER_GEOMETRY.sliver, { name: 'Accent sliver', fill: '#A3D3EF' }),
      freeform(COVER_GEOMETRY.field, { name: 'Sky field', fill: '#097DC2' }),
      T(0.78, 1.62, 6.1, 0.3, 'COMPANY PRESENTATION', {
        name: 'Eyebrow',
        size: 10.5,
        bold: true,
        color: '#2E96D3',
        charSpacing: 1.8,
        valign: 'middle',
        h: 0.28,
      }),
      // width kept clear of the diagonal (see COVER_GEOMETRY.edgeX)
      T(0.78, 2.02, 6.4, 1.5, 'Add your presentation title here', {
        name: 'Title',
        size: 40,
        bold: true,
        color: '#05395A',
        lineSpacing: 1.04,
        valign: 'middle',
        h: 1.44,
      }),
      S('rect', 0.8, 3.72, 1.15, 0.085, { fill: '#097DC2', name: 'Accent rule' }),
      T(0.78, 4.0, 5.9, 0.72, 'A short subtitle that frames the story of this deck.', {
        name: 'Subtitle',
        size: 15,
        color: '#4B6779',
        lineSpacing: 1.35,
        h: 0.7,
      }),
      T(0.78, 5.62, 4.4, 0.3, 'Prepared for  ·  Client name', {
        size: 11.5,
        color: '#8AA4B5',
        valign: 'middle',
        h: 0.26,
      }),
      T(0.78, 5.98, 4.4, 0.3, 'September 2026', {
        size: 11.5,
        color: '#8AA4B5',
        valign: 'middle',
        h: 0.26,
      }),
      logoEl(10.3, 6.08, 0.8, 'white'),
    ],
  }),
}

const agenda: LayoutDef = {
  id: 'agenda',
  name: 'Agenda',
  hint: 'Numbered two-column contents',
  build: () => {
    const items = [
      'Context and objectives',
      'Where we are today',
      'The proposed approach',
      'Scope and timeline',
      'Investment',
      'Next steps',
    ]
    const els: El[] = [...heading('Contents', 'Agenda'), ...furniture()]
    const rowH = 1.16
    const top = 2.62
    items.forEach((label, i) => {
      const col = i % 2
      const row = Math.floor(i / 2)
      const x = M + col * 6.28
      const y = top + row * rowH
      els.push(
        S('ellipse', x, y, 0.54, 0.54, { fill: '#E4F2FB', name: `Step ${i + 1} chip` }),
        T(x, y, 0.54, 0.54, String(i + 1).padStart(2, '0'), {
          size: 14,
          bold: true,
          color: '#097DC2',
          align: 'center',
          valign: 'middle',
        }),
        T(x + 0.76, y - 0.02, 4.9, 0.3, label, {
          size: 14.5,
          color: '#0E2A3D',
          bold: true,
          valign: 'middle',
          h: 0.3,
        }),
        T(x + 0.76, y + 0.28, 4.9, 0.26, 'One line of supporting detail', {
          size: 10.5,
          color: '#8AA4B5',
          valign: 'middle',
          h: 0.24,
        }),
        S('rect', x + 0.76, y + 0.68, 4.6, 0.01, { fill: '#D9E8F3', name: 'Row rule' }),
      )
    })
    return { layout: 'agenda', name: 'Agenda', bg: { type: 'solid', color: '#FFFFFF' }, notes: '', elements: els }
  },
}

const section: LayoutDef = {
  id: 'section',
  name: 'Section',
  hint: 'Full sky-blue divider',
  build: () => ({
    layout: 'section',
    name: 'Section divider',
    bg: { type: 'solid', color: '#097DC2' },
    notes: '',
    elements: [
      S('ellipse', 10.1, -1.7, 6.2, 6.2, { name: 'Blob', fill: '#4FAEE0', fillOpacity: 0.34 }),
      S('ellipse', -1.6, 4.6, 5.4, 5.4, { name: 'Blob 2', fill: '#05639B', fillOpacity: 0.5 }),
      S('rect', 0.62, 2.44, 0.9, 0.085, { fill: '#FFFFFF', name: 'Accent rule' }),
      T(0.62, 1.62, 4, 0.34, 'SECTION 01', {
        name: 'Eyebrow',
        size: 11,
        bold: true,
        color: '#C9E4F6',
        charSpacing: 2,
        valign: 'middle',
        h: 0.3,
      }),
      T(0.62, 2.82, 10.4, 1.3, 'Section title goes here', {
        name: 'Title',
        size: 40,
        bold: true,
        color: '#FFFFFF',
        lineSpacing: 1.03,
        valign: 'middle',
        h: 1.2,
      }),
      T(0.62, 4.3, 9.4, 0.62, 'One sentence describing what this section covers.', {
        name: 'Subtitle',
        size: 15,
        color: '#E4F2FB',
        lineSpacing: 1.3,
        h: 0.6,
      }),
      logoEl(0.62, 6.2, 0.52, 'white'),
    ],
  }),
}

const bullets: LayoutDef = {
  id: 'bullets',
  name: 'Key points',
  hint: 'Title with bullet list',
  build: () => ({
    layout: 'bullets',
    name: 'Key points',
    bg: { type: 'solid', color: '#FFFFFF' },
    notes: '',
    elements: [
      ...heading('Overview', 'Key points'),
      T(
        M,
        CONTENT_TOP,
        CW - 0.6,
        CONTENT_BOTTOM - CONTENT_TOP,
        [
          'Lead with the single most important message',
          'Support it with **evidence**, not adjectives',
          'Keep each line under two lines of text',
          'Use the right-hand rail for supporting visuals',
          'Close the slide with a clear takeaway',
        ].join('\n'),
        {
          name: 'Body',
          size: 17,
          color: '#0E2A3D',
          lineSpacing: 1.62,
          bullets: true,
          h: 4.4,
        },
      ),
      ...imageSlot(9.28, CONTENT_TOP, 3.44, 4.0, 'Supporting visual'),
      ...furniture(),
    ],
  }),
}

const textImage: LayoutDef = {
  id: 'text-image',
  name: 'Text + image',
  hint: 'Copy on the left, visual on the right',
  build: () => ({
    layout: 'text-image',
    name: 'Text and image',
    bg: { type: 'solid', color: '#FFFFFF' },
    notes: '',
    elements: [
      ...heading('Detail', 'Headline of this slide'),
      T(
        M,
        2.34,
        5.7,
        2.6,
        'Explain the point in a short paragraph. Two or three sentences is usually enough — the bullets below carry the specifics.',
        { name: 'Paragraph', size: 13.5, color: '#4B6779', lineSpacing: 1.5, h: 1.35 },
      ),
      T(
        M,
        3.86,
        5.9,
        2.6,
        ['Replace with your own point', 'Add measurements where you can', 'Tie every line back to the objective'].join(
          '\n',
        ),
        { name: 'Bullets', size: 14, color: '#0E2A3D', lineSpacing: 1.7, bullets: true, h: 2.2 },
      ),
      ...imageSlot(7.02, 2.34, 5.7, 4.1, 'Drop an image here'),
      ...furniture(),
    ],
  }),
}

const imageText: LayoutDef = {
  id: 'image-text',
  name: 'Image + text',
  hint: 'Visual on the left, copy on the right',
  build: () => ({
    layout: 'image-text',
    name: 'Image and text',
    bg: { type: 'solid', color: '#FFFFFF' },
    notes: '',
    elements: [
      ...heading('Detail', 'Headline of this slide'),
      ...imageSlot(M, 2.34, 5.7, 4.1, 'Drop an image here'),
      T(
        7.02,
        2.34,
        5.7,
        2.6,
        'Describe what the visual shows and why it matters to the audience.',
        { name: 'Paragraph', size: 13.5, color: '#4B6779', lineSpacing: 1.5, h: 1.35 },
      ),
      T(
        7.02,
        3.86,
        5.7,
        2.6,
        ['Point one', 'Point two', 'Point three'].join('\n'),
        { name: 'Bullets', size: 14, color: '#0E2A3D', lineSpacing: 1.7, bullets: true, h: 2.2 },
      ),
      ...furniture(),
    ],
  }),
}

const imageGrid: LayoutDef = {
  id: 'image-grid',
  name: 'Image grid',
  hint: 'Three captioned image cards',
  build: () => {
    const els: El[] = [...heading('Gallery', 'Three images, three ideas'), ...furniture()]
    const gap = 0.32
    const cardW = (CW - gap * 2) / 3
    const captions = ['First idea', 'Second idea', 'Third idea']
    for (let i = 0; i < 3; i += 1) {
      const x = M + i * (cardW + gap)
      els.push(...imageSlot(x, 2.34, cardW, 3.1, `Image ${i + 1}`))
      els.push(
        T(x, 5.58, cardW, 0.3, captions[i], {
          size: 14,
          bold: true,
          color: '#05395A',
          valign: 'middle',
          h: 0.28,
        }),
        T(x, 5.9, cardW, 0.5, 'Supporting sentence for this image.', {
          size: 11,
          color: '#4B6779',
          lineSpacing: 1.3,
          h: 0.46,
        }),
      )
    }
    return { layout: 'image-grid', name: 'Image grid', bg: { type: 'solid', color: '#FFFFFF' }, notes: '', elements: els }
  },
}

const stats: LayoutDef = {
  id: 'stats',
  name: 'Key numbers',
  hint: 'Four headline metrics',
  build: () => {
    const els: El[] = [...heading('Performance', 'The numbers that matter'), ...furniture()]
    const data = [
      { v: '98%', l: 'On-time delivery' },
      { v: '24/7', l: 'Support coverage' },
      { v: '3.4×', l: 'Faster turnaround' },
      { v: '120+', l: 'Projects shipped' },
    ]
    const gap = 0.28
    const cardW = (CW - gap * 3) / 4
    data.forEach((d, i) => {
      const x = M + i * (cardW + gap)
      els.push(
        S('roundRect', x, 2.5, cardW, 3.1, {
          name: `Card ${i + 1}`,
          fill: '#F5FAFE',
          line: '#D9E8F3',
          lineWidth: 1,
          radius: 0.16,
        }),
        S('rect', x, 2.5, cardW, 0.085, { fill: '#097DC2', name: 'Card top rule' }),
        T(x + 0.24, 3.02, cardW - 0.48, 0.9, d.v, {
          size: 40,
          bold: true,
          color: '#097DC2',
          valign: 'middle',
          h: 0.86,
        }),
        T(x + 0.24, 3.98, cardW - 0.48, 0.5, d.l, {
          size: 12.5,
          color: '#0E2A3D',
          lineSpacing: 1.25,
          h: 0.46,
        }),
        T(x + 0.24, 4.5, cardW - 0.48, 0.9, 'Add a line of context here.', {
          size: 10.5,
          color: '#8AA4B5',
          lineSpacing: 1.3,
          h: 0.86,
        }),
      )
    })
    return { layout: 'stats', name: 'Key numbers', bg: { type: 'solid', color: '#FFFFFF' }, notes: '', elements: els }
  },
}

const timeline: LayoutDef = {
  id: 'timeline',
  name: 'Timeline',
  hint: 'Five milestones across a rail',
  build: () => {
    const els: El[] = [...heading('Roadmap', 'How we get there'), ...furniture()]
    const phases = ['Discover', 'Design', 'Build', 'Test', 'Launch']
    const railY = 4.32
    const startX = M + 0.52
    const span = CW - 1.04
    const step = span / (phases.length - 1)
    els.push(S('rect', startX, railY - 0.012, span, 0.024, { name: 'Rail', fill: '#C9E4F6' }))
    phases.forEach((p, i) => {
      const cx = startX + i * step
      const above = i % 2 === 1
      els.push(
        S('ellipse', cx - 0.15, railY - 0.15, 0.3, 0.3, {
          name: `Marker ${i + 1}`,
          fill: '#097DC2',
          line: '#FFFFFF',
          lineWidth: 2.5,
        }),
        T(cx - 0.95, above ? railY - 0.95 : railY + 0.34, 1.9, 0.28, `Phase 0${i + 1}`, {
          size: 11,
          bold: true,
          color: '#2E96D3',
          align: 'center',
          valign: 'middle',
          charSpacing: 0.8,
          h: 0.26,
        }),
        T(cx - 0.95, above ? railY - 0.68 : railY + 0.61, 1.9, 0.3, p, {
          size: 14,
          bold: true,
          color: '#05395A',
          align: 'center',
          valign: 'middle',
          h: 0.28,
        }),
        T(cx - 0.95, above ? railY - 0.38 : railY + 0.91, 1.9, 0.5, 'Short description of this stage.', {
          size: 9.5,
          color: '#8AA4B5',
          align: 'center',
          lineSpacing: 1.25,
          h: 0.46,
        }),
      )
    })
    return { layout: 'timeline', name: 'Timeline', bg: { type: 'solid', color: '#FFFFFF' }, notes: '', elements: els }
  },
}

const comparison: LayoutDef = {
  id: 'comparison',
  name: 'Comparison',
  hint: 'Two options side by side',
  build: () => {
    const els: El[] = [...heading('Options', 'Option A vs Option B'), ...furniture()]
    const cardW = (CW - 0.4) / 2
    const sides = [
      { title: 'Option A', tint: '#E4F2FB', ink: '#097DC2', rows: ['Strength one', 'Strength two', 'Strength three'] },
      { title: 'Option B', tint: '#05395A', ink: '#FFFFFF', rows: ['Strength one', 'Strength two', 'Strength three'] },
    ]
    sides.forEach((s, i) => {
      const x = M + i * (cardW + 0.4)
      els.push(
        S('roundRect', x, 2.42, cardW, 3.9, {
          name: `Panel ${i + 1}`,
          fill: s.tint,
          line: i === 0 ? '#C9E4F6' : null,
          lineWidth: 1,
          radius: 0.16,
        }),
        T(x + 0.34, 2.78, cardW - 0.68, 0.4, s.title, {
          size: 20,
          bold: true,
          color: s.ink,
          valign: 'middle',
          h: 0.36,
        }),
        S('rect', x + 0.34, 3.32, 0.7, 0.06, {
          fill: i === 0 ? '#097DC2' : '#4FAEE0',
          name: 'Rule',
        }),
        T(
          x + 0.34,
          3.6,
          cardW - 0.68,
          2.4,
          s.rows.join('\n'),
          {
            size: 14,
            color: i === 0 ? '#0E2A3D' : '#E4F2FB',
            lineSpacing: 1.8,
            bullets: true,
            h: 2.3,
          },
        ),
      )
    })
    return { layout: 'comparison', name: 'Comparison', bg: { type: 'solid', color: '#FFFFFF' }, notes: '', elements: els }
  },
}

const closing: LayoutDef = {
  id: 'closing',
  name: 'Closing',
  hint: 'Thank-you and contact panel',
  build: () => ({
    layout: 'closing',
    name: 'Closing',
    bg: { type: 'solid', color: '#05395A' },
    notes: '',
    elements: [
      S('ellipse', 9.6, -2.4, 7.4, 7.4, { name: 'Blob', fill: '#097DC2', fillOpacity: 0.55 }),
      S('ellipse', -2.6, 4.5, 6.0, 6.0, { name: 'Blob 2', fill: '#05639B', fillOpacity: 0.45 }),
      T(0.78, 2.06, 8, 0.34, 'THANK YOU', {
        name: 'Eyebrow',
        size: 11,
        bold: true,
        color: '#A3D3EF',
        charSpacing: 2.4,
        valign: 'middle',
        h: 0.3,
      }),
      T(0.78, 2.5, 9.4, 1.2, "Let's build what comes next.", {
        name: 'Title',
        size: 40,
        bold: true,
        color: '#FFFFFF',
        lineSpacing: 1.04,
        valign: 'middle',
        h: 1.1,
      }),
      S('rect', 0.8, 3.94, 1.15, 0.085, { fill: '#4FAEE0', name: 'Accent rule' }),
      T(0.78, 4.24, 6.2, 1.5, 'questions@yourcompany.com\n+91 00000 00000\nyourcompany.com', {
        name: 'Contact',
        size: 14,
        color: '#E4F2FB',
        lineSpacing: 1.7,
        h: 1.4,
      }),
      logoEl(0.78, 6.0, 0.62, 'white'),
    ],
  }),
}

const blank: LayoutDef = {
  id: 'blank',
  name: 'Blank',
  hint: 'Empty slide with logo + footer',
  build: () => ({
    layout: 'blank',
    name: 'Blank',
    bg: { type: 'solid', color: '#FFFFFF' },
    notes: '',
    elements: [...furniture()],
  }),
}

export const LAYOUTS: LayoutDef[] = [
  cover,
  agenda,
  section,
  bullets,
  textImage,
  imageText,
  imageGrid,
  stats,
  timeline,
  comparison,
  closing,
  blank,
]

export const layoutById = (id: string): LayoutDef =>
  LAYOUTS.find((l) => l.id === id) ?? bullets

export const newSlide = (layoutId: string, withLogo = true): Slide => {
  const slide = layoutById(layoutId).build()
  const id = uid('sld')
  if (!withLogo) {
    return { ...slide, id, elements: slide.elements.filter((e) => !(e.kind === 'image' && e.brand === 'logo')) }
  }
  return { ...slide, id }
}

/* ---------------------------- starter deck ---------------------------- */

export const STARTER_ORDER = [
  'cover',
  'agenda',
  'section',
  'bullets',
  'text-image',
  'stats',
  'timeline',
  'section',
  'image-grid',
  'comparison',
  'closing',
]

export function buildStarterDeck(): Slide[] {
  return STARTER_ORDER.map((id) => newSlide(id))
}
