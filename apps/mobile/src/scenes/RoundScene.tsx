import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import type { Player } from '@futbol-kart/shared-types';
import type { SessionState, RoundLog } from '@futbol-kart/game-engine';
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
  questionTitle,
  playersById,
  yourName,
  oppName,
  onPlayCard,
  onAck,
}: {
  state: SessionState;
  questionTitle: string;
  playersById: Map<string, Player>;
  yourName: string;
  oppName: string;
  onPlayCard: (cardId: string) => void;
  onAck: () => void;
}) {
  const playSfx = useSfx();
  const scene = state.scene;
  const lastLog: RoundLog | undefined = state.history[state.history.length - 1];

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

      {/* Alt alan: PLAY'de el, RESULT'ta devam */}
      {scene === 'ROUND_PLAY' && (
        <View style={styles.handArea}>
          <Text style={styles.handHint}>
            {state.currentP1Card ? 'Rakip bekleniyor...' : 'Bir kart oyna'}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.hand}
          >
            {state.p1Hand.map((id) => {
              const p = playersById.get(id);
              if (!p) return null;
              const disabled = !!state.currentP1Card;
              return (
                <Pressable
                  key={id}
                  disabled={disabled}
                  onPress={() => {
                    haptics.medium();
                    onPlayCard(id);
                  }}
                  style={disabled && { opacity: 0.5 }}
                >
                  <PlayerCard player={p} width={88} side="red" />
                </Pressable>
              );
            })}
          </ScrollView>
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
