/**
 * Çok katmanlı stadyum gece atmosferi:
 *   1. Derin saha base gradient (lacivert-yeşil-siyah)
 *   2. Saha çizgileri (orta yuvarlak, ceza sahaları)
 *   3. Sağ-üst ve sol-üst köşelerde sabit spotlight halo
 *   4. Yavaş sürüklenen sweep (sol → sağ, 28s)
 *   5. Bilinçaltı crowd noise (statik SVG noise, multiply blend)
 *   6. Çevresel vignette (kenarlar koyu, ortayı vurgular)
 *
 * Hepsi pure CSS/SVG. JS yok, framerate harcamaz.
 * prefers-reduced-motion açıkken sweep'i durdururuz.
 */
export function PitchBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {/* 1. Base — derin gece sahası */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% 35%, #1f6b3a 0%, #0e3e21 38%, #051a0e 75%, #020a06 100%)',
        }}
      />

      {/* 2. Çim çizgi pattern + saha çizgileri */}
      <div
        className="absolute inset-0 opacity-[0.07] mix-blend-overlay"
        style={{
          backgroundImage:
            'repeating-linear-gradient(180deg, rgba(255,255,255,0.4) 0 1px, transparent 1px 80px)',
        }}
      />

      <svg
        viewBox="0 0 1600 900"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full opacity-[0.18]"
        aria-hidden
      >
        <defs>
          <linearGradient id="pitchLine" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.15" />
          </linearGradient>
        </defs>
        <g
          fill="none"
          stroke="url(#pitchLine)"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <rect x="60" y="60" width="1480" height="780" rx="6" />
          <line x1="800" y1="60" x2="800" y2="840" />
          <circle cx="800" cy="450" r="110" />
          <circle cx="800" cy="450" r="3" fill="#ffffff" stroke="none" opacity="0.6" />
          <rect x="60" y="270" width="200" height="360" />
          <rect x="60" y="370" width="80" height="160" />
          <path d="M260 370 A 110 110 0 0 1 260 530" />
          <rect x="1340" y="270" width="200" height="360" />
          <rect x="1460" y="370" width="80" height="160" />
          <path d="M1340 370 A 110 110 0 0 0 1340 530" />
        </g>
      </svg>

      {/* 3. Sabit spotlight halo'lar — sol-üst ve sağ-üst */}
      <div
        className="absolute -top-32 -left-32 h-[60vh] w-[60vh] rounded-full opacity-60 blur-[120px]"
        style={{
          background:
            'radial-gradient(circle, rgba(255,235,180,0.55) 0%, rgba(255,200,90,0.25) 35%, transparent 70%)',
        }}
      />
      <div
        className="absolute -top-40 -right-40 h-[55vh] w-[55vh] rounded-full opacity-50 blur-[140px]"
        style={{
          background:
            'radial-gradient(circle, rgba(180,220,255,0.45) 0%, rgba(120,180,255,0.18) 40%, transparent 75%)',
        }}
      />

      {/* 4. Yavaş sweep — sol-altta hareket eden tek spotlight */}
      <div className="absolute inset-0 overflow-hidden">
        <div
          className="absolute top-1/4 h-[60vh] w-[80vh] rounded-full opacity-30 blur-[100px] animate-pitch-sweep"
          style={{
            background:
              'radial-gradient(circle, rgba(95,224,122,0.4) 0%, rgba(95,224,122,0.15) 40%, transparent 70%)',
          }}
        />
      </div>

      {/* 5. Crowd noise — gece tribün hissi, çok hafif */}
      <svg
        className="absolute inset-0 h-full w-full opacity-[0.18] mix-blend-overlay"
        aria-hidden
      >
        <filter id="crowd-noise">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.9"
            numOctaves="2"
            seed="42"
          />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0.85
                    0 0 0 0 0.7
                    0 0 0 0 0.3
                    0 0 0 0.5 0"
          />
        </filter>
        <rect width="100%" height="100%" filter="url(#crowd-noise)" />
      </svg>

      {/* 6. Vignette — kenar koyuluğu, dramatik odak */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 100% 100% at 50% 50%, transparent 50%, rgba(0,0,0,0.55) 100%)',
        }}
      />
    </div>
  );
}
