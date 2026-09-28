/* ------------------------------------------------------------------
 * ADPL brand system — derived from the company mark (#097DC2).
 * The single "Sky Blue" deck template is built entirely from these
 * tokens, so recolouring here restyles the whole deck.
 * ------------------------------------------------------------------ */

export const SKY = {
  brand: '#097DC2', // ← sampled from the ADPL logo
  brandDark: '#05639B',
  brandDeep: '#05395A',
  light: '#4FAEE0',
  sky50: '#F5FAFE',
  sky100: '#E4F2FB',
  sky200: '#C9E4F6',
  sky300: '#A3D3EF',
  sky400: '#6FB9E4',
  sky500: '#2E96D3',
  ink: '#0E2A3D',
  inkSoft: '#4B6779',
  inkFaint: '#8AA4B5',
  line: '#D9E8F3',
  white: '#FFFFFF',
} as const

export type SkyToken = keyof typeof SKY

/** Swatches offered in the colour picker, in a sensible order. */
export const SWATCHES: { name: string; value: string }[] = [
  { name: 'Brand', value: SKY.brand },
  { name: 'Brand dark', value: SKY.brandDark },
  { name: 'Deep navy', value: SKY.brandDeep },
  { name: 'Sky 400', value: SKY.sky400 },
  { name: 'Sky 300', value: SKY.sky300 },
  { name: 'Sky 200', value: SKY.sky200 },
  { name: 'Sky 100', value: SKY.sky100 },
  { name: 'Sky 50', value: SKY.sky50 },
  { name: 'White', value: SKY.white },
  { name: 'Ink', value: SKY.ink },
  { name: 'Ink soft', value: SKY.inkSoft },
  { name: 'Ink faint', value: SKY.inkFaint },
  { name: 'Hairline', value: SKY.line },
  { name: 'Black', value: '#111111' },
  { name: 'Slate', value: '#5B6B7A' },
  { name: 'Success', value: '#1E9E6A' },
  { name: 'Warning', value: '#E0A106' },
  { name: 'Danger', value: '#D64545' },
]

/** Fonts that exist on both Windows and macOS Office installs come first. */
export const FONTS = [
  'Calibri',
  'Segoe UI',
  'Arial',
  'Inter',
  'Open Sans',
  'Verdana',
  'Tahoma',
  'Trebuchet MS',
  'Georgia',
  'Times New Roman',
  'Courier New',
  'Impact',
]

export const DEFAULT_FONT = 'Calibri'

export const FONT_STACK: Record<string, string> = {
  Calibri: "Calibri, Carlito, 'Segoe UI', system-ui, sans-serif",
  'Segoe UI': "'Segoe UI', Inter, system-ui, sans-serif",
  Arial: 'Arial, Helvetica, sans-serif',
  Inter: "Inter, 'Segoe UI', system-ui, sans-serif",
  'Open Sans': "'Open Sans', 'Segoe UI', sans-serif",
  Verdana: 'Verdana, Geneva, sans-serif',
  Tahoma: 'Tahoma, Geneva, sans-serif',
  'Trebuchet MS': "'Trebuchet MS', sans-serif",
  Georgia: 'Georgia, serif',
  'Times New Roman': "'Times New Roman', Times, serif",
  'Courier New': "'Courier New', monospace",
  Impact: "Impact, 'Arial Black', sans-serif",
}

/** Rendering of the PowerPoint shape enum inside the browser preview. */
export const BRAND_LOGO: Record<string, string> = {
  blue: 'logo/adpl-logo-blue.png',
  white: 'logo/adpl-logo-white.png',
  navy: 'logo/adpl-logo-navy.png',
}

/** width / height of the trimmed ADPL mark */
export const LOGO_ASPECT = 1.646

export const SLIDE_PRESETS = [
  { id: '16x9', name: 'Widescreen 16:9', w: 13.3333, h: 7.5 },
  { id: '4x3', name: 'Standard 4:3', w: 10, h: 7.5 },
  { id: 'a4l', name: 'A4 Landscape', w: 11.6929, h: 8.2677 },
]

export const hexToRgba = (hex: string, alpha: number): string => {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full.slice(0, 6) || '000000', 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export const stripHash = (hex: string): string => (hex || '#000000').replace('#', '')
