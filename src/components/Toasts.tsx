import React from 'react'
import { useStore } from '../state/useStore'

export function Toasts() {
  const { toasts } = useStore()
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone}`}>
          {t.msg}
        </div>
      ))}
    </div>
  )
}

export function BusyOverlay() {
  const { busy } = useStore()
  if (!busy) return null
  return (
    <div className="busy">
      <div className="busy-card">
        <span className="spinner" />
        <div>
          <b>{busy}</b>
          <span>Building native PowerPoint objects…</span>
        </div>
      </div>
    </div>
  )
}
