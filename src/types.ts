/* ------------------------------------------------------------------
 * Core document model.
 * All geometry is stored in INCHES so it maps 1:1 onto PowerPoint's
 * coordinate system (and onto pptxgenjs), which keeps the on-screen
 * canvas and the exported .pptx in sync.
 * ------------------------------------------------------------------ */

export interface SlideSize {
  w: number
  h: number
}

export type HAlign = 'left' | 'center' | 'right' | 'justify'
export type VAlign = 'top' | 'middle' | 'bottom'

export interface ShadowSpec {
  color: string
  opacity: number // 0..1
  blur: number // pt
  offset: number // pt
  angle: number // degrees
}

export interface BaseEl {
  id: string
  name?: string
  x: number
  y: number
  w: number
  h: number
  rotation: number // degrees, clockwise
  opacity: number // 0..1
  locked?: boolean
  hidden?: boolean
  shadow?: ShadowSpec | null
}

export interface TextEl extends BaseEl {
  kind: 'text'
  text: string
  font: string
  size: number // pt
  color: string
  bold: boolean
  italic: boolean
  underline: boolean
  align: HAlign
  valign: VAlign
  lineSpacing: number // line-height multiple
  charSpacing: number // pt
  bullets: boolean
  fill: string | null
  padding: number // inches
}

export type AnyImageFit = 'cover' | 'contain' | 'stretch'

export interface ImageEl extends BaseEl {
  kind: 'image'
  src: string // data: URL or absolute/relative URL
  fit: AnyImageFit
  radius: number // inches
  borderColor: string | null
  borderWidth: number // pt
  alt: string
  /** brand asset lock: keeps the ADPL mark crisp and on-palette */
  brand?: 'logo'
}

export type ShapeKind =
  | 'rect'
  | 'roundRect'
  | 'ellipse'
  | 'triangle'
  | 'rtTriangle'
  | 'diamond'
  | 'pentagon'
  | 'hexagon'
  | 'chevron'
  | 'rightArrow'
  | 'line'
  | 'parallelogram'
  | 'trapezoid'
  | 'star5'
  | 'plus'
  | 'arc'
  /** exact polygon — used for diagonal art; needs no rotation, so every
   *  renderer (PowerPoint, Google Slides, LibreOffice, Keynote) draws the
   *  same shape */
  | 'freeform'

export interface ShapeEl extends BaseEl {
  kind: 'shape'
  shape: ShapeKind
  fill: string | null
  fillOpacity: number
  line: string | null
  lineWidth: number // pt
  dash: 'solid' | 'dash' | 'dot'
  radius: number // inches (roundRect only)
  /** polygon outline for shape === 'freeform', normalised to the element box
   *  (0..1 on both axes) so it scales with the box and needs no rotation */
  points?: [number, number][]
}

export type El = TextEl | ImageEl | ShapeEl

export type Background =
  | { type: 'solid'; color: string }
  | { type: 'gradient'; from: string; to: string; angle: number }
  | {
      type: 'image'
      src: string
      fit: 'cover' | 'contain'
      overlay: string | null
      overlayOpacity: number
    }
  | { type: 'none' }

export interface Slide {
  id: string
  /** which sky-blue layout this slide was generated from */
  layout: string
  name: string
  bg: Background
  elements: El[]
  notes: string
}

export type LogoVariant = 'blue' | 'white' | 'navy'

export interface Deck {
  /** bumped when the document model changes; older decks are migrated on load */
  schema: number
  id: string
  title: string
  size: SlideSize
  theme: 'sky-blue'
  showLogo: boolean
  logoVariant: LogoVariant
  pageNumbers: boolean
  footer: string
  slides: Slide[]
}

export interface Project {
  deck: Deck
  savedAt: number
  app: string
}

/* ---------- helpers used across the app ---------- */

export const isText = (e: El): e is TextEl => e.kind === 'text'
export const isImage = (e: El): e is ImageEl => e.kind === 'image'
export const isShape = (e: El): e is ShapeEl => e.kind === 'shape'
