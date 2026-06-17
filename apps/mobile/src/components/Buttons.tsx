import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  withRepeat,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { colors, motion, radius } from '../theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * PrimaryButton — web `.btn-primary` + `cta-pulse` karşılığı.
 *
 * Native "his" katmanı (web'de YOK):
 *   - Basınca spring ile küçülür (press-scale 0.95) → dokunuş fiziksel hissedilir.
 *   - Haptic geri bildirim (medium impact) → parmakta titreşim.
 *   - Sürekli nabız atan altın glow (pulse) → dikkat çeker, "canlı" durur.
 */
export function PrimaryButton({
  label,
  onPress,
  pulse = true,
  style,
}: {
  label: string;
  onPress?: () => void;
  pulse?: boolean;
  style?: ViewStyle;
}) {
  const scale = useSharedValue(1);
  const glow = useSharedValue(0);

  useEffect(() => {
    if (!pulse) return;
    // cta-pulse: glow yoğunluğu 0↔1 gidip gelir (2.6s, web ile aynı ritim).
    glow.value = withRepeat(
      withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => cancelAnimation(glow);
  }, [pulse]); // eslint-disable-line react-hooks/exhaustive-deps

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    shadowRadius: 24 + glow.value * 20, // 24→44px, cta-pulse aralığı
    shadowOpacity: 0.35 + glow.value * 0.35, // 0.35→0.7
  }));

  return (
    <AnimatedPressable
      onPressIn={() => {
        scale.value = withSpring(0.95, motion.spring.snappy);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, motion.spring.snappy);
      }}
      onPress={onPress}
      style={[styles.primaryShadow, containerStyle, style]}
    >
      <LinearGradient
        colors={[colors.accent.goldHi, colors.accent.gold]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.primaryInner}
      >
        <Text style={styles.primaryLabel}>{label}</Text>
      </LinearGradient>
    </AnimatedPressable>
  );
}

/**
 * GhostButton — web `.btn-ghost` karşılığı. İnce kenarlık, şeffaf zemin,
 * basınca hafif scale + light haptic.
 */
export function GhostButton({
  label,
  onPress,
  style,
}: {
  label: string;
  onPress?: () => void;
  style?: ViewStyle;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPressIn={() => {
        scale.value = withSpring(0.96, motion.spring.snappy);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, motion.spring.snappy);
      }}
      onPress={onPress}
      style={[animStyle, style]}
    >
      <View style={styles.ghostInner}>
        <Text style={styles.ghostLabel}>{label}</Text>
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  primaryShadow: {
    borderRadius: radius.pill,
    shadowColor: colors.accent.gold,
    shadowOffset: { width: 0, height: 4 },
    elevation: 12,
  },
  primaryInner: {
    paddingVertical: 16,
    paddingHorizontal: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: {
    color: '#1f1500',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  ghostInner: {
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostLabel: {
    color: colors.text.primary,
    fontSize: 15,
    fontWeight: '600',
  },
});
