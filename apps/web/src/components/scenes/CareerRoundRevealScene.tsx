'use client';

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import type { Player } from '@futbol-kart/shared-types';
import { PlayerCard } from '@/components/PlayerCard';
import { cn } from '@/lib/cn';
import { countryFlag } from '@/lib/playerDisplay';
import { nationalityTr, clubNameTr } from '@/lib/trLocale';
import { useSfx } from '@/lib/useSfx';
import type { CareerSide } from '@/lib/careerMode';
import type { CareerReveal } from '@/lib/server/careerMatchEngine';

const SIDE = {
  P1: { text: 'text-side-red', border: 'border-side-red/60' },
  P2: { text: 'text-side-blue', border: 'border-side-blue/60' },
} as const;

interface CareerRoundRevealSceneProps {
  reveal: CareerReveal;
  roundNo: number;
  totalRounds: number;
  p1Name?: string;
  p2Name?: string;
  p1Score: number;
  p2Score: number;
  playersById: Map<string, Player>;
  /** Doğru oyuncunun id'si (kart için) — reveal verisinde yok, sayfadan gelir. */
  answerId?: string | null;
  autoMs?: number;
  onDone: () => void;
}

/**
 * "Kariyer Yolu" TUR SONUCU — doğru cevap (kart + tam kariyer çizelgesi) açılır;
 * iki tarafın hangi kademede bildiği + puanı gösterilir. "Ben 2. ipucuda bildim
 * (+3), rakip bilemedi" anı.
 */
export function CareerRoundRevealScene({
  reveal,
  roundNo,
  totalRounds,
  p1Name = 'Sen',
  p2Name = 'Rakip',
  p1Score,
  p2Score,
  playersById,
  answerId = null,
  autoMs,
  onDone,
}: CareerRoundRevealSceneProps) {
  const playSfx = useSfx();
  const answerPlayer = answerId ? playersById.get(answerId) : null;

  useEffect(() => {
    const t = setTimeout(() => playSfx(reveal.p1.correct || reveal.p2.correct ? 'win' : 'heartbreak'), 250);
    return () => clearTimeout(t);
  }, [reveal.p1.correct, reveal.p2.correct, playSfx]);

  useEffect(() => {
    if (!autoMs) return;
    const t = setTimeout(onDone, autoMs);
    return () => clearTimeout(t);
  }, [autoMs, onDone]);

  return (
    <section className="flex flex-col items-center gap-5 py-4 text-center">
      <span className="inline-flex items-center gap-2 rounded-full border border-accent-gold/30 bg-accent-gold/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-accent-goldHi">
        Tur {roundNo}/{totalRounds} sonucu
      </span>

      {/* Doğru cevap */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 240, damping: 20 }}
        className="flex flex-col items-center gap-2"
      >
        <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-white/50">Doğru cevap</span>
        {answerPlayer ? (
          <PlayerCard player={answerPlayer} className="w-36" />
        ) : (
          <h2 className="text-2xl font-black text-accent-goldHi">{reveal.answerName}</h2>
        )}
        <h2 className="text-xl font-black">{reveal.answerName}</h2>
        {reveal.nationality && (
          <span className="text-xs font-semibold text-white/60">🌍 {nationalityTr(reveal.nationality)}</span>
        )}
      </motion.div>

      {/* Tam kariyer çizelgesi (yatay özet) */}
      <div className="flex max-w-2xl flex-wrap items-center justify-center gap-1.5">
        {reveal.stops.map((s, i) => (
          <span key={s.clubId + ':' + i} className="inline-flex items-center gap-1">
            <span className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-semibold text-white/80">
              {countryFlag(s.countryCode) || ''} {clubNameTr(s.name)}
              <span className="font-mono text-[9px] text-accent-goldHi/80">{s.fromYear}</span>
            </span>
            {i < reveal.stops.length - 1 && <span className="text-white/30">→</span>}
          </span>
        ))}
      </div>

      {/* İki tarafın sonucu */}
      <div className="grid w-full max-w-md grid-cols-2 gap-3">
        <ResultBox name={p1Name} side="P1" res={reveal.p1} />
        <ResultBox name={p2Name} side="P2" res={reveal.p2} />
      </div>

      {/* Güncel skor */}
      <div className="flex items-center gap-3 text-sm font-bold">
        <span className={SIDE.P1.text}>{p1Name} · {p1Score}</span>
        <span className="text-white/40">—</span>
        <span className={SIDE.P2.text}>{p2Score} · {p2Name}</span>
      </div>

      {autoMs ? (
        <p className="text-xs text-white/45">
          {roundNo >= totalRounds ? 'Sonuçlara geçiliyor…' : 'Sonraki tur birazdan…'}
        </p>
      ) : (
        <motion.button
          type="button"
          onClick={onDone}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="btn-primary px-8 py-3 text-base"
        >
          {roundNo >= totalRounds ? 'Sonucu gör →' : 'Sonraki tur →'}
        </motion.button>
      )}
    </section>
  );
}

function ResultBox({
  name,
  side,
  res,
}: {
  name: string;
  side: CareerSide;
  res: { tier: number; correct: boolean; points: number };
}) {
  return (
    <div className={cn('glass-panel flex flex-col items-center gap-1 rounded-2xl border p-3', res.correct ? SIDE[side].border : 'border-white/12')}>
      <span className={cn('text-xs font-black', SIDE[side].text)}>{name}</span>
      {res.correct ? (
        <>
          <span className="rounded-full bg-accent-gold/20 px-3 py-0.5 text-sm font-black text-accent-goldHi ring-1 ring-accent-goldHi/40">
            +{res.points}
          </span>
          <span className="text-[10px] text-white/55">{res.tier + 1}. ipucuda bildi</span>
        </>
      ) : (
        <>
          <span className="rounded-full bg-white/5 px-3 py-0.5 text-sm font-bold text-white/40">+0</span>
          <span className="text-[10px] text-white/45">bilemedi</span>
        </>
      )}
    </div>
  );
}
