/* ------------------------------------------------------------------
 * Undo / redo around a single piece of state.
 *
 * Three ways to change it:
 *   set()          → one undo step
 *   setTransient() → replaces the value without a step (live dragging)
 *   begin()/end()  → bracket many transient updates into ONE undo step
 * ------------------------------------------------------------------ */

import { useCallback, useEffect, useReducer, useRef } from 'react'

interface Entry<T> {
  v: T
  label: string
}

export interface HistoryApi<T> {
  state: T
  set: (updater: T | ((prev: T) => T), label?: string) => void
  setTransient: (updater: T | ((prev: T) => T)) => void
  begin: () => void
  end: (label?: string) => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  reset: (value: T) => void
}

export function useHistory<T>(initial: T, limit = 90): HistoryApi<T> {
  const [, forceRender] = useReducer((n: number) => n + 1, 0)
  const ref = useRef<T>(initial)
  const past = useRef<Entry<T>[]>([])
  const future = useRef<Entry<T>[]>([])
  const pending = useRef<T | null>(null)

  const resolve = (updater: T | ((prev: T) => T)): T =>
    typeof updater === 'function' ? (updater as (p: T) => T)(ref.current) : updater

  const set = useCallback(
    (updater: T | ((prev: T) => T), label = 'edit') => {
      const next = resolve(updater)
      if (next === ref.current) return
      past.current.push({ v: ref.current, label })
      if (past.current.length > limit) past.current.shift()
      future.current = []
      ref.current = next
      forceRender()
    },
    [limit],
  )

  const setTransient = useCallback((updater: T | ((prev: T) => T)) => {
    const next = resolve(updater)
    if (next === ref.current) return
    ref.current = next
    forceRender()
  }, [])

  const begin = useCallback(() => {
    pending.current = ref.current
  }, [])

  const end = useCallback(
    (label = 'edit') => {
      const mark = pending.current
      pending.current = null
      if (mark === null || mark === ref.current) return
      past.current.push({ v: mark, label })
      if (past.current.length > limit) past.current.shift()
      future.current = []
      forceRender()
    },
    [limit],
  )

  const undo = useCallback(() => {
    const entry = past.current.pop()
    if (!entry) return
    future.current.push({ v: ref.current, label: entry.label })
    ref.current = entry.v
    forceRender()
  }, [])

  const redo = useCallback(() => {
    const entry = future.current.pop()
    if (!entry) return
    past.current.push({ v: ref.current, label: entry.label })
    ref.current = entry.v
    forceRender()
  }, [])

  const reset = useCallback((value: T) => {
    past.current = []
    future.current = []
    pending.current = null
    ref.current = value
    forceRender()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey
      if (!meta) return
      const key = e.key.toLowerCase()
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  return {
    state: ref.current,
    set,
    setTransient,
    begin,
    end,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
    reset,
  }
}
