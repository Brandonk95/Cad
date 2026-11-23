import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useEditor } from '../store/editor'
import { I } from '../ui/Icons'
import { TOUR } from './steps'
import { useTour } from './tour'

const CARD_W = 320
const GAP = 12

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

const rectOf = (anchor?: string): Rect | null => {
  if (!anchor) return null
  const el = document.querySelector(`[data-tour="${anchor}"]`)
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (!r.width && !r.height) return null
  return { x: r.left, y: r.top, w: r.width, h: r.height }
}

/** Coach marks: a ring around the control in play and a card that waits for you to use it. */
export function TourOverlay() {
  const active = useTour((s) => s.active)
  const stepIdx = useTour((s) => s.step)
  const { next, back, stop } = useTour.getState()
  const step = TOUR[stepIdx]
  const isDone = useEditor((s) => (active && step?.done ? step.done(s) : false))
  const [rect, setRect] = useState<Rect | null>(null)
  const [cardH, setCardH] = useState(180)
  const cardRef = useRef<HTMLDivElement>(null)

  // Follow the anchor as panels open, collapse and resize.
  useEffect(() => {
    if (!active) return
    const update = () => setRect(rectOf(step?.anchor))
    update()
    const t = setInterval(update, 250)
    window.addEventListener('resize', update)
    return () => {
      clearInterval(t)
      window.removeEventListener('resize', update)
    }
  }, [active, step?.anchor])

  useLayoutEffect(() => {
    if (cardRef.current) setCardH(cardRef.current.offsetHeight)
  })

  // Steps that wait on the user move on by themselves once it's done.
  useEffect(() => {
    if (!active || !isDone) return
    const t = setTimeout(() => useTour.getState().next(), 900)
    return () => clearTimeout(t)
  }, [active, isDone, stepIdx])

  if (!active || !step) return null

  const vw = window.innerWidth
  const vh = window.innerHeight
  let left = vw / 2 - CARD_W / 2
  let top = 72
  if (rect) {
    if (step.place === 'right') {
      left = rect.x + rect.w + GAP
      top = rect.y + rect.h / 2 - cardH / 2
    } else if (step.place === 'left') {
      left = rect.x - CARD_W - GAP
      top = rect.y + rect.h / 2 - cardH / 2
    } else if (step.place === 'below') {
      left = rect.x + rect.w / 2 - CARD_W / 2
      top = rect.y + rect.h + GAP
    } else if (step.place === 'above') {
      left = rect.x + rect.w / 2 - CARD_W / 2
      top = rect.y - cardH - GAP
    } else {
      // Canvas: top center of the viewport area, clear of the view tools.
      left = rect.x + rect.w / 2 - CARD_W / 2
      top = rect.y + 64
    }
  }
  left = Math.min(Math.max(12, left), vw - CARD_W - 12)
  top = Math.min(Math.max(56, top), vh - cardH - 12)
  const ring = rect && step.place !== 'canvas' ? rect : null

  return (
    <>
      {ring && <div className="tour-ring" style={{ left: ring.x - 4, top: ring.y - 4, width: ring.w + 8, height: ring.h + 8 }} aria-hidden="true" />}
      <div ref={cardRef} className="tour-card" style={{ left, top, width: CARD_W }} role="dialog" aria-label={`Tour step ${stepIdx + 1} of ${TOUR.length}: ${step.title}`}>
        <div className="tour-top">
          <span className="tour-count mono">
            {stepIdx + 1} / {TOUR.length}
          </span>
          <button className="btn ghost icon small" onClick={() => stop()} aria-label="End tour" title="End tour">
            <I.close size={16} />
          </button>
        </div>
        <h3>{step.title}</h3>
        <p>{step.body}</p>
        {step.done && (
          <p className={`tour-status${isDone ? ' ok' : ''}`}>
            {isDone ? <><I.check size={14} /> Nice.</> : 'Your turn. The tour moves on when it sees it.'}
          </p>
        )}
        <div className="tour-actions">
          {stepIdx > 0 && (
            <button className="btn small ghost" onClick={back}>
              Back
            </button>
          )}
          <span style={{ flex: 1 }} />
          {step.assist && !isDone && (
            <button className="btn small" onClick={() => step.assist!.run(useEditor.getState())}>
              {step.assist.label}
            </button>
          )}
          {step.done && !isDone ? (
            <button className="btn small ghost" onClick={next}>
              Skip
            </button>
          ) : (
            <button className="btn small primary" onClick={() => (stepIdx === TOUR.length - 1 ? stop(true) : next())}>
              {stepIdx === TOUR.length - 1 ? 'Finish' : 'Next'}
            </button>
          )}
        </div>
      </div>
    </>
  )
}
