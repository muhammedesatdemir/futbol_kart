import { useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Canvas, Circle, Group } from '@shopify/react-native-skia';
import type { PlayerSide } from '@futbol-kart/shared-types';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { motion } from '../theme';

/** Taraf rengi + altın karışım paleti. Web WinFx ile aynı. */
const SIDE_COLORS: Record<PlayerSide, string[]> = {
  P1: ['#ef4444', '#f0c14b', '#ffe8a8', '#ffd76b'],
  P2: ['#3b82f6', '#f0c14b', '#ffe8a8', '#ffd76b'],
};
const HALO: Record<PlayerSide, string> = {
  P1: 'rgba(239,68,68,0.30)',
  P2: 'rgba(59,130,246,0.30)',
};

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
}

const DURATION = 640;
const COUNT = 18;

/**
 * Tur kazanma efekti — iki katman (web WinFx.tsx karşılığı):
 *   1. Kazanan tarafın merkezinden Skia kıvılcım patlaması (yerçekimiyle düşer).
 *   2. Dışa açılan altın+taraf halo dalgası (Reanimated scale/opacity).
 *
 * fireKey değişince yeniden patlar. ~640ms sonra kendini söndürür → çağıran
 * tarafın bunu mount/unmount etmesi gerekir (kısa ömürlü).
 */
export function WinFx({ side, fireKey }: { side: PlayerSide; fireKey: string | number }) {
  const { width, height } = useWindowDimensions();
  const cx = width / 2;
  const cy = height * 0.42;

  const [sparks, setSparks] = useState<Spark[]>([]);
  const [alpha, setAlpha] = useState(1);
  const haloScale = useSharedValue(0.2);
  const haloOpacity = useSharedValue(0.85);

  useEffect(() => {
    const colors = SIDE_COLORS[side];
    // Partikülleri merkezden radyal fırlat (hafif yukarı bias).
    let parts: Spark[] = Array.from({ length: COUNT }, (_, i) => {
      const angle = (Math.PI * 2 * i) / COUNT + (i % 2) * 0.3;
      const speed = 3 + (i % 5) * 1.6;
      return {
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2.5,
        size: 3 + (i % 3),
        color: colors[i % colors.length],
      };
    });
    setSparks(parts);
    setAlpha(1);

    // Halo dalgası.
    haloScale.value = 0.2;
    haloOpacity.value = 0.85;
    haloScale.value = withTiming(1.5, {
      duration: 620,
      easing: Easing.bezier(...motion.easeOutBezier),
    });
    haloOpacity.value = withTiming(0, { duration: 620 });

    let raf = 0;
    let start: number | null = null;
    const tick = (ts: number) => {
      if (start === null) start = ts;
      const t = ts - start;
      parts = parts.map((s) => ({
        ...s,
        x: s.x + s.vx,
        y: s.y + s.vy,
        vx: s.vx * 0.98,
        vy: s.vy + 0.22, // yerçekimi
      }));
      setSparks([...parts]);
      setAlpha(Math.max(0, 1 - t / DURATION));
      if (t < DURATION) raf = requestAnimationFrame(tick);
      else setSparks([]);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [side, fireKey]);

  const haloStyle = useAnimatedStyle(() => ({
    opacity: haloOpacity.value,
    transform: [{ scale: haloScale.value }],
  }));
  const haloSize = Math.min(width, height) * 0.9;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Halo dalgası — radial gradient yerine yumuşak renkli daire + Reanimated */}
      <Animated.View
        style={[
          styles.halo,
          {
            width: haloSize,
            height: haloSize,
            borderRadius: haloSize / 2,
            backgroundColor: HALO[side],
            left: cx - haloSize / 2,
            top: cy - haloSize / 2,
          },
          haloStyle,
        ]}
      />
      {/* Kıvılcımlar — Skia canvas */}
      <Canvas style={StyleSheet.absoluteFill}>
        <Group opacity={alpha}>
          {sparks.map((s, i) => (
            <Circle key={i} cx={s.x} cy={s.y} r={s.size * (0.4 + alpha * 0.6)} color={s.color} />
          ))}
        </Group>
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  halo: {
    position: 'absolute',
  },
});
