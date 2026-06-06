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

/** Dönen futbol topu SVG'si (klasik beyaz-siyah desen). */
function SoccerBall({ size }: { size: number }) {
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      animate={{ rotate: 360 }}
      transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
      style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.4))' }}
    >
      <circle cx="50" cy="50" r="48" fill="#ffffff" stroke="#1f2937" strokeWidth="2" />
      {/* Merkez beşgen */}
      <polygon
        points="50,28 64,39 59,56 41,56 36,39"
        fill="#1f2937"
      />
      {/* Çevre desenleri (basitleştirilmiş) */}
      <path d="M50,28 L50,8" stroke="#1f2937" strokeWidth="3" />
      <path d="M64,39 L82,32" stroke="#1f2937" strokeWidth="3" />
      <path d="M59,56 L72,70" stroke="#1f2937" strokeWidth="3" />
      <path d="M41,56 L28,70" stroke="#1f2937" strokeWidth="3" />
      <path d="M36,39 L18,32" stroke="#1f2937" strokeWidth="3" />
    </motion.svg>
  );
}
