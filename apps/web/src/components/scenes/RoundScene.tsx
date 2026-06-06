'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { AnimatePresence, motion } from 'framer-motion';
import type { Player, PlayerSide } from '@futbol-kart/shared-types';
import type { Template } from '@futbol-kart/question-templates';
import { PlayerCard } from '@/components/PlayerCard';
import { CardRow } from '@/components/CardRow';
import { CountUp } from '@/components/CountUp';
import { CountdownRing } from '@/components/CountdownRing';
import { WinFx } from '@/components/WinFx';
import { GoalVideoFx } from '@/components/GoalVideoFx';
import {
  PlayIcon,
  QuestionIcon,
  MultiplierIcon,
  EyeIcon,
  JokerWandIcon,
  SwapIcon,
} from '@/components/icons';
import type { RoundLog, Scene } from '@futbol-kart/game-engine';
import { cn } from '@/lib/cn';
import { comparisonHint, formatValue } from '@/lib/valueFormat';

interface RoundSceneProps {
  scene: Scene;
  question: Template | null;
  /** Parametre değerleriyle doldurulmuş soru başlığı ({targetApps} → 500). */
  questionTitle: string | null;
  activeSide: PlayerSide;
  botMode: boolean;
  p1Name: string;
  p2Name: string;
  hand: string[];
  players: Player[];
  currentP1Card: string | null;
  currentP2Card: string | null;
  lastLog: RoundLog | undefined;
  isLastRound: boolean;
  /** Bonus kart kimlikleri (taraf bazlı) — elde vurgulamak için. */
  p1BonusCards: Array<string | null>;
  p2BonusCards: Array<string | null>;
  onCardPlay: (cardId: string) => void;
  onAck: () => void;

  // -------- Joker props (aktif taraf bağlamında) --------
  /** Joker barı etkileşimli mi (ROUND_PLAY + bot değil). */
  jokerInteractive: boolean;
  /** Çarpan jokeri bu soruda uygun mu (max/min nicelik). */
  multiplierEligible: boolean;
  /** Soru yönü: 'x2' (max) | 'half' (÷2, min). */
  multiplierDir: 'x2' | 'half';
  /** Aktif taraf çarpan jokerini maçta kullandı mı (kalıcı). */
  multiplierUsed: boolean;
  /** Çarpan bu tur aktif tarafça aktive edildi mi (geri alınamaz). */
  multiplierPendingHere: boolean;
  /** Aktif taraf "İstatistiği Gör"ü maçta kullandı mı. */
  revealUsed: boolean;
  /** Bu turda reveal görseli aktif mi. */
  revealActive: boolean;
  /** Reveal aktifse: cardId → değer haritası. */
  revealValues: Map<string, number | boolean | null> | null;
  onJokerMultiplier: () => void;
  onJokerReveal: () => void;
  /** Son turda çarpan uygulandıysa (reveal göstergesi için). */
  lastMultiplier?: { side: PlayerSide; dir: 'x2' | 'half' };
  /** Transfer jokeri durumu (sadece gösterim — tur başında kullanılır). */
  transferUsed: boolean;
  /** Tur içi kart oynama süresi (sn). */
  cardPlaySeconds: number;
  /** Geri sayım yeniden başlatma anahtarı (faz-tur-taraf). */
  cardTimerKey: string;
  /** ONLINE: sunucu deadline'ı (epoch ms) — geri sayım buna kilitlenir. */
  cardDeadlineMs?: number | null;
  /** Süre dolunca: aktif elden rastgele kart otomatik oynanır. */
  onCardPlayTimeout: () => void;
}

export function RoundScene({
  scene,
  question,
  questionTitle,
  activeSide,
  botMode,
  p1Name,
  p2Name,
  hand,
  players,
  currentP1Card,
  currentP2Card,
  lastLog,
  isLastRound,
  p1BonusCards,
  p2BonusCards,
  onCardPlay,
  onAck,
  jokerInteractive,
  multiplierEligible,
  multiplierDir,
  multiplierUsed,
  multiplierPendingHere,
  revealUsed,
  revealActive,
  revealValues,
  onJokerMultiplier,
  onJokerReveal,
  lastMultiplier,
  transferUsed,
  cardPlaySeconds,
  cardTimerKey,
  cardDeadlineMs = null,
  onCardPlayTimeout,
}: RoundSceneProps) {
  const t = useTranslations('round');

  const turnLabel =
    scene === 'ROUND_PLAY'
      ? activeSide === 'P2' && botMode
        ? t('botThinking')
        : activeSide === 'P1'
          ? `${p1Name}, kartını seç`
          : `${p2Name}, kartını seç`
      : null;

  const showHand = scene === 'ROUND_PLAY';
  // Tur içi geri sayım yalnızca aktif İNSAN HENÜZ kart seçmemişken çalışır
  // (bot beklerken veya aktif taraf kartını oynadıysa gösterme).
  const activeHasPlayed =
    activeSide === 'P1' ? currentP1Card !== null : currentP2Card !== null;
  const cardTimerActive =
    scene === 'ROUND_PLAY' &&
    !(botMode && activeSide === 'P2') &&
    !activeHasPlayed;
  const showReveal =
    (scene === 'ROUND_REVEAL' || scene === 'ROUND_RESULT') &&
    currentP1Card &&
    currentP2Card;

  return (
    <section className="flex flex-col gap-6">
      <AnimatePresence mode="wait">
        {question && (
          <motion.div
            key={question.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="glass-panel-strong flex items-start gap-4 p-5"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent-gold/15 text-accent-goldHi ring-1 ring-accent-gold/30">
              <QuestionIcon size={22} />
            </div>
            <div className="flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent-goldHi">
                {t('questionTitle')}
              </div>
              <h2 className="mt-1 text-lg font-bold sm:text-xl">
                {questionTitle ?? question.title.tr}
              </h2>
              {turnLabel && (
                <div className="mt-3 text-sm font-semibold text-white/80">
                  {turnLabel}
                </div>
              )}
            </div>
            {/* Tur içi kart oynama geri sayımı (mavi tema; transfer kırmızıdan ayrışır).
                Süre dolarsa elden rastgele kart otomatik oynanır. */}
            {cardTimerActive && (
              <div className="flex shrink-0 flex-col items-center gap-1">
                <CountdownRing
                  seconds={cardPlaySeconds}
                  deadlineMs={cardDeadlineMs}
                  runKey={cardTimerKey}
                  onComplete={onCardPlayTimeout}
                  color="#38bdf8"
                  urgentColor="#ef4444"
                  size={52}
                  stroke={5}
                />
                <span className="text-[9px] font-semibold uppercase tracking-wider text-white/40">
                  Süre
                </span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {showReveal && (
          <motion.div
            key="reveal"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="glass-panel flex flex-col items-stretch gap-6 p-6 sm:flex-row sm:items-center sm:justify-center"
          >
            <RevealSide
              side="P1"
              label={p1Name}
              cardId={currentP1Card!}
              value={lastLog?.p1Value ?? null}
              templateId={lastLog?.questionId ?? question?.id ?? ''}
              isWinner={lastLog?.winner === 'P1'}
              players={players}
              multiplierDir={
                lastMultiplier?.side === 'P1' ? lastMultiplier.dir : undefined
              }
            />
            <div className="flex flex-col items-center text-center">
              <span className="text-2xl font-black text-accent-goldHi">VS</span>
              {question && lastLog && lastLog.winner !== 'tie' && (
                <span className="mt-2 text-[10px] font-medium uppercase tracking-wider text-white/45">
                  {comparisonHint(lastLog.questionId, question.compareOp)}
                </span>
              )}
              <RoundJokerSummary
                log={lastLog}
                p1Name={p1Name}
                p2Name={p2Name}
              />
            </div>
            <RevealSide
              side="P2"
              label={p2Name}
              cardId={currentP2Card!}
              value={lastLog?.p2Value ?? null}
              templateId={lastLog?.questionId ?? question?.id ?? ''}
              isWinner={lastLog?.winner === 'P2'}
              players={players}
              multiplierDir={
                lastMultiplier?.side === 'P2' ? lastMultiplier.dir : undefined
              }
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {scene === 'ROUND_RESULT' && lastLog && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-3"
          >
            <RoundResultBadge log={lastLog} p1Name={p1Name} p2Name={p2Name} t={t} />
            <button type="button" onClick={onAck} className="btn-primary">
              <PlayIcon size={14} />
              {isLastRound ? t('finish') : t('nextRound')}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Gol video overlay (z-30, yarı-saydam) — KARTLAR AÇILIRKEN (ROUND_REVEAL)
          başlar; ~1.43sn'lik video, reveal→result geçişi (1450ms) bitmeden tamamlanır,
          böylece win sesi (ROUND_RESULT'ta) tam video biterken devreye girer. winner
          reveal sırasında lastLog'ta zaten hazır. Beraberlikte gösterilmez. */}
      {showReveal &&
        lastLog &&
        (lastLog.winner === 'P1' || lastLog.winner === 'P2') && (
          <GoalVideoFx fireKey={`${lastLog.questionId}-${lastLog.winner}`} />
        )}

      {/* Tur kazanma kıvılcım+halo efekti — sonuç anında (win sesiyle birlikte). */}
      {scene === 'ROUND_RESULT' &&
        lastLog &&
        (lastLog.winner === 'P1' || lastLog.winner === 'P2') && (
          <WinFx
            side={lastLog.winner}
            fireKey={`${lastLog.questionId}-${lastLog.winner}`}
          />
        )}

      {showHand && jokerInteractive && (
        <JokerBar
          multiplierEligible={multiplierEligible}
          multiplierDir={multiplierDir}
          multiplierUsed={multiplierUsed}
          multiplierPendingHere={multiplierPendingHere}
          revealUsed={revealUsed}
          revealActive={revealActive}
          transferUsed={transferUsed}
          onMultiplier={onJokerMultiplier}
          onReveal={onJokerReveal}
        />
      )}

      {/* O tur joker aktifse: kalıcı durum şeridi + el bölgesine altın aura.
          Çarpan ve İstatistik aynı anda aktif olabilir. */}
      {showHand && jokerInteractive && (multiplierPendingHere || revealActive) && (
        <ActiveJokerBanner
          multiplierPendingHere={multiplierPendingHere}
          multiplierDir={multiplierDir}
          revealActive={revealActive}
        />
      )}

      {showHand && (
        <div
          className={cn(
            'relative rounded-2xl transition-all duration-500',
            jokerInteractive && (multiplierPendingHere || revealActive)
              ? 'bg-accent-gold/[0.04] shadow-[0_0_40px_-8px_rgba(240,193,75,0.4)] ring-1 ring-accent-gold/25'
              : '',
          )}
        >
          {/* Joker aktivasyon patlaması — her aktivasyonda bir kez. */}
          {jokerInteractive && multiplierPendingHere && (
            <JokerActivateBurst tone="gold" fireKey={`mult-${activeSide}`} />
          )}
          {jokerInteractive && revealActive && (
            <JokerActivateBurst tone="cyan" fireKey={`reveal-${activeSide}`} />
          )}
          <HandDisplay
            activeSide={activeSide}
            botMode={botMode}
            p1Name={p1Name}
            p2Name={p2Name}
            hand={hand}
            players={players}
            currentP1Card={currentP1Card}
            p1BonusCards={p1BonusCards}
            p2BonusCards={p2BonusCards}
            onCardPlay={onCardPlay}
            revealValues={revealValues}
            revealTemplateId={question?.id ?? ''}
            revealCompareOp={question?.compareOp ?? 'max'}
          />
        </div>
      )}
    </section>
  );
}

/** O tur aktif jokerleri özetleyen kalıcı şerit (el üstünde). */
function ActiveJokerBanner({
  multiplierPendingHere,
  multiplierDir,
  revealActive,
}: {
  multiplierPendingHere: boolean;
  multiplierDir: 'x2' | 'half';
  revealActive: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-wrap items-center gap-2 text-[11px] font-bold"
    >
      <span className="uppercase tracking-[0.2em] text-accent-goldHi/70">
        Bu tur aktif:
      </span>
      {multiplierPendingHere && (
        <span className="inline-flex items-center gap-1 rounded-full bg-accent-gold/20 px-2.5 py-1 text-accent-goldHi ring-1 ring-accent-gold/40">
          <MultiplierIcon size={13} />
          Çarpan {multiplierDir === 'x2' ? '×2' : '÷2'}
        </span>
      )}
      {revealActive && (
        <span className="inline-flex items-center gap-1 rounded-full bg-cyan-400/15 px-2.5 py-1 text-cyan-200 ring-1 ring-cyan-400/35">
          <EyeIcon size={13} />
          İstatistik açık
        </span>
      )}
    </motion.div>
  );
}

/**
 * Tur sonu joker özeti — reveal alanının ortasına (VS altı) yedirilir; ek satır
 * açmaz. Bu turda hangi taraf hangi jokeri kullandı (çarpan + istatistik), her
 * iki oyuncu da görür (şeffaflık = daha tatmin edici sonuç).
 */
function RoundJokerSummary({
  log,
  p1Name,
  p2Name,
}: {
  log: RoundLog | undefined;
  p1Name: string;
  p2Name: string;
}) {
  if (!log) return null;
  const nameOf = (s: PlayerSide) => (s === 'P1' ? p1Name : p2Name);
  const items: { key: string; node: React.ReactNode }[] = [];

  if (log.multiplier) {
    items.push({
      key: 'mult',
      node: (
        <span className="inline-flex items-center gap-1 rounded-full bg-accent-gold/15 px-2 py-0.5 text-accent-goldHi ring-1 ring-accent-gold/30">
          <MultiplierIcon size={11} />
          {nameOf(log.multiplier.side)} · {log.multiplier.dir === 'x2' ? '×2' : '÷2'}
        </span>
      ),
    });
  }
  for (const s of log.revealUsedBy ?? []) {
    items.push({
      key: `rev-${s}`,
      node: (
        <span className="inline-flex items-center gap-1 rounded-full bg-cyan-400/12 px-2 py-0.5 text-cyan-200 ring-1 ring-cyan-400/30">
          <EyeIcon size={11} />
          {nameOf(s)}
        </span>
      ),
    });
  }
  if (log.transferBy) {
    items.push({
      key: 'transfer',
      node: (
        <span className="inline-flex items-center gap-1 rounded-full bg-side-red/15 px-2 py-0.5 text-side-red ring-1 ring-side-red/30">
          <SwapIcon size={11} />
          {nameOf(log.transferBy)} · transfer
        </span>
      ),
    });
  }
  if (items.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5, duration: 0.3 }}
      className="mt-3 flex flex-col items-center gap-1"
    >
      <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/35">
        Joker kullanıldı
      </span>
      <div className="flex flex-wrap items-center justify-center gap-1 text-[10px] font-bold">
        {items.map((it) => (
          <span key={it.key}>{it.node}</span>
        ))}
      </div>
    </motion.div>
  );
}

/**
 * Joker aktivasyon patlaması — kısa, el bölgesinden yukarı doğru açılan ışık
 * dalgası + birkaç parıltı. WinFx'ten hafif; layout itmez (absolute + pointer-none).
 */
function JokerActivateBurst({
  tone,
  fireKey,
}: {
  tone: 'gold' | 'cyan';
  fireKey: string;
}) {
  const color =
    tone === 'gold' ? 'rgba(240,193,75,0.55)' : 'rgba(56,189,248,0.55)';
  return (
    <motion.div
      key={fireKey}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-2xl"
      initial={{ opacity: 1 }}
      animate={{ opacity: 0 }}
      transition={{ duration: 0.7, ease: 'easeOut' }}
    >
      <motion.div
        className="absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full"
        initial={{ scale: 0.3, opacity: 0.9 }}
        animate={{ scale: 2.4, opacity: 0 }}
        transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
        style={{
          background: `radial-gradient(circle, ${color} 0%, transparent 65%)`,
        }}
      />
    </motion.div>
  );
}

interface HandDisplayProps {
  activeSide: PlayerSide;
  botMode: boolean;
  p1Name: string;
  p2Name: string;
  hand: string[];
  players: Player[];
  currentP1Card: string | null;
  p1BonusCards: Array<string | null>;
  p2BonusCards: Array<string | null>;
  onCardPlay: (cardId: string) => void;
  /** "İstatistiği Gör" aktifse cardId → değer. null = joker kapalı. */
  revealValues: Map<string, number | boolean | null> | null;
  /** Reveal rozeti formatı için soru id'si. */
  revealTemplateId: string;
  /** Sorunun yönü — "en iyi cevap" vurgusu için (max/min/bool). */
  revealCompareOp: 'max' | 'min' | 'bool';
}

/**
 * Aktif oyuncunun elini gösterir.
 * - Vs-bot + P1 zaten kart seçmişse: P1'in eli sahnede kalır,
 *   seçilen kart parlar, diğerleri solar (bot beklerken görsel feedback).
 * - Bot eli daima kapalı (face-down).
 * - Arkadaşına karşı modu: aktif oyuncunun eli açık.
 */
function HandDisplay({
  activeSide,
  botMode,
  p1Name,
  p2Name,
  hand,
  players,
  currentP1Card,
  p1BonusCards,
  p2BonusCards,
  onCardPlay,
  revealValues,
  revealTemplateId,
  revealCompareOp,
}: HandDisplayProps) {
  // Vs-bot ve P1 kartını seçmiş — bot sırası
  const botWaitingForP1Reveal =
    botMode && activeSide === 'P2' && currentP1Card !== null;

  // İstatistik jokeri açıkken "en iyi cevap" kartlarını belirle (madde 3):
  // compareOp'a göre en iyi değere sahip kart(lar). bool → true olanlar.
  // Eşitlikte hepsi vurgulanır. revealValues yoksa boş set.
  const bestCardIds = computeBestRevealCards(revealValues, revealCompareOp);

  // Bot beklerken P1'in eli gösterilir → P1 bonus seti; aksi halde aktif taraf.
  const shownBonus = new Set(
    (botWaitingForP1Reveal || activeSide === 'P1' ? p1BonusCards : p2BonusCards).filter(
      (c): c is string => c !== null,
    ),
  );

  if (botWaitingForP1Reveal) {
    // P1'in elini göster, seçili kartı vurgula
    return (
      <div className="mt-2">
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-accent-goldHi">
          {p1Name} seçti — bot düşünüyor
        </div>
        <CardRow className="justify-center !gap-2 sm:!gap-2.5">
          {hand.map((id) => {
            const p = players.find((pp) => pp.id === id);
            if (!p) return null;
            const isPicked = id === currentP1Card;
            const isBonus = shownBonus.has(id);
            return (
              <div
                key={id}
                className={cn(
                  'relative transition-all duration-300',
                  isPicked
                    ? '-translate-y-2 drop-shadow-[0_0_24px_rgba(240,193,75,0.55)]'
                    : 'opacity-30 saturate-50',
                )}
              >
                {isBonus && <BonusTag />}
                <PlayerCard player={p} selected={isPicked} size="md" />
              </div>
            );
          })}
        </CardRow>
      </div>
    );
  }

  const isBotSide = botMode && activeSide === 'P2';

  return (
    <div className="mt-2">
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-accent-goldHi">
        {activeSide === 'P1'
          ? `${p1Name} — el`
          : botMode
            ? 'Bot eli (gizli)'
            : `${p2Name} — el`}
      </div>
      {isBotSide ? (
        <div className="flex flex-wrap justify-center gap-2 sm:gap-2.5">
          {hand.map((id, i) => (
            <PlayerCard key={id} faceDown index={i} side="blue" size="md" />
          ))}
        </div>
      ) : (
        <CardRow className="cursor-pointer justify-center !gap-2 sm:!gap-2.5">
          {hand.map((id) => {
            const p = players.find((pp) => pp.id === id);
            if (!p) return null;
            const isBonus = shownBonus.has(id);
            const hasReveal = revealValues?.has(id) ?? false;
            // En iyi cevap (madde 3): istatistik açıkken bu sorunun en iyi
            // değerli kartı altın çerçeve + glow + "★ EN İYİ" ile işaretlenir.
            const isBest = hasReveal && bestCardIds.has(id);
            return (
              <div
                key={id}
                role="button"
                onClick={() => onCardPlay(id)}
                className={cn(
                  'relative transition hover:-translate-y-1',
                  isBonus && !isBest && 'drop-shadow-[0_0_18px_rgba(240,193,75,0.45)]',
                  isBest && '-translate-y-1 drop-shadow-[0_0_26px_rgba(255,215,107,0.85)]',
                )}
              >
                {isBonus && <BonusTag />}
                {hasReveal && (
                  <StatRevealTag
                    templateId={revealTemplateId}
                    value={revealValues!.get(id) ?? null}
                    best={isBest}
                  />
                )}
                {isBest && <BestAnswerTag />}
                <div
                  className={cn(
                    isBest &&
                      'rounded-xl ring-[3px] ring-accent-goldHi ring-offset-2 ring-offset-transparent',
                  )}
                >
                  <PlayerCard player={p} selected={isBonus} size="md" />
                </div>
              </div>
            );
          })}
        </CardRow>
      )}
    </div>
  );
}

/** Bonus kartı rozeti — kartın sol üstüne "⭐ +2" altın etiket. */
function BonusTag() {
  return (
    <span className="pointer-events-none absolute -left-1 -top-2 z-20 rounded-full bg-gradient-to-r from-accent-goldHi to-accent-gold px-1.5 py-0.5 text-[10px] font-black uppercase leading-none tracking-wide text-black shadow-glow-gold ring-1 ring-black/20">
      ⭐ +2
    </span>
  );
}

/**
 * "İstatistiği Gör" rozeti — kartın ALT ortasına oturan belirgin bant
 * (madde 2: eskiden çok küçüktü). Bu sorudaki değeri büyük + okunaklı gösterir.
 * En iyi cevapsa altın, değilse cyan tema.
 */
function StatRevealTag({
  templateId,
  value,
  best,
}: {
  templateId: string;
  value: number | boolean | null;
  best?: boolean;
}) {
  return (
    <span
      className={cn(
        'pointer-events-none absolute -bottom-3 left-1/2 z-30 -translate-x-1/2 whitespace-nowrap',
        'rounded-lg px-2.5 py-1 text-sm font-black leading-none tracking-wide text-black',
        'ring-2 ring-black/30',
        best
          ? 'bg-gradient-to-r from-accent-goldHi to-accent-gold shadow-[0_0_18px_rgba(255,215,107,0.85)]'
          : 'bg-gradient-to-r from-cyan-300 to-sky-400 shadow-[0_0_16px_rgba(56,189,248,0.7)]',
      )}
    >
      👁 {formatValue(templateId, value)}
    </span>
  );
}

/**
 * "★ EN İYİ" etiketi — en iyi cevabın SAĞ üstüne (madde 3). Sağ üst tercih
 * edildi: sol üstte bonus "⭐ +2" etiketi olabilir, çakışmasın.
 */
function BestAnswerTag() {
  return (
    <span className="pointer-events-none absolute -right-1 -top-2 z-30 rounded-full bg-gradient-to-r from-amber-300 to-accent-goldHi px-2 py-0.5 text-[10px] font-black uppercase leading-none tracking-wide text-black shadow-glow-gold ring-1 ring-black/30">
      ★ EN İYİ
    </span>
  );
}

/**
 * İstatistik açıkken bu sorunun "en iyi cevap" kart id'lerini hesaplar.
 *   - max → en yüksek değer(ler)
 *   - min → en düşük değer(ler)
 *   - bool → değeri true olan kart(lar)
 * Eşitlikte birden fazla kart döner. null/eksik değerli kartlar dışlanır.
 */
function computeBestRevealCards(
  revealValues: Map<string, number | boolean | null> | null,
  compareOp: 'max' | 'min' | 'bool',
): Set<string> {
  const out = new Set<string>();
  if (!revealValues) return out;

  if (compareOp === 'bool') {
    for (const [id, v] of revealValues) if (v === true) out.add(id);
    return out;
  }

  // Sayısal: en iyi (max/min) değeri bul, ona eşit olan tüm kartları işaretle.
  let best: number | null = null;
  for (const [, v] of revealValues) {
    if (typeof v !== 'number') continue;
    if (best === null) best = v;
    else best = compareOp === 'max' ? Math.max(best, v) : Math.min(best, v);
  }
  if (best === null) return out;
  for (const [id, v] of revealValues) {
    if (typeof v === 'number' && v === best) out.add(id);
  }
  return out;
}

/**
 * Joker barı — aktif oyuncunun elinin üstünde. Her joker bir buton:
 * ikon + ad + kalan-hak rozeti + "?" açıklama popover'ı.
 *  - Çarpan: soru yönüne göre ×2 / ÷2; uygun değilse disabled (bool/proximity).
 *    Kullanıldıysa ya da bu tur aktive edildiyse kilitli.
 *  - İstatistiği Gör: kullanıldıysa "aktif/bitti" durumu.
 */
function JokerBar({
  multiplierEligible,
  multiplierDir,
  multiplierUsed,
  multiplierPendingHere,
  revealUsed,
  revealActive,
  transferUsed,
  onMultiplier,
  onReveal,
}: {
  multiplierEligible: boolean;
  multiplierDir: 'x2' | 'half';
  multiplierUsed: boolean;
  multiplierPendingHere: boolean;
  revealUsed: boolean;
  revealActive: boolean;
  transferUsed: boolean;
  onMultiplier: () => void;
  onReveal: () => void;
}) {
  const dirLabel = multiplierDir === 'x2' ? '×2' : '÷2';
  // Çarpan: bu tur aktive edildiyse "aktif" göster; maçta kullanıldıysa kilitli;
  // uygun değilse disabled.
  const multiplierLocked = multiplierUsed || multiplierPendingHere;
  const multiplierDisabled = !multiplierEligible || multiplierLocked;
  const multiplierHint = !multiplierEligible
    ? 'Bu soru tipi için uygun değil (Evet/Hayır ya da "en yakın" soruları).'
    : multiplierDir === 'x2'
      ? 'Bu soruda "daha çok" kazanır — kendi değerini 2 ile çarpar. Maçta 1 kez.'
      : 'Bu soruda "daha az" kazanır — kendi değerini 2\'ye böler. Maçta 1 kez.';

  return (
    <div className="flex flex-wrap items-stretch gap-2.5">
      <div className="flex items-center gap-1.5 pr-1 text-accent-goldHi/70">
        <JokerWandIcon size={16} />
        <span className="text-[10px] font-bold uppercase tracking-[0.22em]">
          Jokerler
        </span>
      </div>

      <JokerButton
        icon={<MultiplierIcon size={20} />}
        title="Çarpan"
        dirBadge={multiplierEligible ? dirLabel : undefined}
        remaining={multiplierUsed ? 0 : 1}
        active={multiplierPendingHere}
        disabled={multiplierDisabled}
        statusText={
          multiplierPendingHere
            ? `${dirLabel} AKTİF`
            : multiplierUsed
              ? 'KULLANILDI'
              : !multiplierEligible
                ? 'UYGUN DEĞİL'
                : 'HAZIR'
        }
        statusTone={
          multiplierPendingHere
            ? 'active'
            : multiplierUsed || !multiplierEligible
              ? 'spent'
              : 'ready'
        }
        helpText={multiplierHint}
        onClick={onMultiplier}
      />

      <JokerButton
        icon={<EyeIcon size={20} />}
        title="İstatistiği Gör"
        remaining={revealUsed ? 0 : 1}
        active={revealActive}
        disabled={revealUsed}
        statusText={
          revealActive ? 'AÇIK' : revealUsed ? 'KULLANILDI' : 'HAZIR'
        }
        statusTone={revealActive ? 'active' : revealUsed ? 'spent' : 'ready'}
        helpText="Kendi elindeki kartların bu sorudaki değerini kart üzerinde gösterir. Rakibin eli gizli kalır. Maçta 1 kez."
        onClick={onReveal}
      />

      {/* Transfer — yalnızca DURUM gösterimi (tur başında, soru açıklanmadan
          kullanılır; buradan tetiklenmez). */}
      <TransferStatusChip used={transferUsed} />
    </div>
  );
}

/**
 * Transfer jokeri durum çipi — bilgilendirme amaçlı (tıklanmaz). Transfer tur
 * başında, soru açıklanmadan önce kullanılır; burada sadece "kaldı mı" gösterilir.
 */
function TransferStatusChip({ used }: { used: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative flex items-stretch">
      <div
        className={cn(
          'flex min-w-[116px] flex-col justify-center gap-1 rounded-l-2xl border px-3.5 py-2.5',
          used
            ? 'border-white/8 bg-white/[0.03]'
            : 'border-side-red/30 bg-side-red/[0.08]',
        )}
      >
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1',
              used
                ? 'bg-white/5 text-white/30 ring-white/10'
                : 'bg-side-red/20 text-side-red ring-side-red/30',
            )}
          >
            <SwapIcon size={18} />
          </span>
          <div className="flex flex-col">
            <span
              className={cn(
                'text-[13px] font-bold leading-tight',
                used ? 'text-white/45' : 'text-white',
              )}
            >
              Transfer
            </span>
            <span
              className={cn(
                'text-[10px] font-bold uppercase tracking-wide',
                used ? 'text-white/40' : 'text-side-red/90',
              )}
            >
              {used ? 'KULLANILDI' : 'TUR BAŞINDA'}
            </span>
          </div>
        </div>
      </div>
      <span
        className={cn(
          'pointer-events-none absolute -left-1.5 -top-1.5 z-10 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-black leading-none ring-2 ring-[#0b1120]',
          used ? 'bg-white/20 text-white/55' : 'bg-emerald-400 text-black',
        )}
      >
        {used ? 0 : 1}
      </span>
      <button
        type="button"
        aria-label="Transfer nedir?"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={() => setOpen((v) => !v)}
        className="flex w-7 items-center justify-center rounded-r-2xl border border-l-0 border-white/12 bg-white/5 text-xs font-black text-white/55 transition hover:bg-white/12 hover:text-white"
      >
        ?
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.96 }}
            transition={{ duration: 0.16 }}
            role="tooltip"
            className="absolute left-0 top-full z-30 mt-2 w-64 rounded-xl border border-white/12 bg-[#0c1322]/95 p-3 text-[11px] leading-relaxed text-white/80 shadow-xl backdrop-blur"
          >
            <div className="mb-1 flex items-center gap-1.5 font-bold text-side-red">
              <SwapIcon size={14} />
              Transfer Hamlesi
            </div>
            Her turun başında (soru açıklanmadan) çıkar: rakibin elinden bir kart al,
            kendininkinden birini ver. Son turda kullanılamaz. Maçta 1 kez.
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

type StatusTone = 'ready' | 'active' | 'spent';

/**
 * Tek joker butonu — büyük (kartların ~1/3'ü kadar dikey), ikon + başlık +
 * kalan-hak rozeti + durum satırı, sağda "?" popover tetiği. Basınca pulse.
 */
function JokerButton({
  icon,
  title,
  dirBadge,
  remaining,
  active,
  disabled,
  statusText,
  statusTone,
  helpText,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  dirBadge?: string;
  remaining: number;
  active: boolean;
  disabled: boolean;
  statusText: string;
  statusTone: StatusTone;
  helpText: string;
  onClick: () => void;
}) {
  const [open, setOpen] = useState(false);
  const toneText =
    statusTone === 'active'
      ? 'text-accent-goldHi'
      : statusTone === 'ready'
        ? 'text-emerald-300/90'
        : 'text-white/40';

  return (
    <div className="relative flex items-stretch">
      <motion.button
        type="button"
        onClick={onClick}
        disabled={disabled}
        whileTap={disabled ? undefined : { scale: 0.94 }}
        // Aktifken yumuşak nabız — "bu tur joker aktif" hissini sürdürür.
        animate={
          active
            ? {
                boxShadow: [
                  '0 0 0px rgba(240,193,75,0.0)',
                  '0 0 22px rgba(240,193,75,0.45)',
                  '0 0 10px rgba(240,193,75,0.28)',
                ],
              }
            : { boxShadow: '0 0 0px rgba(240,193,75,0)' }
        }
        transition={
          active
            ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }
            : { duration: 0.2 }
        }
        className={cn(
          'flex min-w-[116px] flex-col justify-center gap-1 rounded-l-2xl border px-3.5 py-2.5 text-left transition',
          active
            ? 'border-accent-gold/70 bg-accent-gold/15'
            : disabled
              ? 'cursor-not-allowed border-white/8 bg-white/[0.03]'
              : 'border-white/12 bg-white/[0.06] hover:border-accent-gold/45 hover:bg-accent-gold/10',
        )}
      >
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 transition',
              active
                ? 'bg-accent-gold/25 text-accent-goldHi ring-accent-gold/40'
                : disabled
                  ? 'bg-white/5 text-white/30 ring-white/10'
                  : 'bg-white/8 text-white/80 ring-white/15',
            )}
          >
            {icon}
          </span>
          <div className="flex flex-col">
            <span
              className={cn(
                'flex items-center gap-1 text-[13px] font-bold leading-tight',
                disabled && !active ? 'text-white/45' : 'text-white',
              )}
            >
              {title}
              {dirBadge && (
                <span className="rounded bg-white/10 px-1 text-[10px] font-black text-white/70">
                  {dirBadge}
                </span>
              )}
            </span>
            <span
              className={cn(
                'text-[10px] font-bold uppercase tracking-wide',
                toneText,
              )}
            >
              {statusText}
            </span>
          </div>
        </div>
      </motion.button>

      {/* Kalan-hak rozeti — sol üst köşede sayaç */}
      <span
        className={cn(
          'pointer-events-none absolute -left-1.5 -top-1.5 z-10 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-black leading-none ring-2 ring-[#0b1120]',
          remaining > 0
            ? 'bg-emerald-400 text-black'
            : 'bg-white/20 text-white/55',
        )}
      >
        {remaining}
      </span>

      {/* "?" açıklama tetiği */}
      <button
        type="button"
        aria-label={`${title} nedir?`}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="flex w-7 items-center justify-center rounded-r-2xl border border-l-0 border-white/12 bg-white/5 text-xs font-black text-white/55 transition hover:bg-white/12 hover:text-white"
      >
        ?
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.96 }}
            transition={{ duration: 0.16 }}
            role="tooltip"
            className="absolute left-0 top-full z-30 mt-2 w-64 rounded-xl border border-white/12 bg-[#0c1322]/95 p-3 text-[11px] leading-relaxed text-white/80 shadow-xl backdrop-blur"
          >
            <div className="mb-1 flex items-center gap-1.5 font-bold text-accent-goldHi">
              {icon}
              {title}
            </div>
            {helpText}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function RevealSide({
  side,
  label,
  cardId,
  value,
  templateId,
  isWinner,
  players,
  multiplierDir,
}: {
  side: PlayerSide;
  label: string;
  cardId: string;
  value: number | boolean | null;
  templateId: string;
  isWinner: boolean;
  players: Player[];
  multiplierDir?: 'x2' | 'half';
}) {
  const player = players.find((p) => p.id === cardId);
  if (!player) return null;
  const dotColor = side === 'P1' ? 'bg-side-red' : 'bg-side-blue';

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/65">
        <span className={cn('h-2 w-2 rounded-full', dotColor)} />
        {label}
        {multiplierDir && (
          <span className="rounded-full bg-accent-gold/20 px-2 py-0.5 text-[10px] font-black tracking-normal text-accent-goldHi ring-1 ring-accent-gold/40">
            {multiplierDir === 'x2' ? '×2' : '÷2'}
          </span>
        )}
      </div>

      {/* Kart 3D flip + kazanansa flip sonrası punch-scale (sinyal vurgusu) */}
      <motion.div
        initial={{ rotateY: 180, opacity: 0 }}
        animate={
          isWinner
            ? { rotateY: 0, opacity: 1, scale: [1, 1.06, 1] }
            : { rotateY: 0, opacity: 1 }
        }
        transition={
          isWinner
            ? {
                rotateY: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
                opacity: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
                scale: {
                  duration: 0.42,
                  ease: [0.22, 1, 0.36, 1],
                  delay: 0.55,
                  times: [0, 0.5, 1],
                },
              }
            : {
                duration: 0.55,
                ease: [0.22, 1, 0.36, 1],
                delay: side === 'P1' ? 0 : 0.15,
              }
        }
        style={{ transformStyle: 'preserve-3d', perspective: 800 }}
      >
        <PlayerCard player={player} selected={isWinner} size="reveal" />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.55 }}
        className="text-center"
      >
        <div className="text-[10px] font-semibold uppercase tracking-wider text-white/55">
          Değer
        </div>
        <div
          className={cn(
            'text-xl font-black',
            isWinner ? 'text-accent-goldHi' : 'text-white/85',
          )}
        >
          <RevealValue
            templateId={templateId}
            value={value}
            delayMs={550}
          />
        </div>
      </motion.div>
    </div>
  );
}

/**
 * Sayısal değerler için count-up, boolean/null için statik.
 * delayMs: kart flip bitince başlasın.
 */
function RevealValue({
  templateId,
  value,
  delayMs,
}: {
  templateId: string;
  value: number | boolean | null;
  delayMs: number;
}) {
  // Boolean / null / month / year gibi sıçramalı değerler için count-up'a anlam yok
  if (value === null || typeof value === 'boolean') {
    return <>{formatValue(templateId, value)}</>;
  }
  // Birkaç şablon string-tipi gibi davranır (ay adı, yıl) — sayı animasyonu yapma
  const skipCountUp =
    templateId === 't04_birth_month_late' ||
    templateId === 't06_earlier_debut' ||
    templateId === 'n10_pro_debut_year' ||
    templateId === 't03_birth_year' ||
    templateId === 'c03_first_club_year_early' ||
    templateId === 'c04_last_club_year_late';
  if (skipCountUp) {
    return <>{formatValue(templateId, value)}</>;
  }
  return (
    <CountUp
      target={value}
      delayMs={delayMs}
      durationMs={700}
      format={(v) => formatValue(templateId, v)}
    />
  );
}

function RoundResultBadge({
  log,
  p1Name,
  p2Name,
  t,
}: {
  log: RoundLog;
  p1Name: string;
  p2Name: string;
  t: ReturnType<typeof useTranslations<'round'>>;
}) {
  if (log.winner === 'tie') {
    return (
      <motion.div
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 280, damping: 18 }}
        className="rounded-full bg-white/10 px-4 py-1 text-sm font-bold uppercase tracking-wider text-white/80"
      >
        {t('tie')}
      </motion.div>
    );
  }
  const winnerLabel = log.winner === 'P1' ? p1Name : p2Name;
  return (
    <div className="flex flex-col items-center gap-1">
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{
          scale: 1,
          opacity: 1,
          boxShadow: [
            '0 0 0px rgba(240,193,75,0)',
            '0 0 28px rgba(240,193,75,0.65)',
            '0 0 14px rgba(240,193,75,0.4)',
          ],
        }}
        transition={{
          duration: 0.55,
          ease: [0.22, 1, 0.36, 1],
        }}
        className="rounded-full bg-accent-gold/20 px-4 py-1 text-sm font-bold uppercase tracking-wider text-accent-goldHi ring-1 ring-accent-gold/40"
      >
        {t('winner')}: {winnerLabel}
      </motion.div>
      {log.bonusAwarded && (
        <motion.div
          initial={{ scale: 0.5, opacity: 0, y: -4 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ delay: 0.3, type: 'spring', stiffness: 320, damping: 14 }}
          className="rounded-full bg-gradient-to-r from-accent-goldHi to-accent-gold px-3 py-0.5 text-xs font-black uppercase tracking-wider text-black shadow-glow-gold"
        >
          ⭐ Bonus Kategori — +2!
        </motion.div>
      )}
      {log.tiebreakerUsed && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.3 }}
          className="text-[10px] text-white/40"
        >
          {t('tiebreakerUsed', { tb: log.tiebreakerUsed })}
        </motion.div>
      )}
    </div>
  );
}
