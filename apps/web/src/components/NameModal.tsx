'use client';

import { forwardRef, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { GameMode } from '@futbol-kart/shared-types';
import { PlayIcon } from '@/components/icons';
import { cn } from '@/lib/cn';

interface NameModalProps {
  open: boolean;
  mode: GameMode;
  initialP1?: string;
  initialP2?: string;
  onSubmit: (p1: string, p2: string) => void;
}

const MAX_LEN = 20;

export function NameModal({
  open,
  mode,
  initialP1 = '',
  initialP2 = '',
  onSubmit,
}: NameModalProps) {
  const [p1, setP1] = useState(initialP1);
  const [p2, setP2] = useState(initialP2);
  const p1Ref = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setP1(initialP1);
      setP2(initialP2);
      // Modal açılınca P1 input'una odak
      const t = setTimeout(() => p1Ref.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [open, initialP1, initialP2]);

  const isHotseat = mode === 'hotseat';
  const p1Trimmed = p1.trim();
  const p2Trimmed = p2.trim();
  const canSubmit = isHotseat
    ? p1Trimmed.length > 0 && p2Trimmed.length > 0
    : p1Trimmed.length > 0;

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!canSubmit) return;
    onSubmit(p1Trimmed, isHotseat ? p2Trimmed : 'Bot');
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="name-modal-title"
        >
          <motion.form
            initial={{ scale: 0.95, y: 8, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.97, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            onSubmit={handleSubmit}
            className="glass-panel-strong w-full max-w-md p-6 sm:p-7"
          >
            <h2
              id="name-modal-title"
              className="text-xl font-black tracking-tight sm:text-2xl"
            >
              {isHotseat ? 'Oyuncular kim?' : 'Sana nasıl hitap edelim?'}
            </h2>
            <p className="mt-1 text-sm text-white/65">
              {isHotseat
                ? 'İki oyuncu da adını yazsın; skor tablosunda böyle görünecek.'
                : 'Adın skor tablosunda ve maç özetinde görünecek.'}
            </p>

            <div className="mt-5 space-y-3">
              <NameField
                ref={p1Ref}
                label="Oyuncu 1"
                value={p1}
                onChange={setP1}
                side="red"
                placeholder="Örn. Mehmet"
              />
              {isHotseat && (
                <NameField
                  label="Oyuncu 2"
                  value={p2}
                  onChange={setP2}
                  side="blue"
                  placeholder="Örn. Ayşe"
                />
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="submit"
                disabled={!canSubmit}
                className="btn-primary disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-glow-gold"
              >
                <PlayIcon size={14} />
                Devam
              </button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface NameFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  side: 'red' | 'blue';
  placeholder?: string;
}

const NameField = forwardRef<HTMLInputElement, NameFieldProps>(function NameField(
  { label, value, onChange, side, placeholder },
  ref,
) {
  const dot = side === 'red' ? 'bg-side-red' : 'bg-side-blue';
  return (
    <label className="block">
      <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
        <span className={cn('h-2 w-2 rounded-full', dot)} />
        {label}
      </span>
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, MAX_LEN))}
        placeholder={placeholder}
        maxLength={MAX_LEN}
        autoComplete="off"
        spellCheck={false}
        className={cn(
          'mt-1 w-full rounded-xl border border-white/10 bg-black/30',
          'px-4 py-2.5 text-base font-medium text-white',
          'placeholder:text-white/30',
          'outline-none transition focus:border-accent-gold/60 focus:bg-black/50',
        )}
      />
    </label>
  );
});
