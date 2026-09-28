import React, { useEffect, useRef, useState } from 'react'
import { SWATCHES } from '../theme'

/* ------------------------------------------------------------------
 * Small, dependency-free form controls used across the panels.
 * ------------------------------------------------------------------ */

export const Section = ({
  title,
  children,
  right,
  defaultOpen = true,
}: {
  title: string
  children: React.ReactNode
  right?: React.ReactNode
  defaultOpen?: boolean
}) => {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="sec">
      <button className="sec-head" onClick={() => setOpen((o) => !o)} type="button">
        <span className={`chev ${open ? 'open' : ''}`}>▸</span>
        {title}
        <span className="grow" />
        {right}
      </button>
      {open && <div className="sec-body">{children}</div>}
    </div>
  )
}

export const Row = ({ children, cols = 2 }: { children: React.ReactNode; cols?: number }) => (
  <div className="row" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
    {children}
  </div>
)

export const Field = ({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) => (
  <label className="field" title={hint}>
    <span className="field-label">{label}</span>
    {children}
  </label>
)

export const NumberInput = ({
  value,
  onChange,
  step = 0.05,
  min,
  max,
  suffix,
  onCommit,
}: {
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  max?: number
  suffix?: string
  onCommit?: () => void
}) => (
  <span className="num-wrap">
    <input
      className="input"
      type="number"
      value={Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0}
      step={step}
      min={min}
      max={max}
      onChange={(e) => {
        const v = parseFloat(e.target.value)
        if (!Number.isNaN(v)) onChange(v)
      }}
      onBlur={onCommit}
    />
    {suffix && <span className="suffix">{suffix}</span>}
  </span>
)

export const TextInput = ({
  value,
  onChange,
  placeholder,
  onEnter,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  onEnter?: () => void
}) => (
  <input
    className="input"
    value={value}
    placeholder={placeholder}
    onChange={(e) => onChange(e.target.value)}
    onKeyDown={(e) => {
      if (e.key === 'Enter' && onEnter) onEnter()
    }}
  />
)

export const Select = <T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) => (
  <select className="input" value={value} onChange={(e) => onChange(e.target.value as T)}>
    {options.map((o) => (
      <option key={o.value} value={o.value}>
        {o.label}
      </option>
    ))}
  </select>
)

/* ------------------------------ colour ------------------------------ */

export function ColorField({
  value,
  onChange,
  label,
  allowNone,
  noneLabel = 'None',
  onBegin,
  onEnd,
}: {
  value: string | null
  onChange: (v: string | null) => void
  label?: string
  allowNone?: boolean
  noneLabel?: string
  onBegin?: () => void
  onEnd?: () => void
}) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const swatch = value ?? 'transparent'

  return (
    <span className="color-field" ref={wrap}>
      {label && <span className="field-label">{label}</span>}
      <button
        type="button"
        className="color-btn"
        onClick={() => setOpen((o) => !o)}
        title={value ?? 'none'}
      >
        <span
          className={`swatch ${value ? '' : 'swatch-none'}`}
          style={{ background: swatch }}
        />
        <span className="hex">{value ? value.replace('#', '').toUpperCase() : noneLabel}</span>
      </button>
      {open && (
        <div className="popover">
          <div className="swatch-grid">
            {SWATCHES.map((s) => (
              <button
                key={s.value}
                type="button"
                className="sw"
                style={{ background: s.value }}
                title={`${s.name} · ${s.value}`}
                onClick={() => {
                  onChange(s.value)
                  setOpen(false)
                }}
              />
            ))}
          </div>
          <div className="row" style={{ gridTemplateColumns: '1fr auto' }}>
            <input
              className="input"
              value={value ?? ''}
              placeholder="#097DC2"
              onChange={(e) => {
                const v = e.target.value.trim()
                if (/^#?[0-9a-fA-F]{6}$/.test(v)) onChange(v.startsWith('#') ? v.toUpperCase() : `#${v.toUpperCase()}`)
                else if (v === '') onChange(null)
              }}
            />
            <input
              type="color"
              className="native-color"
              value={value && /^#[0-9a-f]{6}$/i.test(value) ? value : '#097DC2'}
              onChange={(e) => onChange(e.target.value.toUpperCase())}
            />
          </div>
          {allowNone && (
            <button
              type="button"
              className="btn tiny wide"
              onClick={() => {
                onChange(null)
                setOpen(false)
              }}
            >
              {noneLabel}
            </button>
          )}
          {onBegin ? (
            <p className="hint">
              Colours are applied instantly · use <kbd>Ctrl</kbd>+<kbd>Z</kbd> to step back
            </p>
          ) : null}
        </div>
      )}
    </span>
  )
}

/* ------------------------------ buttons ------------------------------ */

export const IconBtn = ({
  title,
  onClick,
  children,
  active,
  danger,
  disabled,
}: {
  title: string
  onClick: () => void
  children: React.ReactNode
  active?: boolean
  danger?: boolean
  disabled?: boolean
}) => (
  <button
    type="button"
    className={`icon-btn ${active ? 'active' : ''} ${danger ? 'danger' : ''}`}
    title={title}
    aria-label={title}
    onClick={onClick}
    disabled={disabled}
  >
    {children}
  </button>
)

export const Seg = <T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: React.ReactNode; title?: string }[]
}) => (
  <div className="seg">
    {options.map((o) => (
      <button
        key={o.value}
        type="button"
        className="btn tiny"
        data-active={o.value === value}
        title={o.title}
        onClick={() => onChange(o.value)}
      >
        {o.label}
      </button>
    ))}
  </div>
)

export const Toggle = ({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) => (
  <label className="check">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    {label}
  </label>
)
