import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import { PrimaryButton } from '../components/Buttons';
import { colors } from '../theme';

/**
 * Cihaz devri sahnesi (HANDOFF). Web karşılığı: HandoffScene.tsx
 * Hotseat'te P1 elini seçtikten sonra cihazı P2'ye vermesi için ara ekran.
 */
export function HandoffScene({
  nextName,
  onContinue,
}: {
  nextName: string;
  onContinue: () => void;
}) {
  return (
    <SafeAreaView style={styles.root}>
      <Animated.View entering={FadeIn.duration(400)} style={styles.center}>
        <Text style={styles.emoji}>📱➡️</Text>
        <Text style={styles.title}>Cihazı {nextName}'e ver</Text>
        <Text style={styles.sub}>
          Sıra {nextName}'de. Diğer oyuncunun kartlarını görme!
        </Text>
        <View style={{ height: 32 }} />
        <PrimaryButton label="Hazırım" pulse={false} onPress={onContinue} />
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 24, justifyContent: 'center' },
  center: { alignItems: 'center' },
  emoji: { fontSize: 56, marginBottom: 16 },
  title: { color: colors.text.primary, fontSize: 24, fontWeight: '900', textAlign: 'center' },
  sub: { color: colors.text.muted, fontSize: 15, textAlign: 'center', marginTop: 8, maxWidth: 280, lineHeight: 21 },
});
