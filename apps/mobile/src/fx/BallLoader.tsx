import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
  cancelAnimation,
  interpolate,
} from 'react-native-reanimated';
import { colors } from '../theme';

/**
 * Futbol topu yükleme/bekleme animasyonu. Web karşılığı: BallLoader.tsx
 *
 * Bekleme ekranlarında (rakip aranıyor, el bekleniyor) kullanıcı sıkılmasın diye:
 * sağ-sola süzülürken zıplayan + dönen bir top, altında küçülüp büyüyen gölge.
 * Saf Reanimated (UI thread) — hafif ve akıcı.
 */
export function BallLoader({
  label,
  sub,
  size = 56,
}: {
  label?: string;
  sub?: string;
  size?: number;
}) {
  // İki bağımsız faz: bounce (zıplama, 0.6s) ve sway (yatay, 1.2s).
  const bounce = useSharedValue(0);
  const sway = useSharedValue(0);
  const spin = useSharedValue(0);

  useEffect(() => {
    bounce.value = withRepeat(
      withTiming(1, { duration: 600, easing: Easing.out(Easing.quad) }),
      -1,
      true,
    );
    sway.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    spin.value = withRepeat(
      withTiming(1, { duration: 2000, easing: Easing.linear }),
      -1,
      false,
    );
    return () => {
      cancelAnimation(bounce);
      cancelAnimation(sway);
      cancelAnimation(spin);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const ballStyle = useAnimatedStyle(() => {
    const x = interpolate(sway.value, [0, 1], [-size, size]);
    const y = interpolate(bounce.value, [0, 1], [0, size * 0.9]);
    const rot = interpolate(spin.value, [0, 1], [0, 360]);
    return {
      transform: [{ translateX: x }, { translateY: y }, { rotate: `${rot}deg` }],
    };
  });

  const shadowStyle = useAnimatedStyle(() => {
    const x = interpolate(sway.value, [0, 1], [-size, size]);
    const sx = interpolate(bounce.value, [0, 1], [1, 0.5]);
    const op = interpolate(bounce.value, [0, 1], [0.4, 0.15]);
    return { transform: [{ translateX: x }, { scaleX: sx }], opacity: op };
  });

  return (
    <View style={styles.wrap}>
      <View style={{ width: size * 3, height: size * 1.8 }}>
        <Animated.View
          style={[
            styles.ball,
            { width: size, height: size, left: size }, // konteynerde yatay merkez
            ballStyle,
          ]}
        >
          <Text style={{ fontSize: size * 0.92 }}>⚽</Text>
        </Animated.View>
        <Animated.View
          style={[
            styles.shadow,
            { width: size * 0.8, height: size * 0.2, left: size + size * 0.1 },
            shadowStyle,
          ]}
        />
      </View>

      {(label || sub) && (
        <View style={styles.textWrap}>
          {label ? <Text style={styles.label}>{label}</Text> : null}
          {sub ? <Text style={styles.sub}>{sub}</Text> : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: 24,
  },
  ball: {
    position: 'absolute',
    top: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shadow: {
    position: 'absolute',
    bottom: 0,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  textWrap: {
    alignItems: 'center',
  },
  label: {
    color: colors.text.primary,
    fontSize: 18,
    fontWeight: '700',
  },
  sub: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 14,
    marginTop: 4,
  },
});
