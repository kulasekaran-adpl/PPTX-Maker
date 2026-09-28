import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { El, ImageEl, TextEl } from '../types'
import { useStore } from '../state/useStore'
import { SlideView } from './SlideView'
import { r2, rotateVec } from '../lib/util'
import { FONT_STACK } from '../theme'

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rot'

interface Guide {
  axis: 'x' | 'y'
  at: number
}

interface DragState {
  type: 'move' | 'resize' | 'rotate' | 'marquee'
  startClient: { x: number; y: number }
  startPoint: { x: number; y: number }
  ids: string[]
  orig: Record<string, El>
  handle?: Handle
  pivot?: { x: number; y: number }
}

const SNAP_IN = 0.075
const MIN = 0.12
const HANDLE_DIR: Record<string, { x: number; y: number }> = {
  nw: { x: -1, y: -1 },
  n: { x: 0, y: -1 },
  ne: { x: 1, y: -1 },
  e: { x: 1, y: 0 },
  se: { x: 1, y: 1 },
  s: { x: 0, y: 1 },
  sw: { x: -1, y: 1 },
  w: { x: -1, y: 0 },
}

export function Canvas() {
  const store = useStore()
  const { deck, currentSlide, selection, select, patchEls, prefs, setPrefs, insertImageFiles } = store

  const wrapRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 900, h: 520 })
  const [zoom, setZoom] = useState<number | null>(null)
  const [guides, setGuides] = useState<Guide[]>([])
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [overflowIds, setOverflowIds] = useState<string[]>([])
  const [dragOver, setDragOver] = useState(false)
  const drag = useRef<DragState | null>(null)
  const rotBase = useRef({ angle: 0, base: 0 })

  useLayoutEffect(() => {
    const node = wrapRef.current
    if (!node) return
    const measure = () => setBox({ w: node.clientWidth, h: node.clientHeight })
    const ro = new ResizeObserver(measure)
    ro.observe(node)
    measure()
    return () => ro.disconnect()
  }, [])

  const fit = useMemo(
    () => Math.min((box.w - 64) / deck.size.w, (box.h - 118) / deck.size.h),
    [box.w, box.h, deck.size.w, deck.size.h],
  )
  const px = Math.max(14, zoom ?? fit)

  const toInches = useCallback(
    (clientX: number, clientY: number) => {
      const rect = stageRef.current?.getBoundingClientRect()
      if (!rect) return { x: 0, y: 0 }
      return { x: (clientX - rect.left) / px, y: (clientY - rect.top) / px }
    },
    [px],
  )

  /* ---------------------------- snapping ---------------------------- */

  const snapDelta = useCallback(
    (movingIds: string[], proposed: El[]) => {
      if (!prefs.snap) return { dx: 0, dy: 0, guides: [] as Guide[] }
      const others = currentSlide.elements.filter((e) => !movingIds.includes(e.id) && !e.hidden)
      const xs = [0, deck.size.w / 2, deck.size.w, 0.62, deck.size.w - 0.62]
      const ys = [0, deck.size.h / 2, deck.size.h, 0.62, deck.size.h - 0.62]
      others.forEach((o) => {
        xs.push(o.x, o.x + o.w / 2, o.x + o.w)
        ys.push(o.y, o.y + o.h / 2, o.y + o.h)
      })
      const best = (list: number[], t: number) => {
        let out: { d: number; at: number } | null = null
        for (const target of list) {
          const d = target - t
          if (Math.abs(d) <= SNAP_IN && (!out || Math.abs(d) < Math.abs(out.d))) out = { d, at: target }
        }
        return out
      }
      let bx: { d: number; at: number } | null = null
      let by: { d: number; at: number } | null = null
      for (const p of proposed) {
        for (const t of [p.x, p.x + p.w / 2, p.x + p.w]) {
          const c = best(xs, t)
          if (c && (bx === null || Math.abs(c.d) < Math.abs(bx.d))) bx = c
        }
        for (const t of [p.y, p.y + p.h / 2, p.y + p.h]) {
          const c = best(ys, t)
          if (c && (by === null || Math.abs(c.d) < Math.abs(by.d))) by = c
        }
      }
      const g: Guide[] = []
      if (bx) g.push({ axis: 'x', at: bx.at })
      if (by) g.push({ axis: 'y', at: by.at })
      return { dx: bx?.d ?? 0, dy: by?.d ?? 0, guides: g }
    },
    [currentSlide.elements, deck.size.h, deck.size.w, prefs.snap],
  )

  /* ----------------------------- dragging ----------------------------- */

  const startDrag = useCallback(
    (e: React.PointerEvent, state: DragState) => {
      drag.current = state
      patchEls([], null, 'begin')
      try {
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      } catch {
        /* older browsers */
      }
    },
    [patchEls],
  )

  const onElementPointerDown = useCallback(
    (e: React.PointerEvent, id: string) => {
      if (editing === id) return
      const el = currentSlide.elements.find((x) => x.id === id)
      if (!el) return
      e.stopPropagation()
      const additive = e.shiftKey || e.metaKey || e.ctrlKey
      let ids = selection
      if (additive) {
        ids = selection.includes(id) ? selection.filter((s) => s !== id) : [...selection, id]
      } else if (!selection.includes(id)) {
        ids = [id]
      }
      select(ids)
      if (el.locked) return
      const orig: Record<string, El> = {}
      currentSlide.elements.filter((x) => ids.includes(x.id)).forEach((x) => {
        orig[x.id] = { ...x }
      })
      startDrag(e, {
        type: 'move',
        startClient: { x: e.clientX, y: e.clientY },
        startPoint: toInches(e.clientX, e.clientY),
        ids,
        orig,
      })
    },
    [currentSlide.elements, editing, select, selection, startDrag, toInches],
  )

  const onHandlePointerDown = useCallback(
    (e: React.PointerEvent, handle: Handle) => {
      e.stopPropagation()
      e.preventDefault()
      const el = currentSlide.elements.find((x) => x.id === selection[0])
      if (!el || el.locked) return
      const centre = { x: el.x + el.w / 2, y: el.y + el.h / 2 }

      if (handle === 'rot') {
        const p = toInches(e.clientX, e.clientY)
        rotBase.current = {
          angle: (Math.atan2(p.y - centre.y, p.x - centre.x) * 180) / Math.PI,
          base: el.rotation,
        }
        startDrag(e, {
          type: 'rotate',
          startClient: { x: e.clientX, y: e.clientY },
          startPoint: p,
          ids: [el.id],
          orig: { [el.id]: { ...el } },
          handle,
          pivot: centre,
        })
        return
      }

      const dir = HANDLE_DIR[handle] ?? { x: 1, y: 1 }
      const rv = rotateVec((-dir.x * el.w) / 2, (-dir.y * el.h) / 2, el.rotation)
      startDrag(e, {
        type: 'resize',
        startClient: { x: e.clientX, y: e.clientY },
        startPoint: toInches(e.clientX, e.clientY),
        ids: [el.id],
        orig: { [el.id]: { ...el } },
        handle,
        pivot: { x: centre.x + rv.x, y: centre.y + rv.y },
      })
    },
    [currentSlide.elements, selection, startDrag, toInches],
  )

  const onStagePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (editing) {
        setEditing(null)
        return
      }
      if ((e.target as HTMLElement).closest('[data-elid]')) return
      if (!e.shiftKey) select([])
      const p = toInches(e.clientX, e.clientY)
      drag.current = { type: 'marquee', startClient: { x: e.clientX, y: e.clientY }, startPoint: p, ids: [], orig: {} }
      setMarquee({ x: p.x, y: p.y, w: 0, h: 0 })
    },
    [editing, select, toInches],
  )

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = drag.current
      if (!d) return

      if (d.type === 'marquee') {
        const cur = toInches(e.clientX, e.clientY)
        const x = Math.min(d.startPoint.x, cur.x)
        const y = Math.min(d.startPoint.y, cur.y)
        const w = Math.abs(cur.x - d.startPoint.x)
        const h = Math.abs(cur.y - d.startPoint.y)
        setMarquee({ x, y, w, h })
        const hits = currentSlide.elements
          .filter((el) => !el.hidden && !el.locked)
          .filter((el) => el.x < x + w && el.x + el.w > x && el.y < y + h && el.y + el.h > y)
          .map((el) => el.id)
        select(hits)
        return
      }

      const cur = toInches(e.clientX, e.clientY)

      if (d.type === 'move') {
        let mx = cur.x - d.startPoint.x
        let my = cur.y - d.startPoint.y
        const proposed = d.ids.map((id) => ({
          ...d.orig[id],
          x: d.orig[id].x + mx,
          y: d.orig[id].y + my,
        }) as El)
        const snap = snapDelta(d.ids, proposed)
        mx += snap.dx
        my += snap.dy
        setGuides(snap.guides)
        const next: Record<string, { x: number; y: number }> = {}
        d.ids.forEach((id) => {
          next[id] = { x: r2(d.orig[id].x + mx), y: r2(d.orig[id].y + my) }
        })
        patchEls(d.ids, (el) => next[el.id] ?? {}, 'live')
        return
      }

      if (d.type === 'resize' && d.handle) {
        const el = d.orig[d.ids[0]]
        const dir = HANDLE_DIR[d.handle] ?? { x: 1, y: 1 }
        const dl = rotateVec(cur.x - d.startPoint.x, cur.y - d.startPoint.y, -el.rotation)
        let w = dir.x !== 0 ? el.w + dl.x * dir.x : el.w
        let h = dir.y !== 0 ? el.h + dl.y * dir.y : el.h
        if (e.shiftKey && dir.x !== 0 && dir.y !== 0) {
          const aspect = el.w / Math.max(0.01, el.h)
          if (w / Math.max(0.01, h) > aspect) h = w / aspect
          else w = h * aspect
        }
        w = Math.max(MIN, w)
        h = Math.max(MIN, h)
        const rv = rotateVec((-dir.x * w) / 2, (-dir.y * h) / 2, el.rotation)
        const pivot = d.pivot ?? { x: el.x, y: el.y }
        const cx = pivot.x - rv.x
        const cy = pivot.y - rv.y
        patchEls(d.ids, { x: r2(cx - w / 2), y: r2(cy - h / 2), w: r2(w), h: r2(h) }, 'live')
        return
      }

      if (d.type === 'rotate') {
        const pivot = d.pivot ?? { x: 0, y: 0 }
        const angle = (Math.atan2(cur.y - pivot.y, cur.x - pivot.x) * 180) / Math.PI
        let next = rotBase.current.base + (angle - rotBase.current.angle)
        if (e.shiftKey) next = Math.round(next / 15) * 15
        next = ((next % 360) + 360) % 360
        patchEls(d.ids, { rotation: r2(next) }, 'live')
      }
    }

    const onUp = () => {
      if (!drag.current) return
      drag.current = null
      patchEls([], null, 'end')
      setGuides([])
      setMarquee(null)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [currentSlide.elements, patchEls, select, snapDelta, toInches])

  /* ----------------------- paste an image (Ctrl+V) ----------------------- */

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items ?? [])
      const files = items
        .filter((i) => i.type.startsWith('image/'))
        .map((i) => i.getAsFile())
        .filter((f): f is File => !!f)
      if (!files.length) return
      e.preventDefault()
      void insertImageFiles(files, { x: 3.4, y: 1.6, w: 6.6, h: 4.3 })
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [insertImageFiles])

  /* --------------------------- inline text --------------------------- */

  const onDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const target = (e.target as HTMLElement).closest('[data-elid]') as HTMLElement | null
      if (!target?.dataset.elid) return
      const el = currentSlide.elements.find((x) => x.id === target.dataset.elid)
      if (el?.kind === 'text' && !el.locked) setEditing(el.id)
    },
    [currentSlide.elements],
  )

  const editingEl = editing
    ? (currentSlide.elements.find((x) => x.id === editing) as TextEl | undefined)
    : undefined

  /* ---------------------------- drop zone ---------------------------- */

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const files = Array.from(e.dataTransfer?.files ?? [])
      if (!files.length) return
      const p = toInches(e.clientX, e.clientY)
      void insertImageFiles(files, { x: Math.max(0, p.x - 2.7), y: Math.max(0, p.y - 1.8), w: 5.4, h: 3.6 })
    },
    [insertImageFiles, toInches],
  )

  const sel = currentSlide.elements.filter((e) => selection.includes(e.id))
  const primary = sel.length === 1 ? sel[0] : undefined

  return (
    <div className="canvas-outer" ref={wrapRef}>
      <div className="canvas-toolbar">
        <div className="seg">
          <button className="btn tiny" data-active={zoom === null} onClick={() => setZoom(null)}>
            Fit
          </button>
          <button className="btn tiny" onClick={() => setZoom(Math.max(0.15, (zoom ?? fit) - 0.1))}>
            −
          </button>
          <span className="zoom-label" title="Zoom level">
            {Math.round(px * 100)}%
          </span>
          <button className="btn tiny" onClick={() => setZoom(Math.min(4, (zoom ?? fit) + 0.1))}>
            +
          </button>
        </div>
        <div className="spacer" />
        <label className="check tiny">
          <input type="checkbox" checked={prefs.snap} onChange={(e) => setPrefs({ snap: e.target.checked })} />
          Snap &amp; guides
        </label>
        <label className="check tiny">
          <input type="checkbox" checked={prefs.showGrid} onChange={(e) => setPrefs({ showGrid: e.target.checked })} />
          Grid
        </label>
      </div>

      <div
        className={`canvas-scroll ${dragOver ? 'is-dropping' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setDragOver(false)
        }}
        onDrop={onDrop}
      >
        <div className="stage-shell" style={{ width: deck.size.w * px, height: deck.size.h * px }}>
          <div
            className="stage"
            ref={stageRef}
            onPointerDown={onStagePointerDown}
            onDoubleClick={onDoubleClick}
            style={{ width: deck.size.w * px, height: deck.size.h * px }}
          >
            <SlideView
              slide={currentSlide}
              deck={deck}
              px={px}
              interactive={!editing}
              hideIds={editing ? [editing] : []}
              onElementPointerDown={onElementPointerDown}
              onOverflow={(id, over) =>
                setOverflowIds((prev) => {
                  const has = prev.includes(id)
                  if (over && !has) return [...prev, id]
                  if (!over && has) return prev.filter((x) => x !== id)
                  return prev
                })
              }
            />

            {prefs.showGrid && (
              <div
                className="grid-layer"
                style={{
                  backgroundImage:
                    'linear-gradient(to right, rgba(9,125,194,.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(9,125,194,.06) 1px, transparent 1px), linear-gradient(to right, rgba(9,125,194,.14) 1px, transparent 1px), linear-gradient(to bottom, rgba(9,125,194,.14) 1px, transparent 1px)',
                  backgroundSize: `${px / 4}px ${px / 4}px, ${px / 4}px ${px / 4}px, ${px}px ${px}px, ${px}px ${px}px`,
                }}
              />
            )}

            {guides.map((g, i) => (
              <div
                key={i}
                className="guide"
                style={
                  g.axis === 'x'
                    ? { left: g.at * px, top: 0, width: 1, height: '100%' }
                    : { top: g.at * px, left: 0, height: 1, width: '100%' }
                }
              />
            ))}

            {marquee && (
              <div
                className="marquee"
                style={{
                  left: marquee.x * px,
                  top: marquee.y * px,
                  width: marquee.w * px,
                  height: marquee.h * px,
                }}
              />
            )}

            {editingEl && (
              <TextEditor
                el={editingEl}
                px={px}
                onChange={(text) => patchEls([editingEl.id], { text }, 'live')}
                onDone={() => {
                  patchEls([], null, 'end')
                  setEditing(null)
                }}
              />
            )}

            {!editing &&
              sel.map((el) => (
                <SelectionBox key={el.id} el={el} px={px} single={sel.length === 1} onHandle={onHandlePointerDown} />
              ))}

            {sel.length > 1 && <MultiBox sel={sel} px={px} />}

            {dragOver && (
              <div className="drop-veil">
                <span>Drop to place {`images`} on this slide</span>
              </div>
            )}
          </div>

          <div className="stage-status">
            {primary ? (
              <>
                <b>{primary.name || (primary as ImageEl).alt || primary.kind}</b>
                <span>
                  x {primary.x.toFixed(2)}″ · y {primary.y.toFixed(2)}″ · {primary.w.toFixed(2)}″ ×{' '}
                  {primary.h.toFixed(2)}″
                </span>
                {primary.rotation ? <span>· {primary.rotation}°</span> : null}
                {overflowIds.includes(primary.id) ? <span className="warn">· text is taller than its box</span> : null}
              </>
            ) : (
              <span>
                Double-click text to edit · drag in an image or press <kbd>Ctrl</kbd>+<kbd>V</kbd> to paste a
                screenshot · marquee-drag to select several objects
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

const HANDLES: { id: Handle; style: React.CSSProperties }[] = [
  { id: 'nw', style: { left: -5, top: -5, cursor: 'nwse-resize' } },
  { id: 'n', style: { left: 'calc(50% - 5px)', top: -5, cursor: 'ns-resize' } },
  { id: 'ne', style: { right: -5, top: -5, cursor: 'nesw-resize' } },
  { id: 'e', style: { right: -5, top: 'calc(50% - 5px)', cursor: 'ew-resize' } },
  { id: 'se', style: { right: -5, bottom: -5, cursor: 'nwse-resize' } },
  { id: 's', style: { left: 'calc(50% - 5px)', bottom: -5, cursor: 'ns-resize' } },
  { id: 'sw', style: { left: -5, bottom: -5, cursor: 'nesw-resize' } },
  { id: 'w', style: { left: -5, top: 'calc(50% - 5px)', cursor: 'ew-resize' } },
]

function SelectionBox({
  el,
  px,
  single,
  onHandle,
}: {
  el: El
  px: number
  single: boolean
  onHandle: (e: React.PointerEvent, h: Handle) => void
}) {
  return (
    <div
      className={`sel-box ${el.locked ? 'locked' : ''}`}
      style={{
        left: el.x * px,
        top: el.y * px,
        width: el.w * px,
        height: el.h * px,
        transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
      }}
    >
      {single && !el.locked && (
        <>
          <div
            className="rot-handle"
            style={{ left: 'calc(50% - 8px)', top: -34 }}
            onPointerDown={(e) => onHandle(e, 'rot')}
            title="Drag to rotate · hold Shift for 15° steps"
          >
            <svg width="16" height="16" viewBox="0 0 16 16">
              <path d="M8 3 A5 5 0 1 1 3 7.4" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M5.2 1.4 L8.2 3.1 L5.2 4.9 Z" fill="#fff" />
            </svg>
          </div>
          {HANDLES.map((h) => (
            <div key={h.id} className="handle" style={h.style} onPointerDown={(e) => onHandle(e, h.id)} />
          ))}
        </>
      )}
      {el.locked && <span className="lock-badge">locked</span>}
    </div>
  )
}

function MultiBox({ sel, px }: { sel: El[]; px: number }) {
  const x = Math.min(...sel.map((e) => e.x))
  const y = Math.min(...sel.map((e) => e.y))
  const w = Math.max(...sel.map((e) => e.x + e.w)) - x
  const h = Math.max(...sel.map((e) => e.y + e.h)) - y
  return (
    <div
      className="multi-box"
      style={{ left: x * px, top: y * px, width: w * px, height: h * px }}
    >
      <span className="multi-badge">{sel.length} selected</span>
    </div>
  )
}

function TextEditor({
  el,
  px,
  onChange,
  onDone,
}: {
  el: TextEl
  px: number
  onChange: (text: string) => void
  onDone: () => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    node.focus()
    node.setSelectionRange(node.value.length, node.value.length)
  }, [])
  return (
    <textarea
      ref={ref}
      className="inline-text"
      defaultValue={el.text}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onDone}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          onDone()
        }
      }}
      style={{
        left: el.x * px,
        top: el.y * px,
        width: el.w * px,
        height: el.h * px,
        transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
        fontFamily: FONT_STACK[el.font] ?? el.font,
        fontSize: (el.size * px) / 72,
        lineHeight: el.lineSpacing,
        fontWeight: el.bold ? 700 : 400,
        fontStyle: el.italic ? 'italic' : 'normal',
        color: el.color,
        textAlign: el.align,
        padding: el.padding * px,
        letterSpacing: `${(el.charSpacing * px) / 72}px`,
      }}
    />
  )
}
