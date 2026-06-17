import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import type { SessionState } from '@futbol-kart/game-engine';
import { PrimaryButton, GhostButton } from '../components/Buttons';
import { CountUp } from '../fx';
import { colors } from '../theme';
import { haptics } from '../lib/haptics';
import { useSfx } from '../lib/useSfx';

/**
 * Maç sonu sahnesi (FINAL). Web karşılığı: FinalScene.tsx
 * Kazanan + skor + tekrar/ana menü. Konfeti WinFx/efektlerle.
 */
export function FinalScene({
  state,
  yourName,
  oppName,
  onRematch,
  onHome,
}: {
  state: SessionState;
  yourName: string;
  oppName: string;
  onRematch: () => void;
  onHome: () => void;
}) {
  const playSfx = useSfx();
  const winner =
    state.p1Score > state.p2Score ? 'P1' : state.p2Score > state.p1Score ? 'P2' : 'tie';
  const winnerName = winner === 'P1' ? yourName : winner === 'P2' ? oppName : null;

  useEffect(() => {
    playSfx('final');
    haptics.success();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.center}>
        <Animated.Text entering={ZoomIn.duration(500)} style={styles.trophy}>
          🏆
        </Animated.Text>
        <Animated.Text entering={FadeInDown.delay(200).duration(500)} style={styles.title}>
          {winner === 'tie' ? 'Berabere!' : `${winnerName} kazandı!`}
        </Animated.Text>

        <Animated.View entering={FadeInDown.delay(380).duration(500)} style={styles.scoreRow}>
          <View style={styles.scoreCol}>
            <Text style={[styles.scoreName, { color: colors.side.red }]}>{yourName}</Text>
            <CountUp target={state.p1Score} style={styles.scoreNum} delayMs={400} />
          </View>
          <Text style={styles.dash}>–</Text>
          <View style={styles.scoreCol}>
            <Text style={[styles.scoreName, { color: colors.side.blue }]}>{oppName}</Text>
            <CountUp target={state.p2Score} style={styles.scoreNum} delayMs={400} />
          </View>
        </Animated.View>
      </View>

      <Animated.View entering={FadeInDown.delay(560).duration(500)} style={styles.actions}>
        <PrimaryButton label="Tekrar oyna" pulse={false} onPress={onRematch} />
        <View style={{ height: 12 }} />
        <GhostButton label="Ana menü" onPress={onHome} />
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 24, justifyContent: 'space-between' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  trophy: { fontSize: 72 },
  title: { color: colors.accent.goldHi, fontSize: 30, fontWeight: '900', textAlign: 'center' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 20, marginTop: 16 },
  scoreCol: { alignItems: 'center' },
  scoreName: { fontSize: 14, fontWeight: '800' },
  scoreNum: { color: colors.text.primary, fontSize: 48, fontWeight: '900', fontVariant: ['tabular-nums'] },
  dash: { color: colors.text.muted, fontSize: 32, fontWeight: '300' },
  actions: { paddingBottom: 24, alignItems: 'center' },
});
