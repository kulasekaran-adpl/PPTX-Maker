import React, { useState } from 'react'
import { toPng } from 'html-to-image'
import { useStore } from '../state/useStore'
import { buildPptx, exportFileName } from '../export/exportPptx'
import { downloadBlob, toDataUrl } from '../lib/util'
import { SKY } from '../theme'

export function TopBar({ onPresent }: { onPresent: () => void }) {
  const store = useStore()
  const { deck, patchDeck, undo, redo, canUndo, canRedo, setBusy, toast, currentSlide } = store
  const [menu, setMenu] = useState(false)

  const exportPptx = async () => {
    setMenu(false)
    setBusy('Preparing PowerPoint…')
    try {
      const blob = await buildPptx(deck, {
        resolveImage: toDataUrl,
        progress: (_d, _t, label) => setBusy(label),
      })
      downloadBlob(blob, exportFileName(deck, 'pptx'))
      toast('PowerPoint file downloaded — open it in Office', 'ok')
    } catch (err) {
      console.error(err)
      toast('Export failed. Check the console for details.', 'warn')
    } finally {
      setBusy(null)
    }
  }

  const exportPng = async () => {
    setMenu(false)
    const node = document.querySelector('.stage .slide') as HTMLElement | null
    if (!node) return
    setBusy('Rendering PNG…')
    try {
      const dataUrl = await toPng(node, { pixelRatio: 2, backgroundColor: '#FFFFFF' })
      const res = await fetch(dataUrl)
      downloadBlob(await res.blob(), exportFileName({ ...deck, title: `${deck.title}-slide` }, 'png'))
      toast('Slide exported as PNG', 'ok')
    } catch {
      toast('Could not render this slide', 'warn')
    } finally {
      setBusy(null)
    }
  }

  return (
    <header className="topbar">
      <div className="brand">
        <img src="logo/adpl-logo-blue.png" alt="ADPL" className="brand-logo" />
        <div className="brand-text">
          <b>Deck Studio</b>
          <span>Sky-blue PPTX template</span>
        </div>
      </div>

      <input
        className="deck-title"
        value={deck.title}
        onChange={(e) => patchDeck({ title: e.target.value }, 'Deck title')}
        title="Deck title"
      />

      <div className="topbar-actions">
        <button className="btn tiny" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
          ↶
        </button>
        <button className="btn tiny" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
          ↷
        </button>
        <span className="divider" />
        <button className="btn tiny" onClick={onPresent} title="Present the deck">
          ▶ Present
        </button>
        <div className="menu-wrap">
          <button className="btn primary" onClick={() => setMenu((m) => !m)}>
            ⬇ Export
          </button>
          {menu && (
            <>
              <div className="menu-backdrop" onClick={() => setMenu(false)} />
              <div className="menu">
                <button onClick={exportPptx}>
                  <b>PowerPoint (.pptx)</b>
                  <span>Editable slides — text, shapes and images stay editable</span>
                </button>
                <button onClick={exportPng}>
                  <b>Current slide as PNG</b>
                  <span>High-resolution image of slide {deck.slides.indexOf(currentSlide) + 1}</span>
                </button>
                <button
                  onClick={() => {
                    setMenu(false)
                    onPresent()
                  }}
                >
                  <b>Preview</b>
                  <span>Full-screen check before you send it</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

export const BRAND = SKY.brand
