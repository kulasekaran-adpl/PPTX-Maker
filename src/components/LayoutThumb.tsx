import React from 'react'
import { SKY } from '../theme'

/** A wireframe thumbnail of a template layout, drawn with plain divs. */
export function LayoutThumb({ id }: { id: string }) {
  const bar = (x: number, y: number, w: number, h: number, c: string, key: string, r = 0) => (
    <span
      key={key}
      style={{
        position: 'absolute',
        left: `${x}%`,
        top: `${y}%`,
        width: `${w}%`,
        height: `${h}%`,
        background: c,
        borderRadius: r,
      }}
    />
  )
  const items: React.ReactNode[] = []
  switch (id) {
    case 'cover':
      items.push(
        bar(6, 22, 44, 7, SKY.ink, 'a'),
        bar(6, 34, 38, 4, SKY.inkSoft, 'b'),
        bar(6, 45, 14, 3, SKY.brand, 'c'),
        bar(6, 58, 26, 3, SKY.inkFaint, 'd'),
        <span
          key="sky"
          style={{
            position: 'absolute',
            inset: 0,
            clipPath: 'polygon(52% 0, 100% 0, 100% 100%, 34% 100%)',
            background: SKY.brand,
          }}
        />,
      )
      break
    case 'agenda':
      items.push(bar(6, 14, 30, 6, SKY.ink, 'a'), bar(6, 26, 10, 4, SKY.brand, 'b'))
      for (let i = 0; i < 6; i += 1) {
        const col = i % 2
        const row = Math.floor(i / 2)
        items.push(
          bar(6 + col * 46, 40 + row * 18, 6, 6, SKY.sky200, `c${i}`, 3),
          bar(15 + col * 46, 41 + row * 18, 28, 4, SKY.ink, `d${i}`),
        )
      }
      break
    case 'section':
      items.push(
        bar(0, 0, 100, 100, SKY.brand, 'bg'),
        bar(6, 36, 30, 3, SKY.sky300, 'a'),
        bar(6, 44, 60, 8, SKY.white, 'b'),
        bar(6, 58, 45, 4, SKY.sky100, 'c'),
      )
      break
    case 'bullets':
      items.push(bar(6, 14, 40, 6, SKY.ink, 'a'), bar(6, 24, 12, 3, SKY.brand, 'b'), bar(70, 32, 24, 52, SKY.sky100, 'd', 2))
      for (let i = 0; i < 5; i += 1) items.push(bar(6, 38 + i * 10, 52 - (i % 2) * 8, 4, SKY.inkSoft, `c${i}`))
      break
    case 'text-image':
      items.push(
        bar(6, 14, 40, 6, SKY.ink, 'a'),
        bar(6, 24, 12, 3, SKY.brand, 'b'),
        bar(6, 36, 40, 12, SKY.inkSoft, 'c'),
        bar(6, 56, 36, 28, SKY.inkSoft, 'd'),
        bar(52, 32, 42, 52, SKY.sky300, 'e', 2),
      )
      break
    case 'image-text':
      items.push(
        bar(6, 14, 40, 6, SKY.ink, 'a'),
        bar(6, 24, 12, 3, SKY.brand, 'b'),
        bar(6, 32, 42, 52, SKY.sky300, 'e', 2),
        bar(52, 36, 40, 12, SKY.inkSoft, 'c'),
        bar(52, 56, 36, 28, SKY.inkSoft, 'd'),
      )
      break
    case 'image-grid':
      items.push(bar(6, 14, 44, 6, SKY.ink, 'a'), bar(6, 24, 12, 3, SKY.brand, 'b'))
      for (let i = 0; i < 3; i += 1) {
        items.push(
          bar(6 + i * 30, 34, 26, 34, SKY.sky200, `c${i}`, 2),
          bar(6 + i * 30, 72, 26, 4, SKY.ink, `d${i}`),
          bar(6 + i * 30, 79, 20, 3, SKY.inkFaint, `e${i}`),
        )
      }
      break
    case 'stats':
      items.push(bar(6, 14, 44, 6, SKY.ink, 'a'), bar(6, 24, 12, 3, SKY.brand, 'b'))
      for (let i = 0; i < 4; i += 1) {
        items.push(
          bar(6 + i * 23, 34, 21, 44, SKY.sky50, `c${i}`, 2),
          bar(6 + i * 23, 34, 21, 2, SKY.brand, `t${i}`),
          bar(9 + i * 23, 44, 14, 8, SKY.brand, `d${i}`),
          bar(9 + i * 23, 58, 15, 3, SKY.inkSoft, `e${i}`),
        )
      }
      break
    case 'timeline':
      items.push(bar(6, 14, 40, 6, SKY.ink, 'a'), bar(6, 24, 12, 3, SKY.brand, 'b'), bar(10, 52, 80, 1.4, SKY.sky300, 'rail'))
      for (let i = 0; i < 5; i += 1) {
        items.push(
          bar(10 + i * 20, 50, 3, 5, SKY.brand, `d${i}`, 4),
          bar(6 + i * 20, i % 2 ? 62 : 36, 16, 3, SKY.ink, `e${i}`),
          bar(6 + i * 20, i % 2 ? 68 : 42, 14, 2.5, SKY.inkFaint, `f${i}`),
        )
      }
      break
    case 'comparison':
      items.push(
        bar(6, 14, 40, 6, SKY.ink, 'a'),
        bar(6, 24, 12, 3, SKY.brand, 'b'),
        bar(6, 32, 43, 56, SKY.sky100, 'c', 2),
        bar(51, 32, 43, 56, SKY.brandDeep, 'd', 2),
      )
      break
    case 'closing':
      items.push(
        bar(0, 0, 100, 100, SKY.brandDeep, 'bg'),
        bar(6, 34, 24, 3, SKY.sky300, 'a'),
        bar(6, 42, 58, 8, SKY.white, 'b'),
        bar(6, 58, 30, 4, SKY.sky100, 'c'),
      )
      break
    default:
      items.push(bar(6, 12, 20, 4, SKY.inkFaint, 'a'), bar(80, 88, 14, 3, SKY.inkFaint, 'b'))
  }
  return <span className="thumb-wire">{items}</span>
}
