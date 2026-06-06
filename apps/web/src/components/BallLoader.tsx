'use client';

import { motion } from 'framer-motion';

/**
 * Futbol topu yükleme/bekleme animasyonu.
 *
 * Bekleme ekranlarında (eşleşme aranıyor, rakip el seçimi bekleniyor) kullanıcı
 * sıkılmasın diye: zıplayarak ilerleyen bir top + altında hareket eden gölge.
 * Saf CSS/Framer Motion — performanslı, tema (futbol) ile uyumlu.
 */
export function BallLoader({
  label,
  sub,
  size = 56,
}: {
  /** Üstte gösterilecek ana metin (örn. "Rakip aranıyor"). */
  label?: string;
  /** Altta küçük açıklama. */
  sub?: string;
  size?: number;
}) {
  return (
    <div className="flex flex-col items-center gap-6">
      {/* Top + gölge sahnesi */}
      <div
        className="relative"
        style={{ width: size * 3, height: size * 1.8 }}
      >
        {/* Zıplayan top */}
        <motion.div
          className="absolute left-1/2 -translate-x-1/2"
          style={{ width: size, height: size, top: 0 }}
          animate={{
            y: [0, size * 0.9, 0],
            x: [-size, size, -size],
          }}
          transition={{
            y: { duration: 0.6, repeat: Infinity, ease: 'easeOut', repeatType: 'reverse' },
            x: { duration: 1.2, repeat: Infinity, ease: 'easeInOut' },
          }}
        >
          <SoccerBall size={size} />
        </motion.div>

        {/* Gölge — topun altında, zıplamayla küçülüp büyür */}
        <motion.div
          className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-[50%] bg-black/40 blur-md"
          style={{ width: size * 0.8, height: size * 0.2 }}
          animate={{
            scaleX: [1, 0.5, 1],
            opacity: [0.4, 0.15, 0.4],
            x: [-size, size, -size],
          }}
          transition={{
            scaleX: { duration: 0.6, repeat: Infinity, ease: 'easeOut', repeatType: 'reverse' },
            opacity: { duration: 0.6, repeat: Infinity, ease: 'easeOut', repeatType: 'reverse' },
            x: { duration: 1.2, repeat: Infinity, ease: 'easeInOut' },
          }}
        />
      </div>

      {(label || sub) && (
        <div className="text-center">
          {label && <p className="text-lg font-bold text-white">{label}</p>}
          {sub && <p className="mt-1 text-sm text-white/55">{sub}</p>}
        </div>
      )}
    </div>
  );
}

/**
 * Dönen gerçekçi futbol topu SVG'si — klasik Telstar (beyaz top + siyah
 * beşgenler). Merkez beşgen + çevresinde 5 beşgen, aralarda beyaz altıgenler;
 * hafif küresel gölge ile hacim hissi.
 */
function SoccerBall({ size }: { size: number }) {
  // Merkez beşgenin 5 köşesi (R=14, merkez 50,50, tepe yukarı).
  const cx = 50;
  const cy = 50;
  const R = 15;
  const centerPts = pentagon(cx, cy, R, -90);
  // Dış beşgenlerin merkezleri (merkez beşgenin kenar ortalarından dışa).
  const outerR = 34;
  const outer = [-90, -18, 54, 126, 198].map((a) =>
    pentagon(
      cx + outerR * Math.cos((a * Math.PI) / 180),
      cy + outerR * Math.sin((a * Math.PI) / 180),
      9,
      a + 180,
    ),
  );

  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      animate={{ rotate: 360 }}
      transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
      style={{ filter: 'drop-shadow(0 3px 8px rgba(0,0,0,0.45))' }}
    >
      <defs>
        {/* Küresel parlama — hacim hissi */}
        <radialGradient id="ballShade" cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="70%" stopColor="#eef1f4" />
          <stop offset="100%" stopColor="#c2c9d2" />
        </radialGradient>
      </defs>

      <circle cx={cx} cy={cy} r="48" fill="url(#ballShade)" stroke="#11161d" strokeWidth="2.5" />

      {/* Merkez siyah beşgen */}
      <polygon points={ptsStr(centerPts)} fill="#11161d" />
      {/* Merkezden dış beşgenlere bağlayan dikişler */}
      {centerPts.map((p, i) => (
        <line
          key={`s${i}`}
          x1={p[0]}
          y1={p[1]}
          x2={cx + outerR * Math.cos(((-90 + i * 72) * Math.PI) / 180)}
          y2={cy + outerR * Math.sin(((-90 + i * 72) * Math.PI) / 180)}
          stroke="#11161d"
          strokeWidth="1.6"
        />
      ))}
      {/* Dış 5 siyah beşgen */}
      {outer.map((pts, i) => (
        <polygon key={`o${i}`} points={ptsStr(pts)} fill="#11161d" />
      ))}
    </motion.svg>
  );
}

/** Merkez (cx,cy), yarıçap r, başlangıç açısı (derece) ile beşgen köşeleri. */
function pentagon(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
): Array<[number, number]> {
  return Array.from({ length: 5 }, (_, i) => {
    const a = ((startDeg + i * 72) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as [number, number];
  });
}

function ptsStr(pts: Array<[number, number]>): string {
  return pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
}
