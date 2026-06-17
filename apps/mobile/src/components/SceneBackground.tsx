import { useEffect, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { backgrounds, type BackgroundKey } from '../theme/backgrounds';
import { colors, motion } from '../theme';

/**
 * Tam ekran sahne arka planı + sahneler arası CROSS-FADE.
 *
 * Web karşılığı: apps/web/src/components/SceneBackground.tsx
 * `backgroundKey` değişince: eski katman yerinde kalır, üstüne yeni katman
 * opacity 0→1 ile biner (700ms, web'in imza ease-out'u). Böylece sert kesme
 * yok, sinematik geçiş var. Üstte okunabilirlik için gradient overlay.
 */
export function SceneBackground({
  backgroundKey,
  overlay = 'balanced',
}: {
  backgroundKey: BackgroundKey;
  overlay?: 'balanced' | 'dark' | 'final';
}) {
  const { width, height } = useWindowDimensions();
  // Görünür alttaki (kalıcı) ve üstteki (fade-in) katman.
  const [base, setBase] = useState<BackgroundKey>(backgroundKey);
  const [incoming, setIncoming] = useState<BackgroundKey | null>(null);
  const fade = useSharedValue(0);

  useEffect(() => {
    if (backgroundKey === base) return;
    // Yeni anahtar geldi: üst katmanı ayarla, 0→1 fade et, bitince taban yap.
    setIncoming(backgroundKey);
    fade.value = 0;
    fade.value = withTiming(1, {
      duration: motion.duration.bg,
      easing: Easing.bezier(...motion.easeOutBezier),
    });
  }, [backgroundKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fade bittikten sonra taban katmanı yeni görsele sabitle (sıçrama olmadan).
  useEffect(() => {
    if (incoming === null) return;
    const t = setTimeout(() => {
      setBase(incoming);
      setIncoming(null);
      fade.value = 0;
    }, motion.duration.bg + 30);
    return () => clearTimeout(t);
  }, [incoming]); // eslint-disable-line react-hooks/exhaustive-deps

  const incomingStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  const overlayColors = OVERLAYS[overlay];

  return (
    <View style={[styles.root, { width, height }]} pointerEvents="none">
      <Image
        source={backgrounds[base]}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        cachePolicy="memory-disk"
        priority="high"
      />
      {incoming !== null && (
        <Animated.View style={[StyleSheet.absoluteFill, incomingStyle]}>
          <Image
            source={backgrounds[incoming]}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        </Animated.View>
      )}
      <LinearGradient
        colors={overlayColors}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

// Okunabilirlik katmanı — sahneye göre koyuluk. Web overlay mantığının karşılığı.
const OVERLAYS: Record<string, readonly [string, string, string]> = {
  balanced: ['rgba(6,26,14,0.35)', 'rgba(6,26,14,0.15)', 'rgba(6,26,14,0.7)'],
  dark: ['rgba(6,26,14,0.6)', 'rgba(6,26,14,0.4)', 'rgba(6,26,14,0.85)'],
  // Final: sıcak altın atmosferi (kupa anı) — üstte hafif gold, altta koyu.
  final: ['rgba(240,193,75,0.18)', 'rgba(6,26,14,0.3)', 'rgba(6,26,14,0.85)'],
};

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: colors.pitch.deep,
  },
});
