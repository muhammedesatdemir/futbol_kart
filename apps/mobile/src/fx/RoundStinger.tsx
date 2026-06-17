import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeIn,
  FadeInLeft,
  FadeInRight,
  ZoomIn,
} from 'react-native-reanimated';
import { colors, motion } from '../theme';

/**
 * Tur başı TV-broadcast stinger. Web karşılığı: RoundStinger.tsx
 *
 * İki ince altın çubuk iki kenardan ortaya kayar, ortada tur numarası belirir
 * (~700ms). Sahne ROUND_INTRO'da gösterilir. phaseChip = 'UZATMA'/'PENALTI'.
 */
export function RoundStinger({
  round,
  totalRounds,
  phaseChip,
}: {
  round: number;
  totalRounds: number;
  phaseChip?: string;
}) {
  const { width } = useWindowDimensions();
  const barW = width * 0.42;

  return (
    <Animated.View
      entering={FadeIn.duration(motion.duration.fast)}
      style={styles.root}
      pointerEvents="none"
    >
      <View style={styles.barsRow}>
        {/* Sol çubuk — soldan kayar (transparan→gold) */}
        <Animated.View
          entering={FadeInLeft.duration(550).springify().damping(18)}
          style={[styles.barWrap, { width: barW }]}
        >
          <LinearGradient
            colors={['transparent', colors.accent.goldHi, colors.accent.gold]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.bar}
          />
        </Animated.View>
        {/* Sağ çubuk — sağdan kayar */}
        <Animated.View
          entering={FadeInRight.duration(550).springify().damping(18)}
          style={[styles.barWrap, { width: barW }]}
        >
          <LinearGradient
            colors={[colors.accent.gold, colors.accent.goldHi, 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.bar}
          />
        </Animated.View>
      </View>

      {/* Orta — faz rozeti + tur numarası, gecikmeli zoom-in */}
      <Animated.View entering={ZoomIn.delay(180).duration(320)} style={styles.center}>
        {phaseChip ? (
          <View style={styles.chip}>
            <Text style={styles.chipText}>{phaseChip}</Text>
          </View>
        ) : null}
        <View style={styles.roundRow}>
          <Text style={styles.roundLabel}>TUR</Text>
          <Text style={styles.roundNum}>{round}</Text>
          <Text style={styles.roundTotal}>/ {totalRounds}</Text>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '33%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  barsRow: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
  },
  barWrap: {
    height: 3,
  },
  bar: {
    height: 3,
    width: '100%',
    shadowColor: colors.accent.goldHi,
    shadowOpacity: 0.7,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
  },
  center: {
    alignItems: 'center',
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(240,193,75,0.5)',
    backgroundColor: 'rgba(240,193,75,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  chipText: {
    color: colors.accent.goldHi,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2.2,
    textTransform: 'uppercase',
  },
  roundRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  roundLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2.2,
  },
  roundNum: {
    color: colors.text.primary,
    fontSize: 32,
    fontWeight: '900',
    marginLeft: 4,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 12,
  },
  roundTotal: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
  },
});
