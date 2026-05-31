'use client';

import { AnimatePresence, motion } from 'framer-motion';
import type { Player } from '@futbol-kart/shared-types';
import { cn } from '@/lib/cn';
import { countryFlag, positionTheme } from '@/lib/playerDisplay';

interface SelectedCardsRailProps {
  selected: Player[];
  total: number;
  onRemove: (id: string) => void;
  onClear: () => void;
  ctaLabel: string;
  onConfirm: () => void;
  heading: string;
  subtitle?: string;
}

export function SelectedCardsRail({
  selected,
  total,
  onRemove,
  onClear,
  ctaLabel,
  onConfirm,
  heading,
  subtitle,
}: SelectedCardsRailProps) {
  const complete = selected.length === total;
  const progressPct = (selected.length / total) * 100;

  return (
    <div
      className={cn(
        'sticky top-0 z-30 -mx-3 px-3 py-3 sm:-mx-4 sm:px-4',
        'border-b border-white/8 bg-zinc-950/85 backdrop-blur-xl',
        'shadow-[0_4px_24px_-12px_rgba(0,0,0,0.6)]',
      )}
    >
      <div className="flex flex-col gap-2.5">
        {/* Başlık + ilerleme + CTA */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-base font-black tracking-tight sm:text-lg">
              {heading}
            </h1>
            {subtitle && (
              <p className="truncate text-xs text-white/55">{subtitle}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'rounded-full px-2.5 py-1 text-xs font-bold tabular-nums',
                complete
                  ? 'bg-accent-gold/20 text-accent-goldHi ring-1 ring-accent-gold/40'
                  : 'bg-white/5 text-white/65',
              )}
            >
              {selected.length}/{total}
            </span>
            {selected.length > 0 && (
              <button
                type="button"
                onClick={onClear}
                className="rounded-full px-2.5 py-1 text-xs font-semibold text-white/55 hover:bg-white/10 hover:text-white transition"
              >
                Temizle
              </button>
            )}
            <motion.button
              type="button"
              onClick={onConfirm}
              disabled={!complete}
              animate={complete ? { scale: [1, 1.04, 1] } : { scale: 1 }}
              transition={complete ? { repeat: Infinity, duration: 1.4, ease: 'easeInOut' } : { duration: 0.2 }}
              className={cn(
                'rounded-full px-4 py-1.5 text-xs font-black uppercase tracking-wider',
                complete
                  ? 'bg-gradient-to-b from-accent-goldHi to-accent-gold text-zinc-900 shadow-[0_0_18px_rgba(240,193,75,0.5)]'
                  : 'bg-white/8 text-white/35 cursor-not-allowed',
              )}
            >
              {ctaLabel}
            </motion.button>
          </div>
        </div>

        {/* İlerleme barı (subtle) */}
        <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/5">
          <motion.div
            className={cn(
              'absolute inset-y-0 left-0 rounded-full',
              complete
                ? 'bg-gradient-to-r from-accent-gold to-accent-goldHi'
                : 'bg-gradient-to-r from-white/30 to-white/50',
            )}
            initial={false}
            animate={{ width: `${progressPct}%` }}
            transition={{ type: 'spring', stiffness: 280, damping: 28 }}
          />
        </div>

        {/* Seçilen chip listesi — yatay scroll mobilde */}
        <div className="-mx-1 overflow-x-auto px-1">
          <div className="flex items-center gap-1.5 py-0.5">
            <AnimatePresence mode="popLayout">
              {selected.length === 0 ? (
                <motion.span
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="px-1 text-xs italic text-white/35"
                >
                  Henüz oyuncu seçmedin
                </motion.span>
              ) : (
                selected.map((p) => {
                  const theme = positionTheme(p.position);
                  const flag = countryFlag(p.nationalityCode);
                  return (
                    <motion.button
                      layout
                      key={p.id}
                      type="button"
                      onClick={() => onRemove(p.id)}
                      initial={{ opacity: 0, scale: 0.8, y: -8 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.7, y: -6 }}
                      transition={{ type: 'spring', stiffness: 320, damping: 24 }}
                      whileHover={{ y: -2 }}
                      className={cn(
                        'group/chip inline-flex shrink-0 items-center gap-1.5 rounded-full',
                        'border bg-black/40 px-2.5 py-1 text-xs font-bold backdrop-blur',
                        'transition hover:bg-black/60',
                      )}
                      style={{
                        borderColor: `${theme.hexLight}55`,
                        boxShadow: `0 0 0 1px ${theme.hexLight}15, 0 2px 8px -2px ${theme.hexDark}30`,
                      }}
                      aria-label={`${p.displayName} seçimini kaldır`}
                    >
                      <span className="text-[11px]" aria-hidden>{flag}</span>
                      <span className="max-w-[12ch] truncate text-white">{p.displayName}</span>
                      <span
                        className="text-[9px] font-extrabold uppercase tracking-wider"
                        style={{ color: theme.hexLight }}
                      >
                        {p.position}
                      </span>
                      <span className="text-white/40 group-hover/chip:text-white transition">✕</span>
                    </motion.button>
                  );
                })
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
