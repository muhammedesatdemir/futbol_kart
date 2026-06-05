'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import type { GameMode, Player, PlayerSide } from '@futbol-kart/shared-types';
import { HomeIcon, PlayIcon, TrophyIcon } from '@/components/icons';
import { ShareMatchButton } from '@/components/ShareMatchButton';
import { CountUp } from '@/components/CountUp';
import { Confetti } from '@/components/Confetti';
import type { RoundLog, SessionState } from '@futbol-kart/game-engine';
import { templateById } from '@futbol-kart/question-templates';
import { cn } from '@/lib/cn';

interface FinalSceneProps {
  p1Score: number;
  p2Score: number;
  p1Name: string;
  p2Name: string;
  botMode: boolean;
  history: RoundLog[];
  players: Player[];
  onRematch: () => void;
  mode: GameMode;
  snapshot: SessionState;
}

/**
 * Zafer ekranı.
 * Tasarım prensibi: "Bir rapor değil, bir kutlama".
 *
 * - Kazanan altın aksent, kaybeden desature slate
 * - Skor barı sade ve dramatik: KAZANAN | skor | KAYBEDEN
 * - Glass paneller hafif transparan (arka plan kupa görseli görünsün)
 * - Tur özeti varsayılan: gizli. "Detayları göster" ile açılır.
 * - Tek viewport hedefi: ~900px yüksekliğe sığar.
 */
export function FinalScene({
  p1Score,
  p2Score,
  p1Name,
  p2Name,
  history,
  players,
  onRematch,
  mode,
  snapshot,
}: FinalSceneProps) {
  const t = useTranslations('final');
  const [detailsOpen, setDetailsOpen] = useState(false);

  const winnerSide: PlayerSide | 'tie' =
    p1Score > p2Score ? 'P1' : p2Score > p1Score ? 'P2' : 'tie';

  const winnerName =
    winnerSide === 'tie'
      ? t('tieLabel')
      : winnerSide === 'P1'
        ? p1Name
        : p2Name;
  const winnerScore =
    winnerSide === 'P1' ? p1Score : winnerSide === 'P2' ? p2Score : 0;
  const loserScore =
    winnerSide === 'P1' ? p2Score : winnerSide === 'P2' ? p1Score : 0;

  const stats = useMemo(
    () => computeStats(history, winnerSide),
    [history, winnerSide],
  );

  return (
    <section className="flex flex-col items-center gap-6">
      {/* Maç sonu konfeti — kazanan tarafın renginde. Beraberlikte patlamaz. */}
      <Confetti side={winnerSide} fireKey={`${winnerSide}-${winnerScore}-${loserScore}`} />

      {/* === Kupa + ŞAMPİYON başlığı === */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col items-center text-center"
      >
        {winnerSide === 'tie' ? (
          <motion.div
            initial={{ scale: 0.55, opacity: 0, rotate: -8 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ delay: 0.15, type: 'spring', stiffness: 200, damping: 14 }}
            className="mb-3 flex h-20 w-20 items-center justify-center rounded-2xl bg-white/10 text-white/70 ring-1 ring-white/20 sm:h-24 sm:w-24"
          >
            <TrophyIcon size={44} />
          </motion.div>
        ) : (
          // Kupa kaldırma: alttan yükselir, sonra havada hafifçe sallanır (sway).
          <motion.div
            initial={{ y: 48, scale: 0.7, opacity: 0 }}
            animate={{
              y: [48, 0, 0],
              scale: [0.7, 1, 1],
              opacity: [0, 1, 1],
              rotate: [0, -2.5, 2.5, -2.5, 2.5, 0],
            }}
            transition={{
              y: { duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] },
              scale: { duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] },
              opacity: { duration: 0.7, delay: 0.15 },
              rotate: {
                duration: 4,
                delay: 0.85,
                ease: 'easeInOut',
                repeat: Infinity,
              },
            }}
            className="mb-3 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-b from-accent-goldHi/40 to-accent-gold/15 text-accent-goldHi ring-1 ring-accent-gold/50 shadow-glow-gold sm:h-24 sm:w-24"
          >
            <TrophyIcon size={44} />
          </motion.div>
        )}

        <div className="text-[11px] font-semibold uppercase tracking-[0.32em] text-accent-goldHi/90">
          {winnerSide === 'tie' ? 'BERABERE' : 'ŞAMPİYON'}
        </div>

        <h1
          className={cn(
            'mt-2 text-balance text-5xl font-black leading-[0.95] tracking-tight sm:text-6xl lg:text-7xl',
            winnerSide === 'tie'
              ? 'text-white'
              : [
                  'champion-shimmer bg-clip-text text-transparent motion-reduce:animate-none',
                  // Çift drop-shadow: altın halo + alt siyah okunaklık gölgesi
                  'drop-shadow-[0_0_40px_rgba(255,213,74,0.55)]',
                  '[filter:drop-shadow(0_0_40px_rgba(255,213,74,0.55))_drop-shadow(0_0_20px_rgba(255,213,74,0.35))_drop-shadow(0_4px_18px_rgba(0,0,0,0.55))]',
                ],
          )}
          style={
            winnerSide === 'tie'
              ? undefined
              : {
                  // Yatay gradient + parlak şerit — shimmer'ın geçeceği bant.
                  backgroundImage:
                    'linear-gradient(100deg, #f0c14b 0%, #ffe8a8 35%, #ffffff 50%, #ffe8a8 65%, #f0c14b 100%)',
                }
          }
        >
          {winnerName}
        </h1>

        {winnerSide !== 'tie' && (
          <p className="mt-2 text-sm text-white/65 sm:text-base">
            <span className="font-bold text-accent-goldHi">
              {winnerScore}–{loserScore}
            </span>{' '}
            galip geldi
          </p>
        )}
      </motion.div>

      {/* === Skor barı === */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.4 }}
        className="w-full"
      >
        <ScoreBar
          p1Name={p1Name}
          p2Name={p2Name}
          p1Score={p1Score}
          p2Score={p2Score}
          winnerSide={winnerSide}
        />
      </motion.div>

      {/* === İstatistik kartları === */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.35 }}
        className="grid w-full gap-2 sm:grid-cols-3 sm:gap-3"
      >
        <StatCard label="Toplam tur" value={`${stats.totalRounds}`} />
        <StatCard label="Beraberlik" value={`${stats.ties}`} />
        <StatCard label="En sık kategori" value={stats.topCategoryLabel} />
      </motion.div>

      {/* === Aksiyonlar === */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.4 }}
        className="flex flex-col items-center gap-3"
      >
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button type="button" onClick={onRematch} className="btn-primary">
            <PlayIcon size={14} />
            {t('rematch')}
          </button>
          <Link href="/" className="btn-ghost">
            <HomeIcon size={14} />
            {t('home')}
          </Link>
        </div>

        <ShareMatchButton
          mode={mode}
          p1Name={p1Name}
          p2Name={p2Name}
          p1Score={p1Score}
          p2Score={p2Score}
          winnerSide={winnerSide}
          totalRounds={snapshot.totalRounds}
          snapshot={snapshot}
        />

        <button
          type="button"
          onClick={() => setDetailsOpen((v) => !v)}
          className={cn(
            'mt-1 inline-flex items-center gap-2 rounded-full px-4 py-1.5',
            'border border-white/15 bg-black/30 backdrop-blur-sm',
            'text-[11px] font-bold uppercase tracking-[0.2em] text-white/80',
            'transition hover:border-accent-gold/40 hover:bg-black/50 hover:text-accent-goldHi',
          )}
          aria-expanded={detailsOpen}
        >
          <motion.svg
            width="10"
            height="6"
            viewBox="0 0 10 6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            animate={{ rotate: detailsOpen ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            aria-hidden
          >
            <polyline points="1,1 5,5 9,1" />
          </motion.svg>
          {detailsOpen ? 'Tur detaylarını gizle' : 'Tur detaylarını göster'}
        </button>
      </motion.div>

      {/* === Collapsible tur özeti === */}
      <AnimatePresence initial={false}>
        {detailsOpen && (
          <motion.div
            key="round-details"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="w-full overflow-hidden"
          >
            <div
              className="rounded-2xl border border-white/10 p-4 sm:p-5"
              style={{ background: 'rgba(8,10,10,0.32)' }}
            >
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-accent-goldHi/80">
                Tur özeti
              </div>
              <ol className="space-y-1">
                {history.map((h, i) => (
                  <RoundRow
                    key={i}
                    index={i}
                    log={h}
                    p1Name={p1Name}
                    p2Name={p2Name}
                    players={players}
                    winnerSide={winnerSide}
                  />
                ))}
              </ol>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/**
 * Skor barı — data-driven oran + count-up reveal.
 *
 * Oran hesabı: gerçek puan oranı non-linear bir eğri ile abartılır.
 *   5-4 raw 55/45 → adjusted ~65/35 (göze çarpar)
 *   5-2 raw 71/29 → adjusted ~80/20
 *   7-0 raw 100/0 → adjusted 90/10 (kaybeden taraf min %10 görünür)
 *
 * Bu, "kazanan baskın" hissini güçlendirir — düz orantı (5/9=55%)
 * görsel olarak hâlâ 50/50 gibi algılanıyor çünkü iki tarafta da
 * isim + sayı içeriği var.
 */
function ScoreBar({
  p1Name,
  p2Name,
  p1Score,
  p2Score,
  winnerSide,
}: {
  p1Name: string;
  p2Name: string;
  p1Score: number;
  p2Score: number;
  winnerSide: PlayerSide | 'tie';
}) {
  const isP1Winner = winnerSide === 'P1';
  const isP2Winner = winnerSide === 'P2';
  const isTie = winnerSide === 'tie';

  // Non-linear baskınlık abartması: kazanan tarafa bonus.
  // Tie ise 50/50.
  let p1Pct = 50;
  let p2Pct = 50;
  if (!isTie) {
    const total = p1Score + p2Score;
    if (total > 0) {
      // raw oran (kazanan tarafın payı)
      const winnerRaw = Math.max(p1Score, p2Score) / total;
      // power < 1 ile abartma: 0.55 → 0.66, 0.71 → 0.80, 1.0 → 1.0
      const winnerAdjusted = Math.pow(winnerRaw, 0.55);
      // %10..%90 aralığına clip
      const winnerPct = Math.max(60, Math.min(90, winnerAdjusted * 100));
      if (isP1Winner) {
        p1Pct = winnerPct;
        p2Pct = 100 - winnerPct;
      } else {
        p2Pct = winnerPct;
        p1Pct = 100 - winnerPct;
      }
    }
  }

  return (
    <div
      className="relative flex items-stretch overflow-hidden rounded-2xl border border-white/10"
      style={{ background: 'rgba(6,8,8,0.32)' }}
    >
      <SidePanel
        name={p1Name}
        score={p1Score}
        align="left"
        isWinner={isP1Winner}
        isTie={isTie}
        widthPct={p1Pct}
      />
      <SidePanel
        name={p2Name}
        score={p2Score}
        align="right"
        isWinner={isP2Winner}
        isTie={isTie}
        widthPct={p2Pct}
      />
    </div>
  );
}

function SidePanel({
  name,
  score,
  align,
  isWinner,
  isTie,
  widthPct,
}: {
  name: string;
  score: number;
  align: 'left' | 'right';
  isWinner: boolean;
  isTie: boolean;
  widthPct: number;
}) {
  // Kazanan: altın dolgu (gradient), parlak text.
  // Kaybeden: slate dolgu, mat text.
  // Beraberlik: nötr beyaz.
  const fillBg = isWinner
    ? align === 'left'
      ? 'linear-gradient(90deg, rgba(240,193,75,0.32) 0%, rgba(240,193,75,0.10) 70%, transparent 100%)'
      : 'linear-gradient(270deg, rgba(240,193,75,0.32) 0%, rgba(240,193,75,0.10) 70%, transparent 100%)'
    : isTie
      ? align === 'left'
        ? 'linear-gradient(90deg, rgba(255,255,255,0.10) 0%, transparent 100%)'
        : 'linear-gradient(270deg, rgba(255,255,255,0.10) 0%, transparent 100%)'
      : align === 'left'
        ? 'linear-gradient(90deg, rgba(100,116,139,0.20) 0%, rgba(100,116,139,0.05) 100%)'
        : 'linear-gradient(270deg, rgba(100,116,139,0.20) 0%, rgba(100,116,139,0.05) 100%)';

  return (
    <motion.div
      initial={{ flexBasis: '50%' }}
      animate={{ flexBasis: `${widthPct}%` }}
      transition={{ duration: 1.0, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
      className={cn(
        'relative flex min-w-0 items-center gap-3 px-4 py-5 sm:px-6 sm:py-6',
        align === 'right' && 'flex-row-reverse text-right',
      )}
      style={{ background: fillBg }}
    >
      <div
        className={cn(
          'flex min-w-0 flex-col',
          align === 'left' ? 'items-start' : 'items-end',
        )}
      >
        <span
          className={cn(
            'truncate text-[11px] font-bold uppercase tracking-[0.22em] sm:text-xs',
            isWinner
              ? 'text-accent-goldHi'
              : isTie
                ? 'text-white/85'
                : 'text-slate-300',
          )}
        >
          {name}
        </span>
      </div>
      <span
        className={cn(
          'text-4xl font-black leading-none tabular-nums sm:text-5xl',
          isWinner
            ? 'bg-clip-text text-transparent drop-shadow-[0_2px_14px_rgba(240,193,75,0.45)]'
            : isTie
              ? 'text-white'
              : 'text-slate-400',
        )}
        style={
          isWinner
            ? {
                backgroundImage:
                  'linear-gradient(180deg, #ffe8a8 0%, #f0c14b 100%)',
              }
            : undefined
        }
      >
        <CountUp target={score} durationMs={1000} delayMs={200} />
      </span>
    </motion.div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex flex-col gap-0.5 rounded-xl border border-white/10 px-3 py-2.5 sm:px-4 sm:py-3"
      style={{ background: 'rgba(8,10,10,0.28)' }}
    >
      <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/40">
        {label}
      </div>
      <div className="text-base font-bold text-white sm:text-lg">{value}</div>
    </div>
  );
}

function RoundRow({
  index,
  log,
  p1Name,
  p2Name,
  players,
  winnerSide,
}: {
  index: number;
  log: RoundLog;
  p1Name: string;
  p2Name: string;
  players: Player[];
  winnerSide: PlayerSide | 'tie';
}) {
  const winnerName =
    log.winner === 'tie' ? null : log.winner === 'P1' ? p1Name : p2Name;

  // Tur kazananını gold/slate'e göre vurgula (kazanan oyuncuyla aynı taraf gold)
  const isMatchWinnerSide = log.winner === winnerSide;
  const winnerClass =
    log.winner === 'tie'
      ? 'text-white/40'
      : isMatchWinnerSide
        ? 'text-accent-goldHi'
        : 'text-slate-400';

  return (
    <li className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/5 py-1 text-sm last:border-b-0">
      <div className="flex items-baseline gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-white/30">
          #{index + 1}
        </span>
        {log.phase !== 'main' && (
          <span className="rounded-md bg-accent-gold/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-accent-goldHi">
            {log.phase === 'extra' ? 'Uzatma' : 'Penaltı'}
          </span>
        )}
        <span className="font-medium text-white/85">{log.questionTitle}</span>
      </div>
      <span className="text-xs text-white/45">
        {nameOf(players, log.p1CardId)} vs {nameOf(players, log.p2CardId)} ·{' '}
        <span className={cn('font-bold', winnerClass)}>
          {winnerName ?? 'Berabere'}
        </span>
      </span>
    </li>
  );
}

function nameOf(players: Player[], id: string): string {
  return players.find((p) => p.id === id)?.displayName ?? id;
}

const CATEGORY_LABELS_TR: Record<string, string> = {
  numeric: 'İstatistik',
  time: 'Zaman & Yaş',
  geo: 'Coğrafya',
  club: 'Kulüp Kariyeri',
  position: 'Mevki & Ayak',
  name: 'İsim & Kart',
  fun: 'Eğlence',
  proximity: 'Hedefe Yakınlık',
  boolean: 'Evet / Hayır',
  extreme: 'Rekorlar',
  composite: 'Bileşik İstatistik',
};

function computeStats(history: RoundLog[], _winnerSide: PlayerSide | 'tie') {
  const ties = history.filter((h) => h.winner === 'tie').length;

  const categoryCounts = new Map<string, number>();
  for (const h of history) {
    const tpl = templateById(h.questionId);
    if (!tpl) continue;
    categoryCounts.set(tpl.category, (categoryCounts.get(tpl.category) ?? 0) + 1);
  }
  let topCategory = '';
  let topCount = 0;
  for (const [cat, n] of categoryCounts) {
    if (n > topCount) {
      topCount = n;
      topCategory = cat;
    }
  }
  const topCategoryLabel = topCategory
    ? `${CATEGORY_LABELS_TR[topCategory] ?? topCategory} (${topCount})`
    : '—';

  return {
    totalRounds: history.length,
    ties,
    topCategoryLabel,
  };
}
