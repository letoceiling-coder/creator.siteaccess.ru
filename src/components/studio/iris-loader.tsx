/** Загрузчик: лепестки диафрагмы сходятся и раскрываются. */
export function IrisLoader({ size = 44, label = 'Загрузка' }: { size?: number; label?: string }) {
  return (
    <span role="status" aria-label={label} className="text-accent inline-flex">
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <circle
          cx="24"
          cy="24"
          r="22"
          stroke="currentColor"
          strokeOpacity="0.3"
          strokeWidth="1.5"
        />
        <g className="iris-blades" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
          {[0, 60, 120, 180, 240, 300].map((deg) => (
            <path
              key={deg}
              d="M24 4 L38 14 L24 24 Z"
              fill="currentColor"
              fillOpacity="0.18"
              transform={`rotate(${deg} 24 24)`}
            />
          ))}
        </g>
      </svg>
    </span>
  )
}
