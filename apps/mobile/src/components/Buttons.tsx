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
 * PrimaryButton — web `.btn-primary` + `cta-pulse`/`cta-ring` karşılığı.
 *
 * Native "his" katmanı (web'de YOK):
 *   - Basınca spring ile küçülür (press-scale 0.95) → dokunuş fiziksel hissedilir.
 *   - Haptic geri bildirim (medium impact) → parmakta titreşim.
 *   - HALO: butonun arkasında, ondan geniş, yumuşak altın bir katman sürekli
 *     yavaşça büyüyüp sönerek "nefes alır" (scale 1→1.18, opacity 0.55→0).
 *     Yormayan, dikkat çeken canlı bir gölge — kullanıcının istediği efekt.
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
    // Nefes ritmi: 0↔1, 1900ms — yavaş ve sakin, göz yormaz.
    glow.value = withRepeat(
      withTiming(1, { duration: 1900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => cancelAnimation(glow);
  }, [pulse]); // eslint-disable-line react-hooks/exhaustive-deps

  const buttonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    // Butonun kendi gölgesi de nabızla hafifçe güçlenir (ekstra derinlik).
    shadowRadius: 20 + glow.value * 14,
    shadowOpacity: 0.3 + glow.value * 0.3,
  }));

  // Arkadaki halo: büyür + sönükleşir. glow 0→1 boyunca scale 1→1.18, opacity 0.55→0.
  const haloStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + glow.value * 0.18 }],
    opacity: (0.55 - glow.value * 0.55) * (pulse ? 1 : 0),
  }));

  return (
    <View style={styles.primaryWrap}>
      {/* HALO — butonun arkasında, geniş, yumuşak altın katman */}
      <Animated.View pointerEvents="none" style={[styles.halo, haloStyle]} />

      <AnimatedPressable
        onPressIn={() => {
          scale.value = withSpring(0.95, motion.spring.snappy);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }}
        onPressOut={() => {
          scale.value = withSpring(1, motion.spring.snappy);
        }}
        onPress={onPress}
        style={[styles.primaryShadow, buttonStyle, style]}
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
    </View>
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
  primaryWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Halo: butonun arkasında, ondan geniş; nefes alan yumuşak altın gölge.
  halo: {
    position: 'absolute',
    width: 220,
    height: 92,
    borderRadius: radius.pill,
    backgroundColor: colors.accent.goldHi,
    // Yumuşak kenar hissi: gölgeyi halonun kendisine de uygula (Android'de elevation
    // yerine geniş shadowRadius bulanıklık verir).
    shadowColor: colors.accent.goldHi,
    shadowOpacity: 0.9,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 0 },
  },
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
