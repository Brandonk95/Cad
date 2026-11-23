// Official Stratum mark (from Stratum_Vector_Logo_Suite): three slanted layer bars forming an S.
const BAR = 'M 18,0 H 115 C 124,0 129,6 125,15 L 117,31 C 114,38 109,41 101,41 H 4 C -5,41 -9,35 -5,26 L 3,10 C 7,3 11,0 18,0 Z'

export const Mark = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="-8 -8 186 147" aria-hidden="true">
    <g fill="var(--accent)">
      <path d={BAR} transform="translate(42 0)" />
      <path d={BAR} transform="translate(0 45)" />
      <path d={BAR} transform="translate(28 90)" />
    </g>
  </svg>
)

export const Wordmark = () => (
  <span className="wordmark">
    <Mark />
    stratum
  </span>
)
