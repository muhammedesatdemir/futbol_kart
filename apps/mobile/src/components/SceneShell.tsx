import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { StyleSheet, type ViewStyle } from 'react-native';
import { motion } from '../theme';

/**
 * Sahne geçiş kabuğu. Web karşılığı: SceneShell.tsx
 * Her sahneyi sarar; mount/unmount'ta yumuşak fade (AnimatePresence yerine
 * Reanimated layout animasyonları). sceneKey değişince yeni mount → yeni giriş.
 */
export function SceneShell({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return (
    <Animated.View
      entering={FadeIn.duration(motion.duration.fast)}
      exiting={FadeOut.duration(motion.duration.fast)}
      style={[styles.root, style]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
