'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useSfx } from '@/lib/useSfx';
import type { TargetCriterion } from '@/lib/targetMode';

interface TargetRevealSceneProps {
  /** Çarkın duracağı hedef değer (route belirler — deterministik). */
  target: number;
  criterion: TargetCriterion;
  /** Çark durunca (veya "Başla") çağrılır → build fazına geçilir. */
  onDone: () => void;
}

/**
 * Oyunvari "hedef çarkı" — slot makinesi hissi. Rakam aralıkta hızla dönüp
 * yavaşlayarak HEDEFTE durur, altın flash + "HEDEF" başlığı + metrik adı.
 * Durunca otomatik (veya "Başla" butonuyla) build'e geçer.
 *
 * Erişilebilirlik: prefers-reduced-motion'da dönme yok — hedef doğrudan gösterilir.
 */
export function TargetRevealScene({ target, criterion, onDone }: TargetRevealSceneProps) {
  const reduced = useReducedMotion();
  const playSfx = useSfx();
  const [display, setDisplay] = useState<number>(target);
  const [settled, setSettled] = useState(reduced ?? false);
  const tickRef = useRef<NodeJS.Timeout | null>(null);

  // Maç başı hakem düdüğü — hedef çarkı sahnesi görünür görünmez (bir kez),
  // çark dönmeye başlamadan oyunun başladığını ilan eder.
  useEffect(() => {
    playSfx('whistleStart');
  }, [playSfx]);

  // Çark animasyonu: tik aralığı giderek artar (yavaşlama), son tik hedefe oturur.
  useEffect(() => {
    if (reduced) {
      setSettled(true);
      return;
    }
    const [min, max] = criterion.targetRange;
    const step = criterion.targetStep;
    const stops: number[] = [];
    for (let v = min; v <= max; v += step) stops.push(v);

    // Toplam ~28 tik, easing ile yavaşlayan aralık (45ms → ~340ms).
    const totalTicks = 28;
    let tick = 0;
    let acc = min;

    const schedule = () => {
      // Son tik: hedefte dur.
      const isLast = tick >= totalTicks;
      if (isLast) {
        setDisplay(target);
        setSettled(true);
        playSfx('win');
        return;
      }
      // Easing: tik ilerledikçe aralık uzar (1 - (1-t)^2 tipi).
      const t = tick / totalTicks;
      const interval = 45 + Math.round(t * t * 300);
      // Sıradaki durağa geç (çark dönüyor hissi).
      acc = stops[(stops.indexOf(acc) + 1) % stops.length] ?? min;
      setDisplay(acc);
      playSfx('flip');
      tick++;
      tickRef.current = setTimeout(schedule, interval);
    };
    tickRef.current = setTimeout(schedule, 60);
    return () => {
      if (tickRef.current) clearTimeout(tickRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, criterion, reduced]);

  // Çark durunca ~5 sn sonra otomatik devam — kullanıcı hedefi idrak etsin
  // (oyuncu "Başla" butonuyla anında da geçebilir).
  useEffect(() => {
    if (!settled) return;
    const t = setTimeout(onDone, 5000);
    return () => clearTimeout(t);
  }, [settled, onDone]);

  return (
    <section className="flex min-h-[60vh] flex-col items-center justify-center gap-8 py-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="text-center"
      >
        <span className="inline-block rounded-full border border-side-red/40 bg-side-red/15 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-side-red">
          🎯 Hedefe Yaklaş
        </span>
        <h1 className="mt-3 text-2xl font-black tracking-tight text-white/85 sm:text-3xl">
          {settled ? 'Hedefin belli!' : 'Hedef belirleniyor…'}
        </h1>
      </motion.div>

      {/* Çark gövdesi — büyük LED tarzı rakam paneli */}
      <motion.div
        animate={
          settled
            ? { scale: [1, 1.12, 1], boxShadow: '0 0 60px rgba(255,213,74,0.55)' }
            : {}
        }
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative flex flex-col items-center gap-2 rounded-3xl border-2 border-accent-gold/40 bg-gradient-to-b from-zinc-900 to-black px-10 py-8 shadow-2xl sm:px-16 sm:py-10"
      >
        {/* Üst/alt çark tarama çizgileri (slot makinesi penceresi hissi) */}
        <div className="pointer-events-none absolute inset-x-4 top-4 h-px bg-gradient-to-r from-transparent via-accent-gold/40 to-transparent" />
        <div className="pointer-events-none absolute inset-x-4 bottom-4 h-px bg-gradient-to-r from-transparent via-accent-gold/40 to-transparent" />

        <motion.div
          key={settled ? 'settled' : 'spin'}
          className="text-7xl font-black tabular-nums leading-none text-accent-goldHi drop-shadow-[0_0_30px_rgba(255,213,74,0.5)] sm:text-8xl"
          style={{ fontFamily: 'monospace' }}
          animate={settled ? {} : { y: [-3, 3, -3] }}
          transition={settled ? {} : { duration: 0.12, repeat: Infinity }}
        >
          {display}
        </motion.div>
        <span className="text-sm font-bold uppercase tracking-[0.25em] text-white/55 sm:text-base">
          {criterion.title}
        </span>
      </motion.div>

      <p className="max-w-sm text-center text-sm leading-relaxed text-white/55">
        {settled ? (
          <>
            <span className="font-semibold text-white/80">5 futbolcu</span> seç; seçtiklerinin{' '}
            <span className="font-semibold text-accent-goldHi">{criterion.title}</span> toplamı{' '}
            <span className="font-semibold text-white/80">{target}</span>'e en yakın olan kazanır.
            Üstüne çıkmak serbest — önemli olan yakınlık.
          </>
        ) : (
          <>
            <span className="font-semibold text-white/80">5 futbolcu</span> seç; seçtiklerinin{' '}
            <span className="font-semibold text-accent-goldHi">{criterion.title}</span> toplamı,
            çıkan hedefe en yakın olan kazanır. Üstüne çıkmak serbest — önemli olan yakınlık.
          </>
        )}
      </p>

      {settled && (
        <motion.button
          type="button"
          onClick={onDone}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="btn-primary animate-cta-pulse motion-reduce:animate-none shadow-glow-gold"
        >
          ⚽ Kadromu seçmeye başla
        </motion.button>
      )}
    </section>
  );
}
