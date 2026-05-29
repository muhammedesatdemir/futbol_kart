'use client';

import { useTranslations } from 'next-intl';
import { AnimatePresence, motion } from 'framer-motion';
import type { Player, PlayerSide } from '@futbol-kart/shared-types';
import type { Template } from '@futbol-kart/question-templates';
import { PlayerCard } from '@/components/PlayerCard';
import { CardRow } from '@/components/CardRow';
import { CountUp } from '@/components/CountUp';
import { PlayIcon, QuestionIcon } from '@/components/icons';
import type { RoundLog, Scene } from '@/lib/sessionMachine';
import { cn } from '@/lib/cn';
import { comparisonHint, formatValue } from '@/lib/valueFormat';

interface RoundSceneProps {
  scene: Scene;
  question: Template | null;
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
  onCardPlay: (cardId: string) => void;
  onAck: () => void;
}

export function RoundScene({
  scene,
  question,
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
  onCardPlay,
  onAck,
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
                {question.title.tr}
              </h2>
              {turnLabel && (
                <div className="mt-3 text-sm font-semibold text-white/80">
                  {turnLabel}
                </div>
              )}
            </div>
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
            />
            <div className="flex flex-col items-center text-center">
              <span className="text-2xl font-black text-accent-goldHi">VS</span>
              {question && lastLog && lastLog.winner !== 'tie' && (
                <span className="mt-2 text-[10px] font-medium uppercase tracking-wider text-white/45">
                  {comparisonHint(lastLog.questionId, question.compareOp)}
                </span>
              )}
            </div>
            <RevealSide
              side="P2"
              label={p2Name}
              cardId={currentP2Card!}
              value={lastLog?.p2Value ?? null}
              templateId={lastLog?.questionId ?? question?.id ?? ''}
              isWinner={lastLog?.winner === 'P2'}
              players={players}
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

      {showHand && (
        <HandDisplay
          activeSide={activeSide}
          botMode={botMode}
          p1Name={p1Name}
          p2Name={p2Name}
          hand={hand}
          players={players}
          currentP1Card={currentP1Card}
          onCardPlay={onCardPlay}
        />
      )}
    </section>
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
  onCardPlay: (cardId: string) => void;
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
  onCardPlay,
}: HandDisplayProps) {
  // Vs-bot ve P1 kartını seçmiş — bot sırası
  const botWaitingForP1Reveal =
    botMode && activeSide === 'P2' && currentP1Card !== null;

  if (botWaitingForP1Reveal) {
    // P1'in elini göster, seçili kartı vurgula
    return (
      <div className="mt-2">
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-accent-goldHi">
          {p1Name} seçti — bot düşünüyor
        </div>
        <CardRow>
          {hand.map((id) => {
            const p = players.find((pp) => pp.id === id);
            if (!p) return null;
            const isPicked = id === currentP1Card;
            return (
              <div
                key={id}
                className={cn(
                  'transition-all duration-300',
                  isPicked
                    ? '-translate-y-2 drop-shadow-[0_0_24px_rgba(240,193,75,0.55)]'
                    : 'opacity-30 saturate-50',
                )}
              >
                <PlayerCard player={p} selected={isPicked} />
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
        <div className="flex flex-wrap gap-3">
          {hand.map((id, i) => (
            <PlayerCard
              key={id}
              faceDown
              index={i}
              side="blue"
              className="w-24"
            />
          ))}
        </div>
      ) : (
        <CardRow className="cursor-pointer">
          {hand.map((id) => {
            const p = players.find((pp) => pp.id === id);
            if (!p) return null;
            return (
              <div
                key={id}
                role="button"
                onClick={() => onCardPlay(id)}
                className="transition hover:-translate-y-1"
              >
                <PlayerCard player={p} />
              </div>
            );
          })}
        </CardRow>
      )}
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
}: {
  side: PlayerSide;
  label: string;
  cardId: string;
  value: number | boolean | null;
  templateId: string;
  isWinner: boolean;
  players: Player[];
}) {
  const player = players.find((p) => p.id === cardId);
  if (!player) return null;
  const dotColor = side === 'P1' ? 'bg-side-red' : 'bg-side-blue';

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/65">
        <span className={cn('h-2 w-2 rounded-full', dotColor)} />
        {label}
      </div>

      {/* Kart 3D flip animasyonu */}
      <motion.div
        initial={{ rotateY: 180, opacity: 0 }}
        animate={{ rotateY: 0, opacity: 1 }}
        transition={{
          duration: 0.55,
          ease: [0.22, 1, 0.36, 1],
          delay: side === 'P1' ? 0 : 0.15,
        }}
        style={{ transformStyle: 'preserve-3d', perspective: 800 }}
      >
        <PlayerCard player={player} selected={isWinner} />
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
  // Birkaç şablon string-tipi gibi davranır (ay adı, yıl)
  const skipCountUp =
    templateId === 'q30_later_birth_month' || templateId === 'q18_earlier_debut';
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
