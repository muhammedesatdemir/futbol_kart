'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { countryFlag } from '@/lib/playerDisplay';
import { clubNameTr } from '@/lib/trLocale';
import type { CareerClue } from '@/lib/careerMode';

interface CareerTimelineProps {
  clue: CareerClue;
}

/**
 * "Kariyer Yolu" kulüp çizelgesi — modun görsel kalbi.
 *
 *   tier 0 (5p): kulüpler DAĞINIK grid (çizgi yok, sıra ipucu vermez)
 *   tier 1 (3p): kulüpler DİKEY ÇİZGİ üzerinde kronolojik (üst=ilk, alt=son)
 *   tier 2 (2p): + her kulübün yıl aralığı
 *
 * Logo varsa logo, yoksa ülke bayrağı (+ 2-harf). Türkçe kulüp adı düzeltmesi.
 * Dağınık→çizgi geçişi framer `layout` ile akıcı.
 */
export function CareerTimeline({ clue }: CareerTimelineProps) {
  const { stops, ordered } = clue;

  if (!ordered) {
    // TIER 0 — dağınık grid (sırasız, çizgi yok). İri kartlar.
    return (
      <div
        className={cn(
          'mx-auto grid w-full max-w-3xl gap-4',
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
            className="glass-panel flex flex-col items-center gap-2.5 rounded-2xl border border-white/12 p-4 text-center"
          >
            <ClubLogo name={s.name} crestUrl={s.crestUrl} countryCode={s.countryCode} size="xl" />
            <span className="line-clamp-2 text-sm font-bold leading-tight text-white/90">{clubNameTr(s.name)}</span>
          </motion.div>
        ))}
      </div>
    );
  }

  // TIER 1+ — dikey kronolojik çizgi. İRİ satırlar.
  return (
    <div className="mx-auto w-full max-w-xl">
      {/* "İlk kulüp" etiketi (çizginin başı) */}
      <div className="mb-1 flex items-center gap-3 pl-1">
        <span className="flex h-6 items-center text-[10px] font-bold uppercase tracking-[0.18em] text-accent-goldHi/70">
          ▲ İlk kulüp
        </span>
      </div>

      <ol className="relative flex flex-col gap-3">
        {/* Dikey çizgi */}
        <span
          className="pointer-events-none absolute left-[27px] top-4 bottom-4 w-1 rounded-full bg-gradient-to-b from-accent-gold/70 via-accent-gold/30 to-accent-gold/70"
          aria-hidden
        />
        {stops.map((s, i) => (
          <motion.li
            key={s.clubId + ':' + i}
            layout
            initial={{ opacity: 0, x: -14 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.06, type: 'spring', stiffness: 260, damping: 22 }}
            className="relative flex items-center gap-4"
          >
            {/* Düğüm (logo/bayrak) — İRİ */}
            <div className="relative z-10 shrink-0">
              <ClubLogo name={s.name} crestUrl={s.crestUrl} countryCode={s.countryCode} size="lg" ring />
            </div>
            {/* Kulüp adı + yıl — İRİ kutu */}
            <div className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-2xl border border-white/12 bg-white/5 px-4 py-3.5">
              <span className="truncate text-base font-bold text-white/95">{clubNameTr(s.name)}</span>
              {s.fromYear != null && (
                <span className="shrink-0 rounded-lg bg-accent-gold/10 px-2.5 py-1 font-mono text-sm font-bold text-accent-goldHi">
                  {s.fromYear}
                  {s.toYear != null ? `–${String(s.toYear).slice(-2)}` : '–…'}
                </span>
              )}
            </div>
          </motion.li>
        ))}
      </ol>

      {/* "Son kulüp" etiketi (çizginin sonu) */}
      <div className="mt-1 flex items-center gap-3 pl-1">
        <span className="flex h-6 items-center text-[10px] font-bold uppercase tracking-[0.18em] text-accent-goldHi/70">
          ▼ Son kulüp
        </span>
      </div>
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
  size: 'lg' | 'xl';
  ring?: boolean;
}) {
  const dim = size === 'xl' ? 'h-16 w-16' : 'h-14 w-14';
  const flag = countryFlag(countryCode);
  if (crestUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={crestUrl}
        alt={name}
        loading="lazy"
        className={cn('object-contain', dim, ring && 'rounded-full bg-white/10 p-1.5 ring-1 ring-white/15')}
      />
    );
  }
  // Logo yok → bayrak (varsa, İRİ) + ad baş harfleri.
  return (
    <span
      className={cn(
        'flex flex-col items-center justify-center gap-0.5 rounded-full bg-white/10',
        dim,
        ring && 'ring-1 ring-white/15',
      )}
      title={name}
    >
      <span className={size === 'xl' ? 'text-2xl' : 'text-xl'}>{flag || '⚽'}</span>
    </span>
  );
}
