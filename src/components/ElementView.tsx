import React, { useEffect, useRef, useState } from 'react'
import type { El, ImageEl, ShapeEl, ShapeKind, TextEl } from '../types'
import { FONT_STACK, hexToRgba } from '../theme'
import { parseRichText } from '../lib/util'

/* ------------------------------------------------------------------
 * ElementView renders ONE document element at a given pixel scale.
 * The same component powers the canvas, the filmstrip thumbnails and the
 * full-screen preview, so what you see is always what you get.
 * ------------------------------------------------------------------ */

export type ScaleFn = (inches: number) => number

/* Normalised (0..1) outlines for every autoshape we expose. */
const PATH: Partial<Record<ShapeKind, string>> = {
  triangle: 'M0.5 0 L1 1 L0 1 Z',
  rtTriangle: 'M0 0 L0 1 L1 1 Z',
  diamond: 'M0.5 0 L1 0.5 L0.5 1 L0 0.5 Z',
  pentagon: 'M0.5 0 L0.9755 0.3455 L0.7939 0.9045 L0.2061 0.9045 L0.0245 0.3455 Z',
  hexagon: 'M0.25 0 L0.75 0 L1 0.5 L0.75 1 L0.25 1 L0 0.5 Z',
  chevron: 'M0 0 L0.75 0 L1 0.5 L0.75 1 L0 1 L0.25 0.5 Z',
  rightArrow: 'M0 0.25 L0.6 0.25 L0.6 0 L1 0.5 L0.6 1 L0.6 0.75 L0 0.75 Z',
  parallelogram: 'M0.25 0 L1 0 L0.75 1 L0 1 Z',
  trapezoid: 'M0.2 0 L0.8 0 L1 1 L0 1 Z',
  star5:
    'M0.5 0 L0.6117 0.3463 L0.9755 0.3455 L0.6807 0.5587 L0.7939 0.9045 L0.5 0.69 L0.2061 0.9045 L0.3193 0.5587 L0.0245 0.3455 L0.3883 0.3463 Z',
  plus:
    'M0.25 0 L0.75 0 L0.75 0.25 L1 0.25 L1 0.75 L0.75 0.75 L0.75 1 L0.25 1 L0.25 0.75 L0 0.75 L0 0.25 L0.25 0.25 Z',
  arc: 'M0.5 1 A0.5 0.5 0 0 1 1 0.5',
}

/** Build an SVG path string from normalised freeform points. */
export const pointsToPath = (points: [number, number][] = []): string =>
  points.length
    ? `${points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ')} Z`
    : ''

export const SHAPE_LABELS: { kind: ShapeKind; label: string }[] = [
  { kind: 'rect', label: 'Rectangle' },
  { kind: 'roundRect', label: 'Rounded' },
  { kind: 'ellipse', label: 'Oval' },
  { kind: 'triangle', label: 'Triangle' },
  { kind: 'rtTriangle', label: 'Right tri.' },
  { kind: 'diamond', label: 'Diamond' },
  { kind: 'pentagon', label: 'Pentagon' },
  { kind: 'hexagon', label: 'Hexagon' },
  { kind: 'chevron', label: 'Chevron' },
  { kind: 'rightArrow', label: 'Arrow' },
  { kind: 'line', label: 'Line' },
  { kind: 'parallelogram', label: 'Parallelogram' },
  { kind: 'trapezoid', label: 'Trapezoid' },
  { kind: 'star5', label: 'Star' },
  { kind: 'plus', label: 'Plus' },
  { kind: 'arc', label: 'Arc' },
]

export const ShapeGlyph = ({ kind, size = 22, color = 'currentColor' }: { kind: ShapeKind; size?: number; color?: string }) => {
  const isBox = kind === 'rect' || kind === 'roundRect' || kind === 'ellipse'
  const stroke = 'rgba(0,0,0,0.35)'
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" aria-hidden>
      {kind === 'rect' && <rect x="3" y="5" width="16" height="12" fill={color} />}
      {kind === 'roundRect' && <rect x="3" y="5" width="16" height="12" rx="3" fill={color} />}
      {kind === 'ellipse' && <ellipse cx="11" cy="11" rx="8" ry="6" fill={color} />}
      {kind === 'line' && <line x1="3" y1="16" x2="19" y2="6" stroke={color} strokeWidth="2.4" />}
      {kind === 'freeform' && (
        <g transform="translate(3 4) scale(16 14)">
          <path d="M0 1 L0.62 1 L1 0 L0.38 0 Z" fill={color} stroke={stroke} strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
        </g>
      )}
      {!isBox && kind !== 'line' && PATH[kind] && (
        <g transform="translate(3 4) scale(16 14)">
          <path
            d={PATH[kind] as string}
            fill={kind === 'arc' ? 'none' : color}
            stroke={kind === 'arc' ? color : stroke}
            strokeWidth={kind === 'arc' ? 2.4 : 0.5}
            vectorEffect="non-scaling-stroke"
          />
        </g>
      )}
    </svg>
  )
}

function ShapeBody({ el, scale }: { el: ShapeEl; scale: ScaleFn }) {
  const w = scale(el.w)
  const h = scale(el.h)
  const px = (v: number) => (v * scale(1)) / 72
  const fill = el.fill ? hexToRgba(el.fill, el.fillOpacity) : 'transparent'
  const borderWidth = el.line && el.lineWidth > 0 ? Math.max(1, px(el.lineWidth)) : 0
  const borderStyle = el.dash === 'dash' ? 'dashed' : el.dash === 'dot' ? 'dotted' : 'solid'
  const common: React.CSSProperties = {
    width: w,
    height: h,
    border: borderWidth ? `${borderWidth}px ${borderStyle} ${hexToRgba(el.line as string, 1)}` : undefined,
    boxSizing: 'border-box',
  }

  if (el.shape === 'line') {
    const thickness = Math.max(1, px(el.lineWidth || 1.5))
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center' }}>
        <div
          style={{
            width: '100%',
            height: thickness,
            background: hexToRgba((el.line ?? el.fill ?? '#097DC2') as string, 1),
            borderRadius: thickness,
          }}
        />
      </div>
    )
  }

  if (el.shape === 'rect') return <div style={{ ...common, background: fill }} />
  if (el.shape === 'roundRect')
    return <div style={{ ...common, background: fill, borderRadius: Math.max(0, scale(el.radius)) }} />
  if (el.shape === 'ellipse')
    return <div style={{ ...common, background: fill, borderRadius: '50%' }} />

  const d = el.shape === 'freeform' ? pointsToPath(el.points) : PATH[el.shape]
  if (!d) return <div style={{ ...common, background: fill }} />
  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      style={{ display: 'block', overflow: 'visible' }}
    >
      <path
        d={d}
        fill={el.shape === 'arc' ? 'none' : fill}
        stroke={borderWidth ? hexToRgba(el.line as string, 1) : undefined}
        strokeWidth={borderWidth || undefined}
        strokeDasharray={el.dash === 'dash' ? `${borderWidth * 4} ${borderWidth * 3}` : el.dash === 'dot' ? `${borderWidth} ${borderWidth * 2}` : undefined}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

function TextBody({ el, scale, editing }: { el: TextEl; scale: ScaleFn; editing: boolean }) {
  const ptToPx = scale(1) / 72
  const paragraphs = parseRichText(el.text, el.bullets)
  const justify =
    el.valign === 'middle' ? 'center' : el.valign === 'bottom' ? 'flex-end' : 'flex-start'

  return (
    <div
      className="el-text"
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: justify,
        alignItems: el.align === 'center' ? 'center' : el.align === 'right' ? 'flex-end' : 'stretch',
        fontFamily: FONT_STACK[el.font] ?? el.font,
        fontSize: el.size * ptToPx,
        fontWeight: el.bold ? 700 : 400,
        fontStyle: el.italic ? 'italic' : 'normal',
        textDecoration: el.underline ? 'underline' : 'none',
        color: el.color,
        lineHeight: el.lineSpacing,
        letterSpacing: `${el.charSpacing * ptToPx}px`,
        textAlign: el.align,
        padding: scale(el.padding),
        boxSizing: 'border-box',
        overflow: 'visible',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      {paragraphs.map((p, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            gap: scale(0.11),
            width: '100%',
            justifyContent: 'inherit',
            alignItems: 'flex-start',
          }}
        >
          {p.bullet && (
            <span
              style={{
                flex: 'none',
                width: scale(0.13),
                opacity: 0.85,
                lineHeight: 'inherit',
                fontSize: '0.9em',
              }}
            >
              •
            </span>
          )}
          <span style={{ flex: p.bullet ? 1 : undefined, whiteSpace: 'pre-wrap' }}>
            {p.runs.length === 0
              ? '\u00A0'
              : p.runs.map((r, j) => (
                  <span
                    key={j}
                    style={{
                      fontWeight: r.bold ? 700 : undefined,
                      fontStyle: r.italic ? 'italic' : undefined,
                      textDecoration: r.underline ? 'underline' : undefined,
                      color: r.color,
                      fontSize: r.size ? r.size * ptToPx : undefined,
                    }}
                  >
                    {r.text}
                  </span>
                ))}
          </span>
        </div>
      ))}
      {editing ? null : null}
    </div>
  )
}

export interface ElementViewProps {
  el: El
  scale: ScaleFn
  interactive?: boolean
  onOverflow?: (id: string, overflowing: boolean) => void
  onPointerDown?: (e: React.PointerEvent) => void
}

export function ElementView({ el, scale, onOverflow, interactive, onPointerDown }: ElementViewProps) {
  const [overflow, setOverflow] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!onOverflow || el.kind !== 'text') return
    const node = box.current
    if (!node) return
    const inner = node.firstElementChild as HTMLElement | null
    if (!inner) return
    const check = () => {
      const over = inner.scrollHeight > node.clientHeight + 2
      setOverflow(over)
      onOverflow(el.id, over)
    }
    check()
    const ro = new ResizeObserver(check)
    ro.observe(node)
    return () => ro.disconnect()
  }, [el, onOverflow, scale])

  const style: React.CSSProperties = {
    position: 'absolute',
    left: scale(el.x),
    top: scale(el.y),
    width: scale(el.w),
    height: scale(el.h),
    transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
    transformOrigin: 'center center',
    opacity: el.opacity,
    boxShadow: el.shadow
      ? `${scale(el.shadow.offset / 96)}px ${scale(el.shadow.offset / 96)}px ${scale(el.shadow.blur / 96)}px ${hexToRgba(
          el.shadow.color,
          el.shadow.opacity,
        )}`
      : undefined,
    pointerEvents: interactive ? 'auto' : 'none',
    cursor: interactive ? 'move' : 'default',
    borderRadius: el.kind === 'shape' ? undefined : scale(0.01),
  }

  let inner: React.ReactNode = null
  if (el.kind === 'text') {
    inner = (
      <div
        ref={box}
        style={{
          width: '100%',
          height: '100%',
          background: el.fill ? hexToRgba(el.fill, el.opacity) : undefined,
          borderRadius: scale(0.04),
          outline: overflow ? `${Math.max(1, scale(0.012))}px dashed #E0A106` : undefined,
          outlineOffset: 2,
        }}
      >
        <TextBody el={el} scale={scale} editing={false} />
      </div>
    )
  } else if (el.kind === 'shape') {
    inner = <ShapeBody el={el} scale={scale} />
  } else {
    const img = el as ImageEl
    inner = (
      <div
        style={{
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          borderRadius: scale(img.radius),
          border: img.borderColor && img.borderWidth > 0
            ? `${Math.max(1, (img.borderWidth * scale(1)) / 72)}px solid ${img.borderColor}`
            : undefined,
          boxSizing: 'border-box',
        }}
      >
        <img
          src={img.src}
          alt={img.alt}
          draggable={false}
          style={{
            width: '100%',
            height: '100%',
            objectFit: img.fit === 'stretch' ? 'fill' : img.fit,
            objectPosition: 'center',
            display: 'block',
          }}
        />
      </div>
    )
  }

  return (
    <div
      className="el"
      data-kind={el.kind}
      style={style}
      data-elid={el.id}
      data-locked={el.locked ? '1' : undefined}
      data-overflow={overflow ? '1' : undefined}
      onPointerDown={onPointerDown}
    >
      {inner}
    </div>
  )
}
