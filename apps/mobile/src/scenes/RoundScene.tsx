import { useEffect, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import type { Player } from '@futbol-kart/shared-types';
import {
  canUseMultiplier,
  canUseTransfer,
  transferableCards,
  revealHand,
  type SessionState,
  type RoundLog,
  type FlowContext,
} from '@futbol-kart/game-engine';
import { templateById } from '@futbol-kart/question-templates';
import { PlayerCard } from '../components/PlayerCard';
import { CountUp, WinFx } from '../fx';
import { colors, radius } from '../theme';
import { haptics } from '../lib/haptics';
import { useSfx } from '../lib/useSfx';

/**
 * Tur sahnesi (ROUND_PLAY / ROUND_REVEAL / ROUND_RESULT). Web karşılığı:
 * RoundScene.tsx (sadeleştirildi). İç durum state.scene'e göre:
 *   PLAY   → soru + P1 elinden kart seç (bot otomatik oynar)
 *   REVEAL → iki kart açık + değerler + WinFx
 *   RESULT → kazanan + skor + devam
 */
export function RoundScene({
  state,
  flow,
  questionTitle,
  playersById,
  isBot,
  yourName,
  oppName,
  onPlayCard,
  onMultiplier,
  onReveal,
  onTransfer,
  onAck,
}: {
  state: SessionState;
  flow: FlowContext | null;
  questionTitle: string;
  playersById: Map<string, Player>;
  /** vs-bot mu? (P2 otomatik oynar — hot-seat'te P2 de manuel seçer.) */
  isBot: boolean;
  yourName: string;
  oppName: string;
  onPlayCard: (side: 'P1' | 'P2', cardId: string) => void;
  onMultiplier: (side: 'P1' | 'P2') => void;
  onReveal: (side: 'P1' | 'P2') => void;
  onTransfer: (side: 'P1' | 'P2') => void;
  onAck: () => void;
}) {
  const playSfx = useSfx();
  const scene = state.scene;
  const lastLog: RoundLog | undefined = state.history[state.history.length - 1];

  // Aktif oyuncu: P1 henüz oynamadıysa P1, oynadıysa P2 (web ile aynı mantık).
  // Bot modunda P2'yi useOfflineGame otomatik oynatır → aktif el yalnız P1.
  const activeSide: 'P1' | 'P2' = state.currentP1Card === null ? 'P1' : 'P2';
  const activeHand = activeSide === 'P1' ? state.p1Hand : state.p2Hand;
  const activeName = activeSide === 'P1' ? yourName : oppName;
  // Hot-seat'te P2 sırasındayken el gösterilir; bot modunda P2 otomatik (el yok).
  const showHand = scene === 'ROUND_PLAY' && !(isBot && activeSide === 'P2');

  // ── Jokerler (aktif oyuncu için) ─────────────────────────────────────────────
  const template = state.currentQuestionId ? templateById(state.currentQuestionId) : null;
  const activeJokers = activeSide === 'P1' ? state.p1Jokers : state.p2Jokers;
  const revealActive = activeSide === 'P1' ? state.p1RevealActive : state.p2RevealActive;
  // Çarpan: soru uygun + henüz kullanılmamış + bu turda kart oynanmamış.
  const canMultiplier =
    showHand && canUseMultiplier(template ?? null) && !activeJokers.multiplierUsed;
  const canReveal = showHand && !activeJokers.revealUsed;
  const multiplierPendingHere = state.pendingMultiplier === activeSide;
  // Transfer: hak var + son tur değil + kendi havuzu boş değil + henüz oynamadı.
  const isLastRound = state.roundIndex + 1 >= state.totalRounds;
  const ownPool =
    activeSide === 'P1'
      ? transferableCards(state.p1Hand, state.p1BonusCards, state.transferLockedIds)
      : transferableCards(state.p2Hand, state.p2BonusCards, state.transferLockedIds);
  const canTransfer =
    showHand && canUseTransfer(activeJokers.transferUsed, isLastRound, ownPool.length);

  // Reveal jokeri aktifse: aktif elin her kartının bu sorudaki değeri.
  const revealValues = useMemo(() => {
    if (!revealActive || !flow || !template) return null;
    const map = new Map<string, number | boolean | null>();
    for (const rv of revealHand(flow, template, activeHand)) map.set(rv.cardId, rv.value);
    return map;
  }, [revealActive, flow, template, activeHand]);

  // Reveal sesi
  useEffect(() => {
    if (scene === 'ROUND_REVEAL') {
      playSfx('flip');
      haptics.heavy();
    }
    if (scene === 'ROUND_RESULT' && lastLog) {
      if (lastLog.winner === 'tie') playSfx('tie');
      else playSfx('win');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);

  const p1Card = state.currentP1Card ? playersById.get(state.currentP1Card) : undefined;
  const p2Card = state.currentP2Card ? playersById.get(state.currentP2Card) : undefined;

  return (
    <SafeAreaView style={styles.root}>
      {/* Skor + tur */}
      <View style={styles.topBar}>
        <ScoreChip name={yourName} score={state.p1Score} color={colors.side.red} />
        <Text style={styles.roundNo}>
          Tur {state.roundIndex + 1}/{state.totalRounds}
        </Text>
        <ScoreChip name={oppName} score={state.p2Score} color={colors.side.blue} align="right" />
      </View>

      {/* Soru */}
      <Animated.View entering={FadeIn.duration(300)} style={styles.questionBox}>
        <Text style={styles.questionLabel}>SORU</Text>
        <Text style={styles.question}>{questionTitle}</Text>
      </Animated.View>

      {/* Kart alanı */}
      <View style={styles.arena}>
        {/* P1 (sen) */}
        <View style={styles.slot}>
          <Text style={[styles.slotName, { color: colors.side.red }]}>{yourName}</Text>
          {p1Card ? (
            <PlayerCard player={p1Card} width={120} side="red" />
          ) : (
            <PlayerCard faceDown side="red" width={120} />
          )}
          {scene !== 'ROUND_PLAY' && lastLog && (
            <RevealValue value={lastLog.p1Value} win={lastLog.winner === 'P1'} />
          )}
        </View>

        <Text style={styles.vs}>VS</Text>

        {/* P2 (rakip) */}
        <View style={styles.slot}>
          <Text style={[styles.slotName, { color: colors.side.blue }]}>{oppName}</Text>
          {scene === 'ROUND_PLAY' || !p2Card ? (
            <PlayerCard faceDown side="blue" width={120} />
          ) : (
            <PlayerCard player={p2Card} width={120} side="blue" />
          )}
          {scene !== 'ROUND_PLAY' && lastLog && (
            <RevealValue value={lastLog.p2Value} win={lastLog.winner === 'P2'} />
          )}
        </View>
      </View>

      {/* Alt alan: aktif oyuncunun eli (hot-seat'te P1 sonra P2; bot otomatik) */}
      {showHand && (
        <View style={styles.handArea}>
          {/* Joker barı */}
          <View style={styles.jokerBar}>
            <JokerButton
              label={multiplierPendingHere ? '✓ Çarpan' : '×2 Çarpan'}
              active={multiplierPendingHere}
              disabled={!canMultiplier || multiplierPendingHere}
              onPress={() => {
                playSfx('joker');
                haptics.medium();
                onMultiplier(activeSide);
              }}
            />
            <JokerButton
              label={revealActive ? '✓ Değerler' : '👁 Değerleri Gör'}
              active={!!revealActive}
              disabled={!canReveal || !!revealActive}
              onPress={() => {
                playSfx('joker');
                haptics.medium();
                onReveal(activeSide);
              }}
            />
            {canTransfer && (
              <JokerButton
                label="🔄 Transfer"
                active={false}
                disabled={false}
                onPress={() => {
                  playSfx('joker');
                  haptics.medium();
                  onTransfer(activeSide);
                }}
              />
            )}
          </View>

          <Text style={styles.handHint}>
            {isBot ? 'Bir kart oyna' : `${activeName} · bir kart oyna`}
            {activeHand.length > 4 ? '  (← kaydır →)' : ''}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator
            contentContainerStyle={styles.hand}
          >
            {activeHand.map((id) => {
              const p = playersById.get(id);
              if (!p) return null;
              const revealVal = revealValues?.get(id);
              return (
                <Pressable
                  key={id}
                  onPress={() => {
                    haptics.medium();
                    onPlayCard(activeSide, id);
                  }}
                >
                  <View>
                    <PlayerCard
                      player={p}
                      width={76}
                      side={activeSide === 'P1' ? 'red' : 'blue'}
                    />
                    {/* Reveal jokeri: kartın bu sorudaki değeri rozet olarak */}
                    {revealValues && (
                      <View style={styles.revealBadge}>
                        <Text style={styles.revealBadgeText}>
                          {typeof revealVal === 'number'
                            ? revealVal
                            : revealVal === true
                              ? '✓'
                              : revealVal === false
                                ? '✗'
                                : '—'}
                        </Text>
                      </View>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Bot oynarken bekleme göstergesi */}
      {scene === 'ROUND_PLAY' && isBot && activeSide === 'P2' && (
        <View style={styles.handArea}>
          <Text style={styles.handHint}>Bot oynuyor...</Text>
        </View>
      )}

      {scene === 'ROUND_RESULT' && lastLog && (
        <Animated.View entering={FadeInUp.duration(400)} style={styles.resultArea}>
          <Text style={styles.resultText}>
            {lastLog.winner === 'tie'
              ? 'Berabere!'
              : `${lastLog.winner === 'P1' ? yourName : oppName} kazandı!`}
          </Text>
          <Pressable
            onPress={() => {
              haptics.light();
              onAck();
            }}
            style={styles.continueBtn}
          >
            <Text style={styles.continueText}>Devam →</Text>
          </Pressable>
        </Animated.View>
      )}

      {/* Kazanma efekti */}
      {scene === 'ROUND_RESULT' && lastLog && lastLog.winner !== 'tie' && (
        <WinFx side={lastLog.winner} fireKey={state.roundIndex} />
      )}
    </SafeAreaView>
  );
}

function JokerButton({
  label,
  active,
  disabled,
  onPress,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.jokerBtn,
        active && styles.jokerBtnActive,
        disabled && !active && styles.jokerBtnDisabled,
      ]}
    >
      <Text style={[styles.jokerBtnText, active && styles.jokerBtnTextActive]}>{label}</Text>
    </Pressable>
  );
}

function ScoreChip({
  name,
  score,
  color,
  align = 'left',
}: {
  name: string;
  score: number;
  color: string;
  align?: 'left' | 'right';
}) {
  return (
    <View style={{ alignItems: align === 'right' ? 'flex-end' : 'flex-start' }}>
      <Text style={[styles.chipName, { color }]} numberOfLines={1}>
        {name}
      </Text>
      <Text style={styles.chipScore}>{score}</Text>
    </View>
  );
}

function RevealValue({ value, win }: { value: number | boolean | null; win: boolean }) {
  const display =
    typeof value === 'number' ? (
      <CountUp target={value} style={[styles.revealNum, win && styles.revealWin]} />
    ) : (
      <Text style={[styles.revealNum, win && styles.revealWin]}>
        {value === true ? 'Evet' : value === false ? 'Hayır' : '—'}
      </Text>
    );
  return <View style={styles.revealBox}>{display}</View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 16 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
  },
  chipName: { fontSize: 12, fontWeight: '800', maxWidth: 90 },
  chipScore: { color: colors.text.primary, fontSize: 24, fontWeight: '900' },
  roundNo: { color: colors.text.muted, fontSize: 13, fontWeight: '700' },
  questionBox: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: radius.md,
    padding: 14,
    marginTop: 12,
    alignItems: 'center',
  },
  questionLabel: {
    color: colors.accent.gold,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
  },
  question: {
    color: colors.text.primary,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 22,
  },
  arena: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    flex: 1,
  },
  slot: { alignItems: 'center', gap: 8 },
  slotName: { fontSize: 13, fontWeight: '800' },
  vs: { color: colors.accent.goldHi, fontSize: 18, fontWeight: '900' },
  revealBox: { marginTop: 4 },
  revealNum: {
    color: colors.text.primary,
    fontSize: 26,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  revealWin: { color: colors.accent.goldHi },
  handArea: { paddingBottom: 12 },
  handHint: { color: colors.text.muted, fontSize: 13, textAlign: 'center', marginBottom: 8 },
  hand: { gap: 8, paddingHorizontal: 4 },
  jokerBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 8,
  },
  jokerBtn: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(240,193,75,0.45)',
    backgroundColor: 'rgba(240,193,75,0.12)',
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  jokerBtnActive: {
    backgroundColor: colors.accent.gold,
    borderColor: colors.accent.goldHi,
  },
  jokerBtnDisabled: {
    opacity: 0.35,
  },
  jokerBtnText: {
    color: colors.accent.goldHi,
    fontSize: 12,
    fontWeight: '800',
  },
  jokerBtnTextActive: {
    color: '#1f1500',
  },
  revealBadge: {
    position: 'absolute',
    top: -6,
    alignSelf: 'center',
    minWidth: 28,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: colors.pitch.neon,
    alignItems: 'center',
  },
  revealBadgeText: {
    color: '#06210f',
    fontSize: 12,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  resultArea: { alignItems: 'center', paddingBottom: 24, gap: 12 },
  resultText: { color: colors.accent.goldHi, fontSize: 22, fontWeight: '900' },
  continueBtn: {
    backgroundColor: colors.accent.gold,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: radius.pill,
  },
  continueText: { color: '#1f1500', fontSize: 16, fontWeight: '800' },
});
