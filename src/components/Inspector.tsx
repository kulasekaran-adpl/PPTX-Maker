import React, { useMemo, useRef } from 'react'
import type { Background, Deck, El, ImageEl, ShapeEl, TextEl } from '../types'
import { useStore } from '../state/useStore'
import { DEFAULT_FONT, FONTS, SKY, SLIDE_PRESETS, SLIDES_SAFE_FONTS } from '../theme'
import { LAYOUTS } from '../templates/skyBlue'
import { downloadBlob, loadImageSize, normalizeUpload, safeFileName } from '../lib/util'
import { ColorField, Field, IconBtn, NumberInput, Row, Section, Seg, Select, TextInput, Toggle } from './ui'
import { ShapeGlyph, SHAPE_LABELS } from './ElementView'
import { LayoutThumb } from './LayoutThumb'

/* Small glyphs keep the panel readable without an icon library. */
const G = {
  bold: <b>B</b>,
  italic: <i>I</i>,
  underline: <u>U</u>,
  bullet: <span>•≡</span>,
  front: <span title="Bring to front">⤒</span>,
  back: <span title="Send to back">⤓</span>,
  up: <span>▲</span>,
  down: <span>▼</span>,
}

export function Inspector() {
  const store = useStore()
  const { currentSlide, selection, selectedEls, patchEls, patchSlide, deck, patchDeck } = store

  const apply = (patch: Partial<El> | ((el: El) => Partial<El>), live = false) => {
    if (live) {
      patchEls(selection, patch, 'begin')
      patchEls(selection, patch, 'live')
      patchEls([], null, 'end')
    } else {
      patchEls(selection, patch)
    }
  }

  if (selection.length > 0 && selectedEls.length > 0) {
    return <ElementInspector apply={apply} />
  }

  return (
    <div className="panel-body">
      <SlideSettings patchSlide={patchSlide} />
      <LayoutPicker />
      <DeckSettings deck={deck} patchDeck={patchDeck} />
    </div>
  )
}

/* ================================================================== */
/*  ELEMENT INSPECTOR                                                 */
/* ================================================================== */

function ElementInspector({ apply }: { apply: (patch: Partial<El> | ((el: El) => Partial<El>), live?: boolean) => void }) {
  const store = useStore()
  const { selectedEls, selection, patchEls, deleteSelection, duplicateSelection, reorder, align, deck } = store
  const first = selectedEls[0]
  const many = selectedEls.length > 1
  const text = first.kind === 'text' ? (first as TextEl) : null
  const image = first.kind === 'image' ? (first as ImageEl) : null
  const shape = first.kind === 'shape' ? (first as ShapeEl) : null
  const fileRef = useRef<HTMLInputElement>(null)

  const mixed = (key: string) =>
    many &&
    selectedEls.some(
      (e) =>
        (e as unknown as Record<string, unknown>)[key] !==
        (first as unknown as Record<string, unknown>)[key],
    )

  const kindLabel = many ? `${selectedEls.length} objects` : text ? 'Text box' : image ? (image.brand ? 'ADPL logo' : 'Picture') : 'Shape'

  return (
    <div className="panel-body">
      <div className="el-head">
        <div className="el-title">
          <span className={`dot kind-${first.kind}`} />
          <b>{kindLabel}</b>
        </div>
        <div className="el-actions">
          <IconBtn title="Duplicate (Ctrl+D)" onClick={duplicateSelection}>⧉</IconBtn>
          <IconBtn title={first.hidden ? 'Show' : 'Hide'} onClick={() => apply({ hidden: !first.hidden })}>
            {first.hidden ? '◌' : '◉'}
          </IconBtn>
          <IconBtn title={first.locked ? 'Unlock' : 'Lock'} onClick={() => apply({ locked: !first.locked })} active={first.locked}>
            {first.locked ? '🔒' : '🔓'}
          </IconBtn>
          <IconBtn title="Delete" onClick={deleteSelection} danger>🗑</IconBtn>
        </div>
      </div>

      <Section title="Position & size">
        <Row>
          <Field label="X">
            <NumberInput value={first.x} step={0.05} onChange={(v) => apply({ x: v })} />
          </Field>
          <Field label="Y">
            <NumberInput value={first.y} step={0.05} onChange={(v) => apply({ y: v })} />
          </Field>
          <Field label="Width">
            <NumberInput value={first.w} step={0.05} min={0.12} onChange={(v) => apply({ w: v })} />
          </Field>
          <Field label="Height">
            <NumberInput value={first.h} step={0.05} min={0.12} onChange={(v) => apply({ h: v })} />
          </Field>
        </Row>
        <Row>
          <Field label="Rotation">
            <NumberInput value={first.rotation} step={1} onChange={(v) => apply({ rotation: ((v % 360) + 360) % 360 })} suffix="°" />
          </Field>
          <Field label="Opacity">
            <input
              className="range"
              type="range"
              min={5}
              max={100}
              value={Math.round(first.opacity * 100)}
              onChange={(e) => apply({ opacity: Number(e.target.value) / 100 }, true)}
            />
          </Field>
        </Row>
        {image && !image.brand ? (
          <button
            className="btn tiny wide"
            onClick={async () => {
              const { w: iw, h: ih } = await loadImageSize(image.src)
              const aspect = iw / Math.max(1, ih)
              apply({ h: Math.round((image.w / aspect) * 1000) / 1000 })
            }}
          >
            Match box to image aspect ratio
          </button>
        ) : null}
        {deck.size ? (
          <div className="quick-grid">
            <button className="btn tiny" onClick={() => apply({ x: 0.62 })}>Left margin</button>
            <button className="btn tiny" onClick={() => apply({ x: Math.round((deck.size.w - first.w) / 2 * 1000) / 1000 })}>Centre H</button>
            <button className="btn tiny" onClick={() => apply({ y: Math.round((deck.size.h - first.h) / 2 * 1000) / 1000 })}>Centre V</button>
            <button className="btn tiny" onClick={() => apply({ x: Math.round((deck.size.w - 0.62 - first.w) * 1000) / 1000 })}>Right margin</button>
          </div>
        ) : null}
      </Section>

      <Section title="Arrange">
        <div className="row" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <IconBtn title="Bring to front" onClick={() => reorder('front')}>⤒</IconBtn>
          <IconBtn title="Bring forward" onClick={() => reorder('forward')}>↑</IconBtn>
          <IconBtn title="Send backward" onClick={() => reorder('backward')}>↓</IconBtn>
          <IconBtn title="Send to back" onClick={() => reorder('back')}>⤓</IconBtn>
        </div>
        {many && (
          <>
            <div className="row" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
              <IconBtn title="Align left" onClick={() => align('left')}>⇤</IconBtn>
              <IconBtn title="Align centre" onClick={() => align('hcenter')}>⇔</IconBtn>
              <IconBtn title="Align right" onClick={() => align('right')}>⇥</IconBtn>
              <IconBtn title="Distribute horizontally" onClick={() => align('hdist')}>↔</IconBtn>
            </div>
            <div className="row" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
              <IconBtn title="Align top" onClick={() => align('top')}>⤒</IconBtn>
              <IconBtn title="Align middle" onClick={() => align('vcenter')}>⇕</IconBtn>
              <IconBtn title="Align bottom" onClick={() => align('bottom')}>⤓</IconBtn>
              <IconBtn title="Distribute vertically" onClick={() => align('vdist')}>↕</IconBtn>
            </div>
          </>
        )}
        <Row cols={1}>
          <Field label="Layer name">
            <TextInput value={first.name ?? ''} placeholder={kindLabel} onChange={(v) => apply({ name: v })} />
          </Field>
        </Row>
      </Section>

      {text && (
        <Section title="Text">
          <Row cols={1}>
            <Field label={`Content ${many ? '(applies to all selected)' : ''}`} hint="**bold** · *italic* · __underline__ · start a line with - for a bullet">
              <textarea
                className="input textarea"
                value={many ? '' : text.text}
                placeholder={many ? 'Multiple text boxes selected' : 'Type your text…'}
                onFocus={() => patchEls(selection, null, 'begin')}
                onChange={(e) => patchEls(selection, { text: e.target.value } as Partial<El>, 'live')}
                onBlur={() => patchEls([], null, 'end')}
              />
            </Field>
          </Row>
          <p className="hint">
            Inline markup: <code>**bold**</code> <code>*italic*</code> <code>__underline__</code> — press{' '}
            <kbd>Esc</kbd> in the canvas to stop editing.
          </p>
          <Row>
            <Field label="Font">
              <Select value={text.font} onChange={(v) => apply({ font: v })} options={FONTS.map((f) => ({ value: f, label: f }))} />
            </Field>
            <Field label="Size">
              <NumberInput value={text.size} min={6} max={200} step={0.5} onChange={(v) => apply({ size: v })} suffix="pt" />
            </Field>
          </Row>
          <Row>
            <div className="field">
              <span className="field-label">Style</span>
              <div className="row" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                <IconBtn title="Bold" active={text.bold && !mixed('bold')} onClick={() => apply({ bold: !text.bold })}>{G.bold}</IconBtn>
                <IconBtn title="Italic" active={text.italic} onClick={() => apply({ italic: !text.italic })}>{G.italic}</IconBtn>
                <IconBtn title="Underline" active={text.underline} onClick={() => apply({ underline: !text.underline })}>{G.underline}</IconBtn>
                <IconBtn title="Bullets" active={text.bullets} onClick={() => apply({ bullets: !text.bullets })}>{G.bullet}</IconBtn>
              </div>
            </div>
            <ColorField label="Colour" value={text.color} onChange={(v) => apply({ color: v ?? SKY.ink })} />
          </Row>
          <Row>
            <div className="field">
              <span className="field-label">Horizontal</span>
              <Seg
                value={text.align}
                onChange={(v) => apply({ align: v })}
                options={[
                  { value: 'left', label: '⬅' },
                  { value: 'center', label: '⬌' },
                  { value: 'right', label: '➡' },
                  { value: 'justify', label: '☰' },
                ]}
              />
            </div>
            <div className="field">
              <span className="field-label">Vertical</span>
              <Seg
                value={text.valign}
                onChange={(v) => apply({ valign: v })}
                options={[
                  { value: 'top', label: '⬆' },
                  { value: 'middle', label: '⇕' },
                  { value: 'bottom', label: '⬇' },
                ]}
              />
            </div>
          </Row>
          <Row>
            <Field label="Line spacing">
              <NumberInput value={text.lineSpacing} step={0.05} min={0.6} max={3} onChange={(v) => apply({ lineSpacing: v })} />
            </Field>
            <Field label="Letter spacing">
              <NumberInput value={text.charSpacing} step={0.2} min={-2} max={10} onChange={(v) => apply({ charSpacing: v })} suffix="pt" />
            </Field>
          </Row>
          <Row>
            <Field label="Box padding">
              <NumberInput value={text.padding} step={0.02} min={0} max={1} onChange={(v) => apply({ padding: v })} suffix="in" />
            </Field>
            <ColorField label="Fill" value={text.fill} allowNone onChange={(v) => apply({ fill: v })} />
          </Row>
          <div className="quick-grid">
            <button className="btn tiny" onClick={() => apply({ size: 40, bold: true, color: SKY.brandDeep, lineSpacing: 1.05 })}>Title</button>
            <button className="btn tiny" onClick={() => apply({ size: 20, bold: false, color: SKY.inkSoft, lineSpacing: 1.25 })}>Subtitle</button>
            <button className="btn tiny" onClick={() => apply({ size: 14, bold: false, color: SKY.ink, lineSpacing: 1.5 })}>Body</button>
            <button className="btn tiny" onClick={() => apply({ size: 10, bold: true, color: SKY.brand, charSpacing: 1.6 })}>Eyebrow</button>
          </div>
        </Section>
      )}

      {image && (
        <Section title="Picture">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              const src = await normalizeUpload(file)
              apply({ src, name: file.name.replace(/\.[a-z0-9]+$/i, '') } as Partial<El>)
              e.target.value = ''
            }}
          />
          <button className="btn tiny wide" onClick={() => fileRef.current?.click()} disabled={!!image.brand}>
            Replace picture…
          </button>
          <div className="field">
            <span className="field-label">Fit</span>
            <Seg
              value={image.fit}
              onChange={(v) => apply({ fit: v })}
              options={[
                { value: 'cover', label: 'Fill', title: 'Cover — crops to fill the box' },
                { value: 'contain', label: 'Fit', title: 'Contain — letterboxed, nothing cropped' },
                { value: 'stretch', label: 'Stretch', title: 'Stretch to the box (may distort)' },
              ]}
            />
          </div>
          <Row>
            <Field label="Corner radius">
              <NumberInput value={image.radius} step={0.02} min={0} max={2} onChange={(v) => apply({ radius: v })} suffix="in" />
            </Field>
            <Field label="Border width">
              <NumberInput value={image.borderWidth} step={0.25} min={0} max={12} onChange={(v) => apply({ borderWidth: v })} suffix="pt" />
            </Field>
          </Row>
          <Row>
            <ColorField label="Border" value={image.borderColor} allowNone onChange={(v) => apply({ borderColor: v })} />
            <Field label="Alt text">
              <TextInput value={image.alt} onChange={(v) => apply({ alt: v })} placeholder="Describes the image" />
            </Field>
          </Row>
          <div className="quick-grid">
            <button className="btn tiny" onClick={() => apply({ radius: 0 })}>Square</button>
            <button className="btn tiny" onClick={() => apply({ radius: 0.08 })}>Soft corners</button>
            <button className="btn tiny" onClick={() => apply({ radius: 0.3 })}>Round</button>
            <button className="btn tiny" onClick={() => apply({ radius: 3, w: first.h, h: first.w })}>Circle-ish</button>
          </div>
        </Section>
      )}

      {shape && (
        <Section title="Shape">
          <div className="shape-grid">
            {SHAPE_LABELS.map((s) => (
              <button
                key={s.kind}
                className="shape-btn"
                data-active={shape.shape === s.kind}
                title={s.label}
                onClick={() => apply({ shape: s.kind } as Partial<El>)}
              >
                <ShapeGlyph kind={s.kind} color={SKY.brand} />
              </button>
            ))}
          </div>
          <Row>
            <ColorField label="Fill" value={shape.fill} allowNone onChange={(v) => apply({ fill: v })} />
            <Field label="Fill opacity">
              <input
                className="range"
                type="range"
                min={0}
                max={100}
                value={Math.round(shape.fillOpacity * 100)}
                onChange={(e) => apply({ fillOpacity: Number(e.target.value) / 100 }, true)}
              />
            </Field>
          </Row>
          <Row>
            <ColorField label="Outline" value={shape.line} allowNone onChange={(v) => apply({ line: v })} />
            <Field label="Outline width">
              <NumberInput value={shape.lineWidth} step={0.25} min={0} max={12} onChange={(v) => apply({ lineWidth: v })} suffix="pt" />
            </Field>
          </Row>
          <Row>
            <div className="field">
              <span className="field-label">Dash</span>
              <Seg
                value={shape.dash}
                onChange={(v) => apply({ dash: v })}
                options={[
                  { value: 'solid', label: '——' },
                  { value: 'dash', label: '– –' },
                  { value: 'dot', label: '· ·' },
                ]}
              />
            </div>
            {shape.shape === 'roundRect' && (
              <Field label="Corner radius">
                <NumberInput value={shape.radius} step={0.02} min={0} max={3} onChange={(v) => apply({ radius: v })} suffix="in" />
              </Field>
            )}
          </Row>
        </Section>
      )}
    </div>
  )
}

/* ================================================================== */
/*  SLIDE SETTINGS                                                    */
/* ================================================================== */

function SlideSettings({ patchSlide }: { patchSlide: (p: Record<string, unknown>, label?: string) => void }) {
  const store = useStore()
  const { currentSlide, insertImageFiles, toast, deck } = store
  const bgRef = useRef<HTMLInputElement>(null)
  const bg = currentSlide.bg

  const setBg = (next: Background) => patchSlide({ bg: next }, 'Background')

  return (
    <Section title="Slide">
      <Row cols={1}>
        <Field label="Slide name">
          <TextInput value={currentSlide.name} onChange={(v) => patchSlide({ name: v }, 'Rename slide')} />
        </Field>
      </Row>
      <div className="field">
        <span className="field-label">Background</span>
        <Seg
          value={bg.type}
          onChange={(v) => {
            if (v === 'solid') setBg({ type: 'solid', color: SKY.white })
            else if (v === 'gradient') setBg({ type: 'gradient', from: SKY.sky100, to: SKY.white, angle: 135 })
            else if (v === 'image') setBg({ type: 'image', src: '', fit: 'cover', overlay: null, overlayOpacity: 0.35 })
            else setBg({ type: 'none' })
          }}
          options={[
            { value: 'solid', label: 'Solid' },
            { value: 'gradient', label: 'Gradient' },
            { value: 'image', label: 'Image' },
            { value: 'none', label: 'None' },
          ]}
        />
      </div>

      {bg.type === 'solid' && <ColorField label="Colour" value={bg.color} onChange={(v) => setBg({ type: 'solid', color: v ?? SKY.white })} />}

      {bg.type === 'gradient' && (
        <>
          <Row>
            <ColorField label="From" value={bg.from} onChange={(v) => setBg({ ...bg, from: v ?? SKY.sky100 })} />
            <ColorField label="To" value={bg.to} onChange={(v) => setBg({ ...bg, to: v ?? SKY.white })} />
          </Row>
          <Field label="Angle">
            <input
              className="range"
              type="range"
              min={0}
              max={360}
              value={bg.angle}
              onChange={(e) => setBg({ ...bg, angle: Number(e.target.value) })}
            />
          </Field>
          <div className="quick-grid">
            <button className="btn tiny" onClick={() => setBg({ type: 'gradient', from: SKY.sky100, to: SKY.white, angle: 135 })}>Sky wash</button>
            <button className="btn tiny" onClick={() => setBg({ type: 'gradient', from: SKY.brand, to: SKY.brandDark, angle: 120 })}>Brand</button>
            <button className="btn tiny" onClick={() => setBg({ type: 'gradient', from: SKY.brandDeep, to: SKY.brand, angle: 120 })}>Deep</button>
            <button className="btn tiny" onClick={() => setBg({ type: 'gradient', from: SKY.white, to: SKY.sky200, angle: 90 })}>Light</button>
          </div>
        </>
      )}

      {bg.type === 'image' && (
        <>
          <input
            ref={bgRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void normalizeUpload(f, 2400).then((src) => setBg({ ...bg, src }))
              e.target.value = ''
            }}
          />
          <button className="btn tiny wide" onClick={() => bgRef.current?.click()}>
            {bg.src ? 'Choose a different image…' : 'Upload background image…'}
          </button>
          {bg.src && (
            <img className="bg-thumb" src={bg.src} alt="" />
          )}
          <div className="field">
            <span className="field-label">Fit</span>
            <Seg
              value={bg.fit}
              onChange={(v) => setBg({ ...bg, fit: v })}
              options={[
                { value: 'cover', label: 'Fill slide' },
                { value: 'contain', label: 'Fit inside' },
              ]}
            />
          </div>
          <Row>
            <ColorField label="Overlay" value={bg.overlay} allowNone onChange={(v) => setBg({ ...bg, overlay: v })} />
            <Field label="Overlay strength">
              <input
                className="range"
                type="range"
                min={0}
                max={100}
                value={Math.round(bg.overlayOpacity * 100)}
                onChange={(e) => setBg({ ...bg, overlayOpacity: Number(e.target.value) / 100 })}
              />
            </Field>
          </Row>
        </>
      )}

      <Field label="Speaker notes">
        <textarea
          className="input textarea"
          value={currentSlide.notes}
          placeholder="Notes appear in PowerPoint's presenter view."
          onChange={(e) => patchSlide({ notes: e.target.value }, 'Notes')}
        />
      </Field>
      <button
        className="btn tiny wide"
        onClick={async () => {
          const input = document.createElement('input')
          input.type = 'file'
          input.accept = 'image/*'
          input.onchange = () => {
            if (input.files?.[0]) void insertImageFiles([input.files[0]], { x: 0, y: 0, w: deck.size.w, h: deck.size.h })
          }
          input.click()
        }}
      >
        Insert full-slide image…
      </button>
      <p className="hint">Tip: drag any image file straight onto the canvas to place it exactly where you drop it.</p>
    </Section>
  )
}

/* ================================================================== */
/*  LAYOUTS                                                           */
/* ================================================================== */

function LayoutPicker() {
  const store = useStore()
  const { currentSlide, applyLayout, addSlide, toast } = store
  const [mode, setMode] = React.useState<'replace' | 'keep'>('keep')

  return (
    <Section title="Template layouts">
      <div className="field">
        <span className="field-label">When applying to this slide</span>
        <Seg
          value={mode}
          onChange={setMode}
          options={[
            { value: 'keep', label: 'Keep my text' },
            { value: 'replace', label: 'Replace all' },
          ]}
        />
      </div>
      <div className="layout-grid">
        {LAYOUTS.map((l) => (
          <button
            key={l.id}
            className="layout-btn"
            data-active={currentSlide.layout === l.id}
            onClick={() => applyLayout(l.id, mode)}
            title={`Apply “${l.name}” to this slide — ${l.hint}`}
          >
            <LayoutThumb id={l.id} />
            <span>{l.name}</span>
          </button>
        ))}
      </div>
      <div className="field">
        <span className="field-label">Add a new slide</span>
        <div className="layout-grid">
          {LAYOUTS.map((l) => (
            <button key={l.id} className="layout-btn small" onClick={() => addSlide(l.id)} title={`Add “${l.name}” slide`}>
              <LayoutThumb id={l.id} />
              <span>{l.name}</span>
            </button>
          ))}
        </div>
      </div>
      <button className="btn tiny wide" onClick={() => toast('Layouts use the ADPL sky-blue palette only', 'info')}>
        About this template
      </button>
    </Section>
  )
}

/* ================================================================== */
/*  DECK SETTINGS                                                     */
/* ================================================================== */

function DeckSettings({ deck, patchDeck }: { deck: Deck; patchDeck: (p: Partial<Deck>, label?: string) => void }) {
  const store = useStore()
  const { resetDeck, loadProject, toast, setPrefs, prefs } = store

  const usedImages = useMemo(() => {
    const set = new Map<string, string>()
    deck.slides.forEach((s) =>
      s.elements.forEach((e) => {
        if (e.kind === 'image' && !e.brand) set.set(e.src, e.name || 'Image')
      }),
    )
    return Array.from(set.entries()).slice(0, 24)
  }, [deck.slides])

  return (
    <>
      <Section title="Deck" defaultOpen={false}>
        <Row cols={1}>
          <Field label="Deck title">
            <TextInput value={deck.title} onChange={(v) => patchDeck({ title: v }, 'Deck title')} />
          </Field>
        </Row>
        <Field label="Slide size">
          <Select
            value={`${deck.size.w}x${deck.size.h}`}
            onChange={(v) => {
              const p = SLIDE_PRESETS.find((s) => `${s.w}x${s.h}` === v)
              if (p) patchDeck({ size: { w: p.w, h: p.h } }, 'Slide size')
            }}
            options={SLIDE_PRESETS.map((s) => ({ value: `${s.w}x${s.h}`, label: `${s.name} — ${s.w}″ × ${s.h}″` }))}
          />
        </Field>
        <Row>
          <Field label="Logo on slides">
            <Seg
              value={deck.logoVariant}
              onChange={(v) => {
                setPrefs({ logoVariant: v })
                patchDeck(
                  {
                    logoVariant: v,
                    slides: deck.slides.map((s) => ({
                      ...s,
                      elements: s.elements.map((e) =>
                        e.kind === 'image' && e.brand === 'logo' ? { ...e, src: `logo/adpl-logo-${v}.png` } : e,
                      ),
                    })),
                  },
                  'Logo variant',
                )
              }}
              options={[
                { value: 'blue', label: 'Blue' },
                { value: 'white', label: 'White' },
                { value: 'navy', label: 'Navy' },
              ]}
            />
          </Field>
        </Row>
        <div className="row" style={{ gridTemplateColumns: '1fr' }}>
          <Toggle
            label="Show logo furniture on every slide"
            checked={deck.slides.some((s) => s.elements.some((e) => e.kind === 'image' && e.brand === 'logo'))}
            onChange={(on) =>
              patchDeck(
                {
                  showLogo: on,
                  slides: deck.slides.map((s) => {
                    const has = s.elements.some((e) => e.kind === 'image' && e.brand === 'logo')
                    if (on && !has) {
                      const el: El = {
                        id: `logo_${Math.random().toString(36).slice(2, 9)}`,
                        kind: 'image',
                        name: 'ADPL logo',
                        brand: 'logo',
                        src: `logo/adpl-logo-${deck.logoVariant}.png`,
                        alt: 'ADPL',
                        x: 0.62,
                        y: 0.4,
                        w: 0.66,
                        h: 0.4,
                        rotation: 0,
                        opacity: 1,
                        fit: 'contain',
                        radius: 0,
                        borderColor: null,
                        borderWidth: 0,
                        shadow: null,
                      }
                      return { ...s, elements: [el, ...s.elements] }
                    }
                    if (!on && has) return { ...s, elements: s.elements.filter((e) => !(e.kind === 'image' && e.brand === 'logo')) }
                    return s
                  }),
                },
                'Logo furniture',
              )
            }
          />
          <Toggle
            label="Slide numbers"
            checked={deck.slides.some((s) => s.elements.some((e) => e.name === 'Slide number'))}
            onChange={(on) =>
              patchDeck(
                {
                  pageNumbers: on,
                  slides: deck.slides.map((s) => {
                    const has = s.elements.some((e) => e.name === 'Slide number')
                    if (on && !has) {
                      return {
                        ...s,
                        elements: [
                          ...s.elements,
                          {
                            id: `num_${Math.random().toString(36).slice(2, 9)}`,
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
                            x: deck.size.w - 1.82,
                            y: 6.86,
                            w: 1.2,
                            h: 0.28,
                            rotation: 0,
                            opacity: 1,
                            shadow: null,
                          } as El,
                        ],
                      }
                    }
                    if (!on && has) return { ...s, elements: s.elements.filter((e) => e.name !== 'Slide number') }
                    return s
                  }),
                },
                'Slide numbers',
              )
            }
          />
        </div>
        {usedImages.length > 0 && (
          <div className="field">
            <span className="field-label">Images already in this deck</span>
            <div className="asset-strip">
              {usedImages.map(([src, name]) => (
                <button
                  key={src}
                  className="asset"
                  title={`Insert ${name}`}
                  onClick={() => {
                    store.addElement({
                      id: `img_${Math.random().toString(36).slice(2, 9)}`,
                      kind: 'image',
                      name,
                      src,
                      alt: name,
                      x: 1.2,
                      y: 1.4,
                      w: 5.4,
                      h: 3.4,
                      rotation: 0,
                      opacity: 1,
                      fit: 'cover',
                      radius: 0.08,
                      borderColor: null,
                      borderWidth: 0,
                      shadow: null,
                    } as El)
                    toast(`Inserted “${name}” from this deck`, 'ok')
                  }}
                >
                  <img src={src} alt={name} />
                </button>
              ))}
            </div>
          </div>
        )}
      </Section>

      <Section title="Cross-platform fonts" defaultOpen={false}>
        <p className="hint">
          Decks exported with <b>Google Slides–safe fonts</b> (the default in the Export menu) are converted on the
          way out — nothing to do here. Use this button if you also want the editor itself to preview those fonts,
          for example after pasting text in Calibri.
        </p>
        <button
          className="btn tiny wide"
          onClick={() => {
            let changed = 0
            patchDeck(
              {
                slides: deck.slides.map((s) => ({
                  ...s,
                  elements: s.elements.map((e) => {
                    if (e.kind !== 'text') return e
                    if (SLIDES_SAFE_FONTS.includes(e.font)) return e
                    changed += 1
                    return { ...e, font: DEFAULT_FONT }
                  }),
                })),
              },
              'Slide-safe fonts',
            )
            toast(
              changed
                ? `Switched ${changed} text box${changed > 1 ? 'es' : ''} to ${DEFAULT_FONT}`
                : `Everything already uses a Slides-safe font`,
              changed ? 'ok' : 'info',
            )
          }}
        >
          Switch the whole deck to {DEFAULT_FONT}
        </button>
        <p className="hint">
          Slides-safe: {SLIDES_SAFE_FONTS.join(' · ')}
        </p>
      </Section>

      <Section title="Project" defaultOpen={false}>
        <div className="quick-grid">
          <button
            className="btn tiny"
            onClick={() => {
              downloadBlob(
                new Blob([JSON.stringify(store.project(), null, 2)], { type: 'application/json' }),
                `${safeFileName(deck.title)}.adpl.json`,
              )
              toast('Project saved as JSON', 'ok')
            }}
          >
            Save project
          </button>
          <button
            className="btn tiny"
            onClick={() => {
              const input = document.createElement('input')
              input.type = 'file'
              input.accept = '.json,application/json'
              input.onchange = async () => {
                const f = input.files?.[0]
                if (!f) return
                try {
                  const parsed = JSON.parse(await f.text())
                  if (parsed?.deck?.slides) loadProject(parsed.deck)
                  else toast('That file is not an ADPL project', 'warn')
                } catch {
                  toast('Could not read that file', 'warn')
                }
              }
              input.click()
            }}
          >
            Open project
          </button>
          <button className="btn tiny" onClick={() => resetDeck('blank')}>
            New deck
          </button>
          <button className="btn tiny danger" onClick={() => { if (confirm('Replace the deck with the starter template?')) resetDeck('starter') }}>
            Reset
          </button>
        </div>
        <p className="hint">
          Work is saved automatically in this browser. Use <b>Save project</b> for a portable file you can reopen on
          another machine.
        </p>
      </Section>
    </>
  )
}


