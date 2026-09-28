import React, { useState } from 'react'
import { StoreProvider } from './state/useStore'
import { TopBar } from './components/TopBar'
import { LeftRail } from './components/LeftRail'
import { Canvas } from './components/Canvas'
import { Inspector } from './components/Inspector'
import { Preview } from './components/Preview'
import { BusyOverlay, Toasts } from './components/Toasts'

function Shell() {
  const [presenting, setPresenting] = useState(false)

  return (
    <div className="app">
      <TopBar onPresent={() => setPresenting(true)} />
      <div className="workspace">
        <LeftRail onPresent={() => setPresenting(true)} />
        <main className="canvas-column">
          <Canvas />
        </main>
        <aside className="inspector">
          <div className="inspector-head">Properties</div>
          <Inspector />
        </aside>
      </div>
      {presenting && <Preview onClose={() => setPresenting(false)} />}
      <Toasts />
      <BusyOverlay />
    </div>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  )
}
