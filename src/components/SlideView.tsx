import React from 'react'
import type { Deck, El, Slide } from '../types'
import { ElementView } from './ElementView'
import { hexToRgba } from '../theme'

/* ------------------------------------------------------------------
 * A single slide rendered at `px` pixels per inch.
 * Used by the canvas, the filmstrip and the preview modal.
 * ------------------------------------------------------------------ */

export interface SlideViewProps {
  slide: Slide
  deck: Deck
  px: number
  interactive?: boolean
  onOverflow?: (id: string, over: boolean) => void
  hideIds?: string[]
  className?: string
  style?: React.CSSProperties
  children?: React.ReactNode
  onElementPointerDown?: (e: React.PointerEvent, id: string) => void
}

export function backgroundCss(slide: Slide, px: number): React.CSSProperties {
  const bg = slide.bg
  switch (bg.type) {
    case 'solid':
      return { background: bg.color }
    case 'gradient':
      return { background: `linear-gradient(${bg.angle}deg, ${bg.from}, ${bg.to})` }
    case 'image':
      return {
        backgroundColor: '#FFFFFF',
        backgroundImage: `url("${bg.src}")`,
        backgroundSize: bg.fit === 'cover' ? 'cover' : 'contain',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }
    default:
      return { background: '#FFFFFF' }
  }
}

export function SlideView({
  slide,
  deck,
  px,
  interactive = false,
  onOverflow,
  hideIds = [],
  className,
  style,
  children,
  onElementPointerDown,
}: SlideViewProps) {
  const scale = (v: number) => v * px
  const bg = slide.bg

  return (
    <div
      className={`slide ${className ?? ''}`}
      style={{
        position: 'relative',
        width: deck.size.w * px,
        height: deck.size.h * px,
        overflow: 'hidden',
        ...backgroundCss(slide, px),
        ...style,
      }}
    >
      {bg.type === 'image' && bg.overlay ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: hexToRgba(bg.overlay, bg.overlayOpacity),
            pointerEvents: 'none',
          }}
        />
      ) : null}

      {slide.elements.map((el: El) => {
        if (el.hidden) return null
        if (hideIds.includes(el.id)) return null
        return (
          <ElementView
            key={el.id}
            el={el}
            scale={scale}
            onOverflow={onOverflow}
            interactive={interactive}
            onPointerDown={onElementPointerDown ? (e) => onElementPointerDown(e, el.id) : undefined}
          />
        )
      })}
      {children}
    </div>
  )
}
