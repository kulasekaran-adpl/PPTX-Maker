/* ------------------------------------------------------------------
 * The deck store: one place that owns the document, the selection and
 * every editing operation the UI can perform.
 * ------------------------------------------------------------------ */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { AnyImageFit, Deck, El, ImageEl, LogoVariant, ShapeKind, Slide, SlideSize, TextEl } from '../types'
import { layoutById, newSlide, SW, SH } from '../templates/skyBlue'
import { clamp, loadImageSize, normalizeUpload, uid } from '../lib/util'
import { DEFAULT_FONT } from '../theme'
import { useHistory } from './useHistory'

const STORAGE_KEY = 'adpl-deck-studio:project:v1'
const PREF_KEY = 'adpl-deck-studio:prefs:v1'
const DECK_SCHEMA = 2

interface Prefs {
  logoVariant: LogoVariant
  showGrid: boolean
  snap: boolean
}

interface Toast {
  id: string
  msg: string
  tone: 'info' | 'ok' | 'warn'
}

export interface Store {
  deck: Deck
  currentIndex: number
  currentSlide: Slide
  selection: string[]
  selectedEls: El[]
  clipboard: El[] | null
  busy: string | null
  toasts: Toast[]
  canUndo: boolean
  canRedo: boolean
  prefs: Prefs
  /** deck mutations */
  setDeck: (updater: Deck | ((d: Deck) => Deck), label?: string) => void
  patchDeck: (patch: Partial<Deck>, label?: string) => void
  /** slide ops */
  selectSlide: (i: number) => void
  addSlide: (layoutId: string, at?: number) => void
  duplicateSlide: (i?: number) => void
  deleteSlide: (i?: number) => void
  moveSlide: (from: number, to: number) => void
  patchSlide: (patch: Partial<Slide>, label?: string) => void
  applyLayout: (layoutId: string, mode: 'replace' | 'keep') => void
  /** element ops */
  select: (ids: string[]) => void
  addElement: (el: El, select?: boolean) => void
  addElements: (els: El[], select?: boolean) => void
  /** mode: 'commit' = one undo step · 'live' = no step (dragging)
   *        'begin'/'end' = bracket many 'live' updates into one step */
  patchEls: (
    ids: string[],
    patch: Partial<El> | ((el: El) => Partial<El>) | null,
    mode?: 'commit' | 'live' | 'begin' | 'end',
  ) => void
  deleteSelection: () => void
  duplicateSelection: () => void
  copySelection: () => void
  paste: () => void
  nudge: (dx: number, dy: number) => void
  reorder: (dir: 'front' | 'back' | 'forward' | 'backward') => void
  align: (mode: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom' | 'hdist' | 'vdist') => void
  /** media + brand */
  insertImageFiles: (files: File[], target?: { x: number; y: number; w: number; h: number }) => Promise<void>
  insertBrandLogo: (variant?: LogoVariant) => void
  /** misc */
  undo: () => void
  redo: () => void
  resetDeck: (mode: 'starter' | 'blank') => void
  setBusy: (msg: string | null) => void
  toast: (msg: string, tone?: Toast['tone']) => void
  setPrefs: (patch: Partial<Prefs>) => void
  project: () => { app: string; savedAt: number; deck: Deck }
  loadProject: (deck: Deck) => void
  selectAll: () => void
}

const Ctx = createContext<Store | null>(null)

export const useStore = (): Store => {
  const s = useContext(Ctx)
  if (!s) throw new Error('StoreProvider missing')
  return s
}

const minSize = (el: El) => (el.kind === 'text' ? 0.15 : 0.1)

/** Names of the cover artwork shapes, used by the migration below. */
const COVER_ART_NAMES = ['Sky field', 'Accent sliver']

/**
 * Deck migrations.
 *
 * v1 -> v2: the cover artwork used to be a 20in square rotated by 25°, which
 * some renderers (Google Slides among them) placed differently from the
 * preview — and which came out mirrored when the maths was wrong. It is now
 * an exact polygon. Swap the stale shapes for the current ones, keeping every
 * other element (including the user's own text and images) untouched.
 */
export function migrateDeck(deck: Deck): Deck {
  if ((deck.schema ?? 1) >= DECK_SCHEMA) return deck

  const isStaleArt = (el: El) =>
    el.kind === 'shape' &&
    COVER_ART_NAMES.includes(el.name ?? '') &&
    el.shape !== 'freeform'

  const fresh = newSlide('cover').elements.filter(
    (el) => el.kind === 'shape' && COVER_ART_NAMES.includes(el.name ?? ''),
  )

  const slides = deck.slides.map((slide) => {
    if (!slide.elements.some(isStaleArt)) return slide
    let next = 0
    return {
      ...slide,
      elements: slide.elements.map((el) => {
        if (!isStaleArt(el)) return el
        const replacement = fresh[next] ?? fresh[fresh.length - 1]
        next += 1
        return replacement ? ({ ...replacement, id: el.id } as El) : el
      }),
    }
  })

  return { ...deck, schema: DECK_SCHEMA, slides }
}

export const makeStarter = (): Deck => ({
  schema: DECK_SCHEMA,
  id: uid('deck'),
  title: 'ADPL Presentation',
  size: { w: SW, h: SH },
  theme: 'sky-blue',
  showLogo: true,
  logoVariant: 'blue',
  pageNumbers: true,
  footer: '',
  slides: [
    'cover',
    'agenda',
    'section',
    'bullets',
    'text-image',
    'stats',
    'timeline',
    'image-grid',
    'comparison',
    'closing',
  ].map((id) => newSlide(id)),
})

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const hist = useHistory<Deck>(makeStarter())
  const deck = hist.state

  const [currentIndex, setCurrentIndex] = useState(0)
  const [selection, setSelection] = useState<string[]>([])
  const [clipboard, setClipboard] = useState<El[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [prefs, setPrefsState] = useState<Prefs>({ logoVariant: 'blue', showGrid: false, snap: true })
  const hydrated = useRef(false)

  /* ------------------------- persistence ------------------------- */

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed?.deck?.slides?.length) {
          // upgrade decks written by earlier versions of the app
          hist.reset(migrateDeck({ ...makeStarter(), ...parsed.deck }))
        }
      }
      const p = localStorage.getItem(PREF_KEY)
      if (p) setPrefsState((prev) => ({ ...prev, ...JSON.parse(p) }))
    } catch {
      /* corrupted store — start clean */
    }
    hydrated.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!hydrated.current) return
    const t = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ app: 'adpl-deck-studio', savedAt: Date.now(), deck }))
      } catch {
        /* quota — the deck is still safe in memory */
      }
    }, 600)
    return () => clearTimeout(t)
  }, [deck])

  useEffect(() => {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify(prefs))
    } catch {
      /* ignore */
    }
  }, [prefs])

  /* --------------------------- toasts --------------------------- */

  const toast = useCallback((msg: string, tone: Toast['tone'] = 'info') => {
    const id = uid('t')
    setToasts((prev) => [...prev, { id, msg, tone }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2600)
  }, [])

  const setPrefs = useCallback((patch: Partial<Prefs>) => setPrefsState((p) => ({ ...p, ...patch })), [])

  /* ------------------------- derived state ------------------------ */

  const safeIndex = clamp(currentIndex, 0, Math.max(0, deck.slides.length - 1))
  const currentSlide = deck.slides[safeIndex]
  const selectedEls = useMemo(
    () => (currentSlide ? currentSlide.elements.filter((e) => selection.includes(e.id)) : []),
    [currentSlide, selection],
  )

  const select = useCallback((ids: string[]) => setSelection(Array.from(new Set(ids))), [])

  /* --------------------------- deck ops --------------------------- */

  const setDeck = useCallback(
    (updater: Deck | ((d: Deck) => Deck), label = 'edit') => hist.set(updater, label),
    [hist],
  )

  const patchDeck = useCallback(
    (patch: Partial<Deck>, label = 'Deck settings') => hist.set((d) => ({ ...d, ...patch }), label),
    [hist],
  )

  /** Run a mutation on the CURRENT slide with history. */
  const mutateSlide = useCallback(
    (fn: (s: Slide) => Slide, label: string) => {
      hist.set((d) => {
        const i = clamp(currentIndex, 0, d.slides.length - 1)
        const next = d.slides.slice()
        next[i] = fn(next[i])
        return { ...d, slides: next }
      }, label)
    },
    [hist, currentIndex],
  )

  /** Same, but without creating an undo step (live dragging). */
  const mutateSlideTransient = useCallback(
    (fn: (s: Slide) => Slide) => {
      hist.setTransient((d) => {
        const i = clamp(currentIndex, 0, d.slides.length - 1)
        const next = d.slides.slice()
        next[i] = fn(next[i])
        return { ...d, slides: next }
      })
    },
    [hist, currentIndex],
  )

  const selectSlide = useCallback(
    (i: number) => {
      setCurrentIndex(clamp(i, 0, deck.slides.length - 1))
      setSelection([])
    },
    [deck.slides.length],
  )

  const addSlide = useCallback(
    (layoutId: string, at?: number) => {
      const slide = newSlide(layoutId, deck.showLogo)
      const index = at ?? currentIndex + 1
      hist.set((d) => {
        const next = d.slides.slice()
        next.splice(clamp(index, 0, next.length), 0, slide)
        return { ...d, slides: next }
      }, `Add ${layoutById(layoutId).name}`)
      setCurrentIndex(clamp(index, 0, deck.slides.length))
      setSelection([])
      toast(`Added “${layoutById(layoutId).name}” slide`, 'ok')
    },
    [hist, currentIndex, deck.showLogo, deck.slides.length, toast],
  )

  const duplicateSlide = useCallback(
    (i?: number) => {
      const idx = i ?? currentIndex
      const src = deck.slides[idx]
      if (!src) return
      const copy: Slide = {
        ...src,
        id: uid('sld'),
        name: `${src.name} copy`,
        elements: src.elements.map((e) => ({ ...e, id: uid('el') })),
      }
      hist.set(
        (d) => {
          const next = d.slides.slice()
          next.splice(idx + 1, 0, copy)
          return { ...d, slides: next }
        },
        'Duplicate slide',
      )
      setCurrentIndex(idx + 1)
      toast('Slide duplicated', 'ok')
    },
    [hist, currentIndex, deck.slides, toast],
  )

  const deleteSlide = useCallback(
    (i?: number) => {
      const idx = i ?? currentIndex
      if (deck.slides.length <= 1) {
        toast('A deck needs at least one slide', 'warn')
        return
      }
      hist.set((d) => ({ ...d, slides: d.slides.filter((_, k) => k !== idx) }), 'Delete slide')
      setCurrentIndex(clamp(idx - (idx === deck.slides.length - 1 ? 1 : 0), 0, deck.slides.length - 2))
      setSelection([])
      toast('Slide deleted')
    },
    [hist, currentIndex, deck.slides.length, toast],
  )

  const moveSlide = useCallback(
    (from: number, to: number) => {
      if (from === to) return
      hist.set(
        (d) => {
          const next = d.slides.slice()
          const [moved] = next.splice(from, 1)
          next.splice(clamp(to, 0, next.length), 0, moved)
          return { ...d, slides: next }
        },
        'Reorder slides',
      )
      setCurrentIndex(clamp(to, 0, deck.slides.length - 1))
    },
    [hist, deck.slides.length],
  )

  const patchSlide = useCallback(
    (patch: Partial<Slide>, label = 'Slide settings') => mutateSlide((s) => ({ ...s, ...patch }), label),
    [mutateSlide],
  )

  /** Re-run a layout while optionally preserving the text the user typed. */
  const applyLayout = useCallback(
    (layoutId: string, mode: 'replace' | 'keep') => {
      mutateSlide((s) => {
        const fresh = newSlide(layoutId, deck.showLogo)
        if (mode === 'replace') return { ...fresh, id: s.id }
        const oldTexts = s.elements.filter((e) => e.kind === 'text')
        const newTexts = fresh.elements.filter((e) => e.kind === 'text')
        const merged = fresh.elements.map((el) => {
          if (el.kind !== 'text') return el
          const match = oldTexts[newTexts.findIndex((n) => n.id === el.id)]
          return match ? ({ ...el, text: (match as TextEl).text } as El) : el
        })
        return { ...fresh, id: s.id, elements: merged }
      }, 'Apply layout')
      setSelection([])
      toast(`Layout applied: ${layoutById(layoutId).name}`, 'ok')
    },
    [mutateSlide, deck.showLogo, toast],
  )

  /* ------------------------- element ops ------------------------- */

  const addElements = useCallback(
    (els: El[], selectThem = true) => {
      if (!els.length) return
      mutateSlide((s) => ({ ...s, elements: [...s.elements, ...els] }), 'Insert')
      if (selectThem) setSelection(els.map((e) => e.id))
    },
    [mutateSlide],
  )

  const addElement = useCallback((el: El, selectIt = true) => addElements([el], selectIt), [addElements])

  const patchEls = useCallback<Store['patchEls']>(
    (ids, patch, mode = 'commit') => {
      if (mode === 'begin') {
        hist.begin()
        return
      }
      if (mode === 'end') {
        hist.end('Edit')
        return
      }
      if (!patch || ids.length === 0) return
      const apply = (s: Slide): Slide => ({
        ...s,
        elements: s.elements.map((el) => {
          if (!ids.includes(el.id)) return el
          const p = typeof patch === 'function' ? patch(el) : patch
          const merged = { ...el, ...p } as El
          if ('w' in merged) {
            merged.w = Math.max(minSize(merged), merged.w)
            merged.h = Math.max(minSize(merged), merged.h)
          }
          return merged
        }),
      })
      if (mode === 'live') mutateSlideTransient(apply)
      else mutateSlide(apply, 'Edit')
    },
    [hist, mutateSlide, mutateSlideTransient],
  )

  const deleteSelection = useCallback(() => {
    if (!selection.length) return
    mutateSlide((s) => ({ ...s, elements: s.elements.filter((e) => !selection.includes(e.id)) }), 'Delete')
    setSelection([])
  }, [mutateSlide, selection])

  const duplicateSelection = useCallback(() => {
    if (!selection.length) return
    const copies = selectedEls.map((e) => ({
      ...e,
      id: uid('el'),
      x: e.x + 0.3,
      y: e.y + 0.3,
      name: e.name ? `${e.name} copy` : undefined,
    }))
    addElements(copies as El[])
  }, [selectedEls, selection.length, addElements])

  const copySelection = useCallback(() => {
    if (!selectedEls.length) return
    setClipboard(selectedEls.map((e) => ({ ...e })))
    toast(`Copied ${selectedEls.length} object${selectedEls.length > 1 ? 's' : ''}`)
  }, [selectedEls, toast])

  const paste = useCallback(() => {
    if (!clipboard?.length) return
    addElements(clipboard.map((e) => ({ ...e, id: uid('el'), x: e.x + 0.4, y: e.y + 0.4 })) as El[])
  }, [clipboard, addElements])

  const nudge = useCallback(
    (dx: number, dy: number) => {
      if (!selection.length) return
      patchEls(selection, (el) => ({ x: el.x + dx, y: el.y + dy }))
    },
    [patchEls, selection],
  )

  const reorder = useCallback<Store['reorder']>(
    (dir) => {
      if (!selection.length) return
      mutateSlide((s) => {
        const els = s.elements.slice()
        const picked = els.filter((e) => selection.includes(e.id))
        if (!picked.length) return s
        const rest = els.filter((e) => !selection.includes(e.id))
        if (dir === 'front') return { ...s, elements: [...rest, ...picked] }
        if (dir === 'back') return { ...s, elements: [...picked, ...rest] }
        const step = dir === 'forward' ? 1 : -1
        const out = els.slice()
        const order = step > 0 ? [...out.keys()].reverse() : [...out.keys()]
        for (const i of order) {
          if (!selection.includes(out[i].id)) continue
          const j = i + step
          if (j < 0 || j >= out.length) continue
          if (selection.includes(out[j].id)) continue
          const tmp = out[i]
          out[i] = out[j]
          out[j] = tmp
        }
        return { ...s, elements: out }
      }, 'Reorder')
    },
    [mutateSlide, selection],
  )

  const align = useCallback<Store['align']>(
    (mode) => {
      if (!selection.length) return
      const els = selectedEls
      if (!els.length) return
      const bounds = {
        l: Math.min(...els.map((e) => e.x)),
        r: Math.max(...els.map((e) => e.x + e.w)),
        t: Math.min(...els.map((e) => e.y)),
        b: Math.max(...els.map((e) => e.y + e.h)),
      }
      const cx = (bounds.l + bounds.r) / 2
      const cy = (bounds.t + bounds.b) / 2
      patchEls(selection, (el) => {
        switch (mode) {
          case 'left':
            return { x: bounds.l }
          case 'right':
            return { x: bounds.r - el.w }
          case 'hcenter':
            return { x: cx - el.w / 2 }
          case 'top':
            return { y: bounds.t }
          case 'bottom':
            return { y: bounds.b - el.h }
          case 'vcenter':
            return { y: cy - el.h / 2 }
          default:
            return {}
        }
      })
      if (mode === 'hdist' && els.length > 2) {
        const sorted = [...els].sort((a, b) => a.x - b.x)
        const totalW = sorted.reduce((n, e) => n + e.w, 0)
        const gap = (bounds.r - bounds.l - totalW) / (sorted.length - 1)
        let cursor = bounds.l
        const positions: Record<string, number> = {}
        sorted.forEach((e) => {
          positions[e.id] = cursor
          cursor += e.w + gap
        })
        patchEls(selection, (el) => ({ x: positions[el.id] ?? el.x }))
      }
      if (mode === 'vdist' && els.length > 2) {
        const sorted = [...els].sort((a, b) => a.y - b.y)
        const totalH = sorted.reduce((n, e) => n + e.h, 0)
        const gap = (bounds.b - bounds.t - totalH) / (sorted.length - 1)
        let cursor = bounds.t
        const positions: Record<string, number> = {}
        sorted.forEach((e) => {
          positions[e.id] = cursor
          cursor += e.h + gap
        })
        patchEls(selection, (el) => ({ y: positions[el.id] ?? el.y }))
      }
    },
    [patchEls, selectedEls, selection],
  )

  /* ---------------------------- media ---------------------------- */

  const insertImageFiles = useCallback<Store['insertImageFiles']>(
    async (files, target) => {
      const imgs = files.filter((f) => f.type.startsWith('image/'))
      if (!imgs.length) {
        toast('Those files are not images', 'warn')
        return
      }
      const created: El[] = []
      for (const file of imgs) {
        const src = await normalizeUpload(file)
        const { w: iw, h: ih } = await loadImageSize(src)
        const aspect = iw / Math.max(1, ih)
        const box = target ?? { x: 1.2, y: 1.4, w: 5.4, h: 3.6 }
        let w = box.w
        let h = w / aspect
        if (h > box.h) {
          h = box.h
          w = h * aspect
        }
        const el: ImageEl = {
          id: uid('img'),
          kind: 'image',
          name: file.name.replace(/\.[a-z0-9]+$/i, ''),
          src,
          x: Math.round((box.x + (box.w - w) / 2) * 1000) / 1000,
          y: Math.round((box.y + (box.h - h) / 2) * 1000) / 1000,
          w: Math.round(w * 1000) / 1000,
          h: Math.round(h * 1000) / 1000,
          rotation: 0,
          opacity: 1,
          fit: 'cover' as AnyImageFit,
          radius: 0.08,
          borderColor: null,
          borderWidth: 0,
          alt: file.name,
          shadow: null,
        }
        created.push(el)
      }
      addElements(created)
      toast(`Added ${created.length} image${created.length > 1 ? 's' : ''}`, 'ok')
    },
    [addElements, toast],
  )

  const insertBrandLogo = useCallback(
    (variant: LogoVariant = prefs.logoVariant) => {
      const h = 0.5
      addElement({
        id: uid('img'),
        kind: 'image',
        name: 'ADPL logo',
        brand: 'logo',
        src: `logo/adpl-logo-${variant}.png`,
        alt: 'ADPL',
        x: deck.size.w - 0.62 - h * 1.646,
        y: deck.size.h - 1.1,
        w: Math.round(h * 1.646 * 100) / 100,
        h,
        rotation: 0,
        opacity: 1,
        fit: 'contain',
        radius: 0,
        borderColor: null,
        borderWidth: 0,
        shadow: null,
      })
    },
    [addElement, deck.size.w, deck.size.h, prefs.logoVariant],
  )

  /* --------------------------- deck level -------------------------- */

  const resetDeck = useCallback(
    (mode: 'starter' | 'blank') => {
      const base = makeStarter()
      const next: Deck =
        mode === 'starter'
          ? base
          : { ...base, slides: [newSlide('cover'), newSlide('blank')], title: 'Untitled deck' }
      hist.reset(next)
      setCurrentIndex(0)
      setSelection([])
      toast(mode === 'starter' ? 'Starter deck restored' : 'New blank deck created', 'ok')
    },
    [hist, toast],
  )

  const loadProject = useCallback(
    (incoming: Deck) => {
      hist.set({ ...makeStarter(), ...incoming }, 'Open project')
      setCurrentIndex(0)
      setSelection([])
      toast('Project loaded', 'ok')
    },
    [hist, toast],
  )

  const project = useCallback(
    () => ({ app: 'adpl-deck-studio', savedAt: Date.now(), deck }),
    [deck],
  )

  const selectAll = useCallback(() => {
    setSelection(currentSlide.elements.map((e) => e.id))
  }, [currentSlide])

  /* ---------------------------- shortcuts --------------------------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
      const meta = e.metaKey || e.ctrlKey
      if (typing) {
        if (meta && e.key.toLowerCase() === 'a') return
        if (e.key === 'Escape') t.blur()
        return
      }
      if (meta && e.key.toLowerCase() === 'c') {
        e.preventDefault()
        copySelection()
      } else if (meta && e.key.toLowerCase() === 'v') {
        e.preventDefault()
        paste()
      } else if (meta && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        duplicateSelection()
      } else if (meta && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        selectAll()
      } else if (meta && e.key.toLowerCase() === 's') {
        e.preventDefault()
        patchDeck({}, 'Manual save')
        toast('Project saved to this browser', 'ok')
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        deleteSelection()
      } else if (e.key === 'Escape') {
        setSelection([])
      } else if (e.key.startsWith('Arrow')) {
        if (!selection.length) return
        e.preventDefault()
        const step = e.shiftKey ? 0.15 : 0.02
        if (e.key === 'ArrowLeft') nudge(-step, 0)
        if (e.key === 'ArrowRight') nudge(step, 0)
        if (e.key === 'ArrowUp') nudge(0, -step)
        if (e.key === 'ArrowDown') nudge(0, step)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [copySelection, paste, duplicateSelection, deleteSelection, nudge, selectAll, selection.length, patchDeck, toast])

  const value: Store = useMemo(
    () => ({
      deck,
      currentIndex: safeIndex,
      currentSlide,
      selection,
      selectedEls,
      clipboard,
      busy,
      toasts,
      canUndo: hist.canUndo,
      canRedo: hist.canRedo,
      prefs,
      setDeck,
      patchDeck,
      selectSlide,
      addSlide,
      duplicateSlide,
      deleteSlide,
      moveSlide,
      patchSlide,
      applyLayout,
      select,
      addElement,
      addElements,
      patchEls,
      deleteSelection,
      duplicateSelection,
      copySelection,
      paste,
      nudge,
      reorder,
      align,
      insertImageFiles,
      insertBrandLogo,
      undo: hist.undo,
      redo: hist.redo,
      resetDeck,
      setBusy,
      toast,
      setPrefs,
      project,
      loadProject,
      selectAll,
    }),
    [
      deck, safeIndex, currentSlide, selection, selectedEls, clipboard, busy, toasts,
      hist.canUndo, hist.canRedo, prefs, setDeck, patchDeck, selectSlide, addSlide,
      duplicateSlide, deleteSlide, moveSlide, patchSlide, applyLayout, select,
      addElement, addElements, patchEls, deleteSelection, duplicateSelection,
      copySelection, paste, nudge, reorder, align, insertImageFiles, insertBrandLogo,
      hist.undo, hist.redo, resetDeck, toast, setPrefs, project, loadProject, selectAll,
    ],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/* Re-export a couple of helpers so components can keep imports short. */
export { SW, SH }
export type { ShapeKind, SlideSize }
