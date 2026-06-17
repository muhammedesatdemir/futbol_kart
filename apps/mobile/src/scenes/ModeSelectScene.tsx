import { StyleSheet, Text, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { colors, radius } from '../theme';
import { haptics } from '../lib/haptics';

/**
 * Rakip seçimi sahnesi (MODE_SELECT). Web karşılığı: ModeSelectScene.tsx
 * İki seçenek: Bot'a karşı (vs-bot) / Aynı cihaz (hotseat). Online Faz 4'te.
 */
export function ModeSelectScene({
  onChoose,
  onBack,
}: {
  onChoose: (mode: 'vs-bot' | 'hotseat') => void;
  onBack?: () => void;
}) {
  return (
    <SafeAreaView style={styles.root}>
      <Animated.Text entering={FadeInDown.duration(400)} style={styles.title}>
        Nasıl oynayalım?
      </Animated.Text>

      <View style={styles.options}>
        <OptionCard
          delay={120}
          emoji="🤖"
          title="Bot'a karşı"
          desc="Rastgele oynayan rakibe karşı tek başına"
          onPress={() => {
            haptics.medium();
            onChoose('vs-bot');
          }}
        />
        <OptionCard
          delay={240}
          emoji="👥"
          title="Aynı cihaz"
          desc="Arkadaşınla sırayla, tek telefonda"
          onPress={() => {
            haptics.medium();
            onChoose('hotseat');
          }}
        />
      </View>

      {onBack && (
        <Pressable onPress={onBack} style={styles.back}>
          <Text style={styles.backText}>← Geri</Text>
        </Pressable>
      )}
    </SafeAreaView>
  );
}

function OptionCard({
  emoji,
  title,
  desc,
  delay,
  onPress,
}: {
  emoji: string;
  title: string;
  desc: string;
  delay: number;
  onPress: () => void;
}) {
  return (
    <Animated.View entering={FadeInDown.delay(delay).duration(450).springify().damping(16)}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      >
        <Text style={styles.emoji}>{emoji}</Text>
        <View style={styles.cardText}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardDesc}>{desc}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  title: {
    color: colors.text.primary,
    fontSize: 26,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 32,
  },
  options: {
    gap: 16,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 20,
  },
  cardPressed: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    transform: [{ scale: 0.98 }],
  },
  emoji: {
    fontSize: 40,
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    color: colors.accent.goldHi,
    fontSize: 19,
    fontWeight: '800',
  },
  cardDesc: {
    color: colors.text.muted,
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  back: {
    position: 'absolute',
    bottom: 32,
    left: 24,
    padding: 8,
  },
  backText: {
    color: colors.text.muted,
    fontSize: 15,
  },
});
