import type { ReactNode, SVGProps } from 'react'

// 1.5 px stroke line icons on a 20 px grid, rounded joins.
type P = SVGProps<SVGSVGElement> & { size?: number }

const Svg = ({ size = 20, children, ...rest }: P & { children: ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
    {children}
  </svg>
)

/** Layered-line motif marking print-specific tools. */
const Layers = () => (
  <g strokeWidth={1.2}>
    <path d="M13.5 15.5h5M14.5 17.5h4M13.5 19h5" />
  </g>
)

export const I = {
  box: (p: P) => <Svg {...p}><path d="M10 2.5 16.5 6v8L10 17.5 3.5 14V6z" /><path d="M3.5 6 10 9.5 16.5 6M10 9.5v8" /></Svg>,
  cylinder: (p: P) => <Svg {...p}><ellipse cx="10" cy="5" rx="6" ry="2.5" /><path d="M4 5v10c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V5" /></Svg>,
  sphere: (p: P) => <Svg {...p}><circle cx="10" cy="10" r="7" /><path d="M3 10c0 1.7 3.1 3 7 3s7-1.3 7-3" /></Svg>,
  cone: (p: P) => <Svg {...p}><path d="M10 2.5 4 15M10 2.5 16 15" /><ellipse cx="10" cy="15" rx="6" ry="2.5" /></Svg>,
  wedge: (p: P) => <Svg {...p}><path d="M3 16h14L3 5z" /><path d="M3 5l4-2 10 11v2" /></Svg>,
  screwHole: (p: P) => <Svg {...p}><circle cx="8.5" cy="8.5" r="5.5" /><circle cx="8.5" cy="8.5" r="2.2" /><Layers /></Svg>,
  magnetPocket: (p: P) => <Svg {...p}><path d="M4 3v6a4.5 4.5 0 0 0 9 0V3h-3v6a1.5 1.5 0 0 1-3 0V3z" /><Layers /></Svg>,
  pin: (p: P) => <Svg {...p}><ellipse cx="7" cy="4" rx="3" ry="1.3" /><path d="M4 4v8c0 .7 1.3 1.3 3 1.3s3-.6 3-1.3V4" /><Layers /></Svg>,
  group: (p: P) => <Svg {...p}><rect x="2.5" y="2.5" width="9" height="9" rx="1.5" /><rect x="8.5" y="8.5" width="9" height="9" rx="1.5" /></Svg>,
  ungroup: (p: P) => <Svg {...p}><rect x="2.5" y="2.5" width="7" height="7" rx="1.5" /><rect x="10.5" y="10.5" width="7" height="7" rx="1.5" strokeDasharray="2 2" /></Svg>,
  hole: (p: P) => <Svg {...p}><rect x="3" y="3" width="14" height="14" rx="2" strokeDasharray="2.5 2" /></Svg>,
  move: (p: P) => <Svg {...p}><path d="M10 2.5v15M2.5 10h15M10 2.5 8 4.5M10 2.5l2 2M10 17.5l-2-2M10 17.5l2-2M2.5 10l2-2M2.5 10l2 2M17.5 10l-2-2M17.5 10l-2 2" /></Svg>,
  scale: (p: P) => <Svg {...p}><rect x="3" y="9" width="8" height="8" rx="1" /><path d="M10 10l7-7M12 3h5v5M3 6V3h3M17 14v3h-3" /></Svg>,
  rotate: (p: P) => <Svg {...p}><path d="M16 10a6 6 0 1 1-1.8-4.3" /><path d="M16.5 3v3.5H13" /></Svg>,
  size: (p: P) => <Svg {...p}><path d="M3 17 17 3M3 17v-4M3 17h4M17 3h-4M17 3v4" /></Svg>,
  delete: (p: P) => <Svg {...p}><path d="M4 5.5h12M8 5.5V3.5h4v2M5.5 5.5l.8 11h7.4l.8-11" /></Svg>,
  duplicate: (p: P) => <Svg {...p}><rect x="6.5" y="6.5" width="10" height="10" rx="1.5" /><path d="M13.5 6.5v-2a1 1 0 0 0-1-1h-8a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2" /></Svg>,
  fix: (p: P) => <Svg {...p}><path d="M12.5 3.5a4 4 0 0 0-4.8 5.3L3 13.5 6.5 17l4.7-4.7a4 4 0 0 0 5.3-4.8l-2.5 2.5-2.5-.5-.5-2.5z" /></Svg>,
  start: (p: P) => <Svg {...p}><circle cx="10" cy="10" r="2.5" /></Svg>,
  color: (p: P) => <Svg {...p}><path d="M10 2.5s5.5 6 5.5 9.5a5.5 5.5 0 0 1-11 0C4.5 8.5 10 2.5 10 2.5z" /></Svg>,
  orient: (p: P) => <Svg {...p}><path d="M3 16.5h14" /><path d="M6 13.5 10 4l4 9.5z" /><path d="M14.5 5.5a5 5 0 0 1 1.5 3.5" /></Svg>,
  undo: (p: P) => <Svg {...p}><path d="M7 4.5 3.5 8 7 11.5" /><path d="M3.5 8H12a4.5 4.5 0 0 1 0 9H9" /></Svg>,
  redo: (p: P) => <Svg {...p}><path d="M13 4.5 16.5 8 13 11.5" /><path d="M16.5 8H8a4.5 4.5 0 0 0 0 9h3" /></Svg>,
  // Mode icons: cube (Block), pencil on a plane (Sketch), stacked tree (Pro)
  extrude: (p: P) => <Svg {...p}><path d="M4 8.5 9 5l7 2.5-2 5H5z" /><path d="M4 8.5V14l1 4h9l2-5.5V7.5M5 12.5V18M14 12.5V18" /></Svg>,
  pointer: (p: P) => <Svg {...p}><path d="M5 3l10 6.5-4.3 1.2 2.6 5-2 1-2.6-5L5 14.5z" /></Svg>,
  rect: (p: P) => <Svg {...p}><rect x="3" y="5" width="14" height="10" rx="1" /><circle cx="3" cy="5" r="1.2" fill="currentColor" /><circle cx="17" cy="15" r="1.2" fill="currentColor" /></Svg>,
  circle: (p: P) => <Svg {...p}><circle cx="10" cy="10" r="7" /><path d="M10 10h7" /><circle cx="10" cy="10" r="1.2" fill="currentColor" /></Svg>,
  line: (p: P) => <Svg {...p}><path d="M3.5 15.5 7 5l6.5 3 3 8z" /><circle cx="3.5" cy="15.5" r="1.2" fill="currentColor" /><circle cx="7" cy="5" r="1.2" fill="currentColor" /><circle cx="13.5" cy="8" r="1.2" fill="currentColor" /></Svg>,
  pull: (p: P) => <Svg {...p}><path d="M3 16h14M5 16v-3h10v3M10 11V3M7 6l3-3 3 3" /></Svg>,
  block: (p: P) => <Svg {...p}><path d="M10 2.5 16.5 6v8L10 17.5 3.5 14V6z" /><path d="M3.5 6 10 9.5 16.5 6M10 9.5v8" /></Svg>,
  sketch: (p: P) => <Svg {...p}><path d="M2.5 15.5 6 12.5h11.5L14 15.5z" /><path d="m8 11 6.5-6.5 1.5 1.5L9.5 12.5H8z" /></Svg>,
  pro: (p: P) => <Svg {...p}><rect x="2.5" y="2.5" width="6" height="4" rx="1" /><rect x="11.5" y="8" width="6" height="4" rx="1" /><rect x="11.5" y="13.5" width="6" height="4" rx="1" /><path d="M5.5 6.5V15.5h6M5.5 10h6" /></Svg>,
  printer: (p: P) => <Svg {...p}><rect x="2.5" y="2.5" width="15" height="15" rx="2" /><path d="M2.5 6h15M8 6v3.5h4V6M6 14.5h8" /></Svg>,
  share: (p: P) => <Svg {...p}><circle cx="15" cy="4.5" r="2" /><circle cx="5" cy="10" r="2" /><circle cx="15" cy="15.5" r="2" /><path d="m6.8 9 6.4-3.5M6.8 11l6.4 3.5" /></Svg>,
  send: (p: P) => <Svg {...p}><path d="M10 13V3M6 7l4-4 4 4M3.5 13v2.5a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V13" /></Svg>,
  chevronLeft: (p: P) => <Svg {...p}><path d="M12 4.5 6.5 10l5.5 5.5" /></Svg>,
  chevronRight: (p: P) => <Svg {...p}><path d="M8 4.5l5.5 5.5L8 15.5" /></Svg>,
  chevronDown: (p: P) => <Svg {...p}><path d="M5 8l5 5 5-5" /></Svg>,
  close: (p: P) => <Svg {...p}><path d="M5 5l10 10M15 5 5 15" /></Svg>,
  check: (p: P) => <Svg {...p}><path d="M4 10.5 8 14.5 16 5.5" /></Svg>,
  checkCircle: (p: P) => <Svg {...p}><circle cx="10" cy="10" r="7.5" /><path d="M6.5 10.2 9 12.7l4.5-5" /></Svg>,
  info: (p: P) => <Svg {...p}><circle cx="10" cy="10" r="7.5" /><path d="M10 9v5M10 6.2v.1" /></Svg>,
  warn: (p: P) => <Svg {...p}><path d="M10 3 18 16.5H2z" /><path d="M10 8v4M10 14.3v.1" /></Svg>,
  eye: (p: P) => <Svg {...p}><path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10z" /><circle cx="10" cy="10" r="2.5" /></Svg>,
  eyeOff: (p: P) => <Svg {...p}><path d="M3 3l14 14M8.2 5a8 8 0 0 1 1.8-.5c5 0 8 5.5 8 5.5a14 14 0 0 1-2.2 2.8M5.4 6.6C3.3 8 2 10 2 10s3 5.5 8 5.5a7.7 7.7 0 0 0 3.3-.8" /></Svg>,
  frame: (p: P) => <Svg {...p}><path d="M3 7V3.5h3.5M13.5 3.5H17V7M17 13v3.5h-3.5M6.5 16.5H3V13" /><rect x="7" y="7" width="6" height="6" rx="1" /></Svg>,
  sun: (p: P) => <Svg {...p}><circle cx="10" cy="10" r="3.5" /><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4" /></Svg>,
  moon: (p: P) => <Svg {...p}><path d="M16.5 12A7 7 0 0 1 8 3.5a7 7 0 1 0 8.5 8.5z" /></Svg>,
  plus: (p: P) => <Svg {...p}><path d="M10 4v12M4 10h12" /></Svg>,
  calibrate: (p: P) => <Svg {...p}><rect x="2.5" y="7" width="15" height="6" rx="1" /><circle cx="6" cy="10" r="1.2" /><circle cx="10" cy="10" r="1.4" /><circle cx="14" cy="10" r="1.6" /></Svg>,
  dropBed: (p: P) => <Svg {...p}><path d="M10 3v8M7 8l3 3 3-3M3 16.5h14" /></Svg>,
  keyboard: (p: P) => <Svg {...p}><rect x="2" y="5" width="16" height="10" rx="1.5" /><path d="M5 8h1M8 8h1M11 8h1M14 8h1M5 11h1M14 11h1M8 11h4" /></Svg>,
  logout: (p: P) => <Svg {...p}><path d="M8 3.5H4.5a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1H8M12.5 6.5 16 10l-3.5 3.5M16 10H8" /></Svg>,
  home: (p: P) => <Svg {...p}><path d="M3 9 10 3l7 6v7.5a1 1 0 0 1-1 1h-3.5V12h-5v5.5H4a1 1 0 0 1-1-1z" /></Svg>,
}

export type IconName = keyof typeof I

export const Icon = ({ name, ...p }: P & { name: IconName }) => I[name](p)
