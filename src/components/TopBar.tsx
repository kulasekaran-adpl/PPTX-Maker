import React, { useState } from 'react'
import { toPng } from 'html-to-image'
import { useStore } from '../state/useStore'
import { buildPptx, exportFileName } from '../export/exportPptx'
import { buildPdf } from '../export/exportPdf'
import { downloadBlob, toDataUrl } from '../lib/util'
import { SKY } from '../theme'

type FontMode = 'slides-safe' | 'as-designed'

export function TopBar({ onPresent }: { onPresent: () => void }) {
  const store = useStore()
  const { deck, patchDeck, undo, redo, canUndo, canRedo, setBusy, toast, currentSlide } = store
  const [menu, setMenu] = useState(false)
  const [fontMode, setFontMode] = useState<FontMode>('slides-safe')

  const closeMenu = () => setMenu(false)

  const exportPptx = async () => {
    closeMenu()
    setBusy('Preparing PowerPoint…')
    try {
      const blob = await buildPptx(deck, {
        resolveImage: toDataUrl,
        fonts: fontMode,
        progress: (_d, _t, label) => setBusy(label),
      })
      downloadBlob(blob, exportFileName(deck, 'pptx'))
      toast(
        fontMode === 'slides-safe'
          ? 'PowerPoint file ready — safe to upload to Google Slides'
          : 'PowerPoint file ready — fonts kept as designed',
        'ok',
      )
    } catch (err) {
      console.error(err)
      toast('PPTX export failed. Check the console for details.', 'warn')
    } finally {
      setBusy(null)
    }
  }

  const exportPdf = async () => {
    closeMenu()
    setBusy('Rendering PDF…')
    try {
      let last = 0
      const blob = await buildPdf(deck, {
        pxPerInch: 192, // 2560 × 1440 per 16:9 page — crisp on screen and in print
        onProgress: (done, total) => {
          if (done !== last) {
            last = done
            setBusy(`Rendering PDF… slide ${Math.min(done + 1, total)} of ${total}`)
          }
        },
      })
      downloadBlob(blob, exportFileName(deck, 'pdf'))
      toast('PDF downloaded — one page per slide', 'ok')
    } catch (err) {
      console.error(err)
      toast('PDF export failed. Check the console for details.', 'warn')
    } finally {
      setBusy(null)
    }
  }

  const exportPng = async () => {
    closeMenu()
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
              <div className="menu-backdrop" onClick={closeMenu} />
              <div className="menu wide">
                <button onClick={exportPptx}>
                  <b>PowerPoint (.pptx)</b>
                  <span>Editable slides — text, shapes and images stay editable</span>
                </button>
                <button onClick={exportPdf}>
                  <b>PDF (all slides)</b>
                  <span>One page per slide, 2560 × 1440 — for sharing and printing</span>
                </button>
                <button onClick={exportPng}>
                  <b>Current slide as PNG</b>
                  <span>High-resolution image of slide {deck.slides.indexOf(currentSlide) + 1}</span>
                </button>
                <button
                  onClick={() => {
                    closeMenu()
                    onPresent()
                  }}
                >
                  <b>Preview</b>
                  <span>Full-screen check before you send it</span>
                </button>

                <div className="menu-sep" />
                <div className="menu-option">
                  <label className="check tiny">
                    <input
                      type="checkbox"
                      checked={fontMode === 'slides-safe'}
                      onChange={(e) => setFontMode(e.target.checked ? 'slides-safe' : 'as-designed')}
                    />
                    <span>
                      <b>Google Slides–safe fonts</b>
                      <span>
                        Swaps fonts Slides does not have (e.g. Calibri) for Arial, and pins text boxes so
                        nothing re-wraps or shifts after upload. Turn off to keep your chosen fonts for a
                        PowerPoint-only audience.
                      </span>
                    </span>
                  </label>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

export const BRAND = SKY.brand
