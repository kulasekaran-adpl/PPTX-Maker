import React, { useRef, useState } from 'react'
import type { El, ShapeKind } from '../types'
import { useStore } from '../state/useStore'
import { SlideView } from './SlideView'
import { LAYOUTS } from '../templates/skyBlue'
import { SKY } from '../theme'
import { LayoutThumb } from './LayoutThumb'
import { ShapeGlyph, SHAPE_LABELS } from './ElementView'
import { uid } from '../lib/util'
import { Section } from './ui'

/* ------------------------------------------------------------------
 * Left rail: slide filmstrip + insert palette.
 * ------------------------------------------------------------------ */

export function LeftRail({ onPresent }: { onPresent: () => void }) {
  const [tab, setTab] = useState<'slides' | 'insert'>('slides')

  return (
    <aside className="rail">
      <div className="rail-tabs">
        <button className="rail-tab" data-active={tab === 'slides'} onClick={() => setTab('slides')}>
          Slides
        </button>
        <button className="rail-tab" data-active={tab === 'insert'} onClick={() => setTab('insert')}>
          Insert
        </button>
      </div>
      {tab === 'slides' ? <SlideList /> : <InsertPanel onPresent={onPresent} />}
    </aside>
  )
}

/* --------------------------- filmstrip --------------------------- */

function SlideList() {
  const store = useStore()
  const { deck, currentIndex, selectSlide, addSlide, duplicateSlide, deleteSlide, moveSlide, insertBrandLogo } = store
  const [dragging, setDragging] = useState<number | null>(null)
  const [over, setOver] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)
  const px = 132 / deck.size.w

  return (
    <div className="rail-body">
      <div className="rail-toolbar">
        <button className="btn tiny primary" onClick={() => setAdding((a) => !a)}>
          + Add slide
        </button>
        <span className="grow" />
        <span className="count">{deck.slides.length}</span>
      </div>

      {adding && (
        <div className="add-layouts">
          {LAYOUTS.map((l) => (
            <button
              key={l.id}
              className="add-layout"
              title={`Add “${l.name}”`}
              onClick={() => {
                addSlide(l.id)
                setAdding(false)
              }}
            >
              <LayoutThumb id={l.id} />
              <span>{l.name}</span>
            </button>
          ))}
        </div>
      )}

      <div className="slides">
        {deck.slides.map((slide, i) => (
          <div
            key={slide.id}
            className={`slide-item ${i === currentIndex ? 'active' : ''} ${over === i ? 'drop-target' : ''}`}
            draggable
            onDragStart={() => setDragging(i)}
            onDragOver={(e) => {
              e.preventDefault()
              setOver(i)
            }}
            onDragLeave={() => setOver((o) => (o === i ? null : o))}
            onDrop={(e) => {
              e.preventDefault()
              if (dragging !== null) moveSlide(dragging, i)
              setDragging(null)
              setOver(null)
            }}
            onDragEnd={() => {
              setDragging(null)
              setOver(null)
            }}
          >
            <button className="slide-num" onClick={() => selectSlide(i)} title={`Go to slide ${i + 1}`}>
              {i + 1}
            </button>
            <button className="slide-thumb" onClick={() => selectSlide(i)} title={slide.name}>
              <SlideView slide={slide} deck={deck} px={px} />
            </button>
            <div className="slide-tools">
              <button title="Duplicate slide" onClick={() => duplicateSlide(i)}>⧉</button>
              <button title="Delete slide" onClick={() => deleteSlide(i)}>🗑</button>
            </div>
          </div>
        ))}
        <button className="slide-add" onClick={() => addSlide('blank')}>
          + Blank slide
        </button>
        <button className="slide-add ghost" onClick={() => insertBrandLogo()}>
          + ADPL logo on this slide
        </button>
      </div>
    </div>
  )
}

/* ---------------------------- insert ---------------------------- */

function InsertPanel({ onPresent }: { onPresent: () => void }) {
  const store = useStore()
  const { deck, addElement, addSlide, insertImageFiles, insertBrandLogo, currentSlide, prefs } = store
  const fileRef = useRef<HTMLInputElement>(null)
  const [hover, setHover] = useState(false)

  const textPresets: { label: string; make: () => El }[] = [
    {
      label: 'Title',
      make: () => ({
        id: uid('txt'),
        kind: 'text',
        text: 'Add your headline',
        font: 'Calibri',
        size: 32,
        color: SKY.brandDeep,
        bold: true,
        italic: false,
        underline: false,
        align: 'left',
        valign: 'top',
        lineSpacing: 1.08,
        charSpacing: 0,
        bullets: false,
        fill: null,
        padding: 0,
        x: 0.9,
        y: 1.5,
        w: 8.4,
        h: 1,
        rotation: 0,
        opacity: 1,
        shadow: null,
      }),
    },
    {
      label: 'Body text',
      make: () => ({
        id: uid('txt'),
        kind: 'text',
        text: 'Write a short paragraph that supports the headline.',
        font: 'Calibri',
        size: 15,
        color: SKY.ink,
        bold: false,
        italic: false,
        underline: false,
        align: 'left',
        valign: 'top',
        lineSpacing: 1.45,
        charSpacing: 0,
        bullets: false,
        fill: null,
        padding: 0,
        x: 0.9,
        y: 3,
        w: 7.2,
        h: 1.4,
        rotation: 0,
        opacity: 1,
        shadow: null,
      }),
    },
    {
      label: 'Bullets',
      make: () => ({
        id: uid('txt'),
        kind: 'text',
        text: 'First point\nSecond point\nThird point',
        font: 'Calibri',
        size: 15,
        color: SKY.ink,
        bold: false,
        italic: false,
        underline: false,
        align: 'left',
        valign: 'top',
        lineSpacing: 1.7,
        charSpacing: 0,
        bullets: true,
        fill: null,
        padding: 0,
        x: 0.9,
        y: 2.6,
        w: 7.2,
        h: 2.6,
        rotation: 0,
        opacity: 1,
        shadow: null,
      }),
    },
    {
      label: 'Caption',
      make: () => ({
        id: uid('txt'),
        kind: 'text',
        text: 'Figure 1 · short caption',
        font: 'Calibri',
        size: 10.5,
        color: SKY.inkFaint,
        bold: false,
        italic: false,
        underline: false,
        align: 'left',
        valign: 'top',
        lineSpacing: 1.3,
        charSpacing: 0.2,
        bullets: false,
        fill: null,
        padding: 0,
        x: 0.9,
        y: 6.2,
        w: 5.4,
        h: 0.3,
        rotation: 0,
        opacity: 1,
        shadow: null,
      }),
    },
  ]

  const makeShape = (kind: ShapeKind): El => ({
    id: uid('shp'),
    kind: 'shape',
    shape: kind,
    fill: SKY.brand,
    fillOpacity: 1,
    line: null,
    lineWidth: 0,
    dash: 'solid',
    radius: 0.14,
    x: 1.4,
    y: 1.6,
    w: kind === 'line' ? 4.6 : 3.2,
    h: kind === 'line' ? 0.1 : 2,
    rotation: 0,
    opacity: 1,
    shadow: null,
  })

  const usedImages = React.useMemo(() => {
    const map = new Map<string, string>()
    deck.slides.forEach((s) =>
      s.elements.forEach((e) => {
        if (e.kind === 'image' && !e.brand) map.set(e.src, e.name || 'Image')
      }),
    )
    return Array.from(map.entries()).slice(0, 12)
  }, [deck.slides])

  return (
    <div className="rail-body">
      <div
        className={`drop-zone ${hover ? 'hot' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setHover(true)
        }}
        onDragLeave={() => setHover(false)}
        onDrop={(e) => {
          e.preventDefault()
          setHover(false)
          void insertImageFiles(Array.from(e.dataTransfer.files))
        }}
        onClick={() => fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            void insertImageFiles(Array.from(e.target.files ?? []))
            e.target.value = ''
          }}
        />
        <b>Add image</b>
        <span>Click to browse, or drop a file here</span>
      </div>

      {usedImages.length > 0 && (
        <Section title="Reuse from this deck" defaultOpen={false}>
          <div className="asset-strip">
            {usedImages.map(([src, name]) => (
              <button
                key={src}
                className="asset"
                title={name}
                onClick={() =>
                  addElement({
                    ...makeShape('rect'),
                    kind: 'image',
                    src,
                    name,
                    alt: name,
                    fit: 'cover',
                    radius: 0.06,
                    w: 4.6,
                    h: 3,
                  } as El)
                }
              >
                <img src={src} alt={name} />
              </button>
            ))}
          </div>
        </Section>
      )}

      <Section title="Brand">
        <div className="row" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {(['blue', 'white', 'navy'] as const).map((v) => (
            <button
              key={v}
              className="logo-btn"
              data-active={prefs.logoVariant === v}
              onClick={() => insertBrandLogo(v)}
              title={`Insert ${v} ADPL logo`}
            >
              <img src={`logo/adpl-logo-${v}.png`} alt={`ADPL ${v}`} />
            </button>
          ))}
        </div>
        <p className="hint">
          Use the <b>white</b> logo on the sky-blue and deep-navy backgrounds, <b>blue</b> on white.
        </p>
      </Section>

      <Section title="Text">
        <div className="quick-grid">
          {textPresets.map((p) => (
            <button key={p.label} className="btn tiny" onClick={() => addElement(p.make())}>
              {p.label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Shapes">
        <div className="shape-grid">
          {SHAPE_LABELS.map((s) => (
            <button key={s.kind} className="shape-btn" title={s.label} onClick={() => addElement(makeShape(s.kind))}>
              <ShapeGlyph kind={s.kind} color={SKY.brand} />
            </button>
          ))}
        </div>
      </Section>

      <Section title="Slides">
        <div className="quick-grid">
          <button className="btn tiny" onClick={() => addSlide('bullets')}>
            Bullet slide
          </button>
          <button className="btn tiny" onClick={() => addSlide('text-image')}>
            Text + image
          </button>
          <button className="btn tiny" onClick={() => addSlide('stats')}>
            Key numbers
          </button>
          <button className="btn tiny" onClick={() => addSlide('timeline')}>
            Timeline
          </button>
        </div>
      </Section>

      <button className="btn wide" onClick={onPresent} title="Play the deck in full screen">
        ▶ Present deck
      </button>
      <p className="hint">
        Slide {deck.slides.indexOf(currentSlide) + 1} of {deck.slides.length} · everything autosaves in this browser.
      </p>
    </div>
  )
}
