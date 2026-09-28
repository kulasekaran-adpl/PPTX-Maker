import React, { useEffect, useState } from 'react'
import { useStore } from '../state/useStore'
import { SlideView } from './SlideView'

/** Full-screen presenter preview — counts as a final visual check. */
export function Preview({ onClose }: { onClose: () => void }) {
  const { deck, currentIndex } = useStore()
  const [i, setI] = useState(currentIndex)
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })

  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') setI((v) => Math.min(deck.slides.length - 1, v + 1))
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') setI((v) => Math.max(0, v - 1))
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('keydown', onKey)
    }
  }, [deck.slides.length, onClose])

  const px = Math.min((size.w - 120) / deck.size.w, (size.h - 140) / deck.size.h)
  const slide = deck.slides[i]

  return (
    <div className="preview-overlay" onClick={onClose}>
      <div className="preview-stage" onClick={(e) => e.stopPropagation()}>
        <SlideView slide={slide} deck={deck} px={px} className="preview-slide" />
      </div>
      <div className="preview-bar" onClick={(e) => e.stopPropagation()}>
        <button className="btn tiny" onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0}>
          ‹
        </button>
        <span>
          Slide {i + 1} / {deck.slides.length}
        </span>
        <button className="btn tiny" onClick={() => setI(Math.min(deck.slides.length - 1, i + 1))} disabled={i === deck.slides.length - 1}>
          ›
        </button>
        <span className="divider" />
        <button className="btn tiny" onClick={onClose}>
          Close (Esc)
        </button>
      </div>
    </div>
  )
}
