import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Canvas, Circle, Group, Path, Skia } from '@shopify/react-native-skia';
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
 * Top Skia ile çizilir (emoji yerine — emoji platforma göre kırpılıyordu).
 * Sağ-sola süzülürken zıplayan + dönen top, altında küçülüp büyüyen gölge.
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
          style={[styles.ball, { width: size, height: size, left: size }, ballStyle]}
        >
          <SoccerBall size={size} />
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

/**
 * Skia ile çizilen futbol topu: beyaz daire + merkez siyah beşgen + 5 dış beşgen.
 * Tam yuvarlak, kırpılmaz (emoji sorunu çözüldü).
 */
function SoccerBall({ size }: { size: number }) {
  const c = size / 2;
  const r = size / 2 - 1;

  // viewBox 0..100 koordinatlarını gerçek boyuta ölçekle.
  const s = size / 100;
  const px = (x: number) => x * s;

  // Merkez beşgen + 5 dış beşgen (web BallLoader geometrisi). PathBuilder (yeni API).
  const pentagon = (cx: number, cy: number, pr: number, startDeg: number) => {
    const b = Skia.PathBuilder.Make();
    for (let i = 0; i < 5; i++) {
      const a = ((startDeg + i * 72) * Math.PI) / 180;
      const x = px(cx + pr * Math.cos(a));
      const y = px(cy + pr * Math.sin(a));
      if (i === 0) b.moveTo(x, y);
      else b.lineTo(x, y);
    }
    b.close();
    return b.build();
  };

  const center = pentagon(50, 50, 15, -90);
  const outerR = 34;
  const outerPents = [-90, -18, 54, 126, 198].map((a) =>
    pentagon(
      50 + outerR * Math.cos((a * Math.PI) / 180),
      50 + outerR * Math.sin((a * Math.PI) / 180),
      9,
      a + 180,
    ),
  );

  return (
    <Canvas style={{ width: size, height: size }}>
      {/* Beyaz top gövdesi */}
      <Circle cx={c} cy={c} r={r} color="#f1f5f9" />
      <Circle cx={c} cy={c} r={r} color="#11161d" style="stroke" strokeWidth={size * 0.025} />
      {/* Siyah beşgenler */}
      <Group color="#11161d">
        <Path path={center} />
        {outerPents.map((p, i) => (
          <Path key={i} path={p} />
        ))}
      </Group>
    </Canvas>
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
