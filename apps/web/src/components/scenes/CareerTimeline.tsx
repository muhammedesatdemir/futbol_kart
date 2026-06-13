'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { countryFlag } from '@/lib/playerDisplay';
import type { CareerClue } from '@/lib/careerMode';

interface CareerTimelineProps {
  clue: CareerClue;
  /** Reveal'da tam çizelge (tüm yıllar açık) gösterimi için override. */
  compact?: boolean;
}

/**
 * "Kariyer Yolu" kulüp çizelgesi — modun görsel kalbi.
 *
 *   tier 0 (5p): kulüpler DAĞINIK grid (çizgi yok, sıra ipucu vermez)
 *   tier 1 (3p): kulüpler DİKEY ÇİZGİ üzerinde kronolojik (üstten alta)
 *   tier 2 (2p): + her kulübün yıl aralığı
 *   tier 3 (1p): (milliyet/harf üst panelde — burası yıl + çizgi)
 *
 * Logo varsa logo, yoksa ülke bayrağı + ad. Dağınık→çizgi geçişi framer `layout`
 * ile akıcı (kulüpler yerlerine "kayar").
 */
export function CareerTimeline({ clue, compact = false }: CareerTimelineProps) {
  const { stops, ordered } = clue;

  if (!ordered) {
    // TIER 0 — dağınık grid (sırasız, çizgi yok).
    return (
      <div
        className={cn(
          'mx-auto grid w-full max-w-2xl gap-3',
          stops.length <= 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3',
        )}
      >
        {stops.map((s, i) => (
          <motion.div
            key={s.clubId + ':' + i}
            layout
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.05, type: 'spring', stiffness: 240, damping: 20 }}
            className="glass-panel flex flex-col items-center gap-2 rounded-2xl border border-white/12 p-3 text-center"
          >
            <ClubLogo name={s.name} crestUrl={s.crestUrl} countryCode={s.countryCode} size="lg" />
            <span className="line-clamp-2 text-xs font-bold leading-tight text-white/90">{s.name}</span>
          </motion.div>
        ))}
      </div>
    );
  }

  // TIER 1+ — dikey kronolojik çizgi.
  return (
    <div className="mx-auto w-full max-w-md">
      <ol className="relative flex flex-col gap-2.5">
        {/* Dikey çizgi */}
        <span
          className="pointer-events-none absolute left-[22px] top-3 bottom-3 w-0.5 bg-gradient-to-b from-accent-gold/60 via-white/20 to-accent-gold/60"
          aria-hidden
        />
        {stops.map((s, i) => (
          <motion.li
            key={s.clubId + ':' + i}
            layout
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.06, type: 'spring', stiffness: 260, damping: 22 }}
            className="relative flex items-center gap-3"
          >
            {/* Düğüm (logo/bayrak) */}
            <div className="relative z-10 shrink-0">
              <ClubLogo name={s.name} crestUrl={s.crestUrl} countryCode={s.countryCode} size={compact ? 'sm' : 'md'} ring />
            </div>
            {/* Kulüp adı + yıl */}
            <div className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <span className="truncate text-sm font-semibold text-white/90">{s.name}</span>
              {s.fromYear != null && (
                <span className="shrink-0 font-mono text-xs font-bold text-accent-goldHi">
                  {s.fromYear}
                  {s.toYear != null ? `–${String(s.toYear).slice(-2)}` : '–…'}
                </span>
              )}
            </div>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}

function ClubLogo({
  name,
  crestUrl,
  countryCode,
  size,
  ring = false,
}: {
  name: string;
  crestUrl?: string;
  countryCode?: string;
  size: 'sm' | 'md' | 'lg';
  ring?: boolean;
}) {
  const dim = size === 'lg' ? 'h-12 w-12' : size === 'md' ? 'h-10 w-10' : 'h-8 w-8';
  const flag = countryFlag(countryCode);
  if (crestUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={crestUrl}
        alt={name}
        loading="lazy"
        className={cn('object-contain', dim, ring && 'rounded-full bg-white/10 p-1 ring-1 ring-white/15')}
      />
    );
  }
  // Logo yok → bayrak (varsa) + kupa fallback.
  return (
    <span
      className={cn(
        'flex items-center justify-center rounded-full bg-white/10 text-lg',
        dim,
        ring && 'ring-1 ring-white/15',
      )}
      title={name}
    >
      {flag || '⚽'}
    </span>
  );
}
