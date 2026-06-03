'use client';

import { motion } from 'framer-motion';
import type { Player } from '@futbol-kart/shared-types';
import { PlayerCard } from '@/components/PlayerCard';
import { cn } from '@/lib/cn';

interface TargetXrayOverlayProps {
  player: Player;
  /** Röntgenlenen oyuncunun metrik değeri. */
  value: number;
  unit: string;
  /** Kadroya kat → kartı seç. */
  onAccept: () => void;
  /** Vazgeç → katmadan kapat (hak yine de yandı). */
  onDismiss: () => void;
}

/**
 * Röntgen jokeri overlay'i — havuzdan bir kartın gizli değerini açar. Kadro Kur
 * "Öneri Jokeri" (SuggestionOverlay) UX'inin kardeşi: karartma + spring giriş +
 * altın aura + büyük kart + büyük değer rozeti + "Vazgeç" / "Kadroya kat".
 * Her iki durumda da joker harcanmıştır (route hakkı düşürür).
 */
export function TargetXrayOverlay({
  player,
  value,
  unit,
  onAccept,
  onDismiss,
}: TargetXrayOverlayProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onDismiss}
    >
      <motion.div
        initial={{ scale: 0.8, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.85, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 240, damping: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="glass-panel-strong relative flex max-w-sm flex-col items-center gap-3 rounded-2xl p-6 text-center"
      >
        {/* Altın aura pulse */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-2xl"
          style={{ boxShadow: '0 0 60px rgba(255,215,107,0.4)' }}
          animate={{ opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
        <div className="inline-flex items-center gap-1.5 rounded-full bg-accent-gold/20 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-accent-goldHi ring-1 ring-accent-gold/40">
          🔍 Röntgen
        </div>
        <motion.div
          initial={{ rotateY: 90 }}
          animate={{ rotateY: 0 }}
          transition={{ delay: 0.15, duration: 0.5 }}
          className="w-32"
        >
          <PlayerCard player={player} size="reveal" className="w-full" />
        </motion.div>
        <div className="text-lg font-black">{player.displayName}</div>
        <div className="rounded-lg bg-black/40 px-4 py-2 text-3xl font-black tabular-nums text-accent-goldHi">
          {value}
          <span className="ml-1 text-sm font-semibold text-white/60">{unit}</span>
        </div>
        <div className="mt-1 flex items-center gap-3">
          <button type="button" onClick={onDismiss} className="btn-ghost">
            Vazgeç
          </button>
          <button type="button" onClick={onAccept} className="btn-primary">
            ✓ Kadroya kat
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/**
 * Röntgen joker butonu — build + draft sahnelerinde paylaşılır (Kadro Kur
 * JokerButton stilinde). Hak varken parlama + "1" rozeti; armed iken "İptal".
 * Kullanıldıysa soluk + tıklanamaz.
 */
export function XrayJokerButton({
  available,
  armed,
  onClick,
}: {
  /** Bu tarafın röntgen hakkı kaldı mı? */
  available: boolean;
  /** Joker basıldı, kart bekleniyor mu? (basınca iptal etmeye yarar) */
  armed: boolean;
  onClick: () => void;
}) {
  const usable = available || armed;
  return (
    <motion.button
      type="button"
      disabled={!usable}
      onClick={onClick}
      whileHover={usable ? { scale: 1.04 } : undefined}
      whileTap={usable ? { scale: 0.97 } : undefined}
      animate={
        available && !armed
          ? {
              boxShadow: [
                '0 0 0 rgba(255,215,107,0)',
                '0 0 18px rgba(255,215,107,0.55)',
                '0 0 0 rgba(255,215,107,0)',
              ],
            }
          : { boxShadow: '0 0 0 rgba(255,215,107,0)' }
      }
      transition={{
        duration: 1.8,
        repeat: available && !armed ? Infinity : 0,
        ease: 'easeInOut',
      }}
      className={cn(
        'relative inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold transition motion-reduce:!shadow-none',
        armed
          ? 'border-side-blue/60 bg-side-blue/20 text-side-blue'
          : available
            ? 'border-accent-gold/60 bg-accent-gold/15 text-accent-goldHi hover:bg-accent-gold/25'
            : 'cursor-not-allowed border-white/10 bg-white/5 text-white/35',
      )}
    >
      {available && !armed && (
        <motion.span
          className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent-goldHi text-[10px] font-black text-black"
          animate={{ scale: [1, 1.15, 1] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        >
          1
        </motion.span>
      )}
      🔍{' '}
      {armed
        ? 'Bir karta dokun (iptal)'
        : available
          ? 'Röntgen Jokeri'
          : 'Röntgen kullanıldı'}
    </motion.button>
  );
}
