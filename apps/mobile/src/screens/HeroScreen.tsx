import { useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
} from 'react-native-reanimated';
import { SceneBackground } from '../components/SceneBackground';
import { PrimaryButton, GhostButton } from '../components/Buttons';
import { colors, motion } from '../theme';
import { logos } from '../theme/assets';

/**
 * FAZ 1 — "HİS" PROTOTİPİ.
 *
 * Amaç: tek ekranda "web değil, OYUN" hissini kanıtlamak. Yöntem:
 *   - Tam ekran sinematik 9:16 arka plan (stadyum + neon + altın futbolcular).
 *   - Sahne açılışında öğeler STAGGERED (sırayla) süzülerek girer — TV jeneriği gibi.
 *   - CTA sürekli nabız atan altın glow + basınca spring + haptic.
 *
 * Bu ekran web ana sayfasının (apps/web/src/components/HomeHero.tsx) mobil ruhu.
 */
export function HeroScreen({ onPlay }: { onPlay?: () => void }) {
  const D = motion.duration;
  const [howToOpen, setHowToOpen] = useState(false);

  return (
    <View style={styles.root}>
      <SceneBackground backgroundKey="home" overlay="balanced" />

      <SafeAreaView style={styles.safe}>
        {/* Üst blok: logo + kelime markası — yukarıdan süzülür */}
        <View style={styles.top}>
          <Animated.View entering={FadeInDown.duration(D.slow).springify().damping(14)}>
            <Image source={logos.shield} style={styles.logo} contentFit="contain" />
          </Animated.View>

          <Animated.Text
            entering={FadeInDown.delay(140).duration(D.slow)}
            style={styles.brand}
          >
            DerbyGoal
          </Animated.Text>

          <Animated.Text
            entering={FadeIn.delay(320).duration(D.slow)}
            style={styles.tagline}
          >
            Futbol kartlarıyla kapış. Sürpriz soru, kör kart, tek kazanan.
          </Animated.Text>
        </View>

        {/* CTA'lar — ekranın DİKEY ORTASINDA, staggered girer */}
        <Animated.View
          entering={FadeInUp.delay(480).duration(D.slow)}
          style={styles.actions}
        >
          <PrimaryButton
            label="Oyna"
            pulse
            onPress={() => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              onPlay?.();
            }}
          />
          <View style={{ height: 14 }} />
          <GhostButton label="Nasıl oynanır?" onPress={() => setHowToOpen(true)} />
        </Animated.View>

        {/* Alt boşluk — layout'u dengelemek için (top ↔ center ↔ bu) */}
        <View style={styles.bottomSpacer} />
      </SafeAreaView>

      <HowToModal visible={howToOpen} onClose={() => setHowToOpen(false)} />
    </View>
  );
}

/** Basit kurallar modalı — VS Düello nasıl oynanır. */
function HowToModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Nasıl oynanır?</Text>
          {[
            ['🃏', 'Kör seçim', 'Önce 8 futbolcu kartını seçersin — hangi soruya hangisini süreceğini bilmeden.'],
            ['❓', 'Sürpriz soru', 'Her turda rastgele bir karşılaştırma sorusu çıkar (gol, boy, maç sayısı...).'],
            ['⚔️', 'Kapış', 'Sen ve rakip birer kart sürer; sorunun cevabına göre kazanan turu alır.'],
            ['🏆', 'Kazan', '7 tur sonunda en çok turu kazanan oyunu kazanır.'],
          ].map(([emoji, title, desc]) => (
            <View key={title} style={styles.ruleRow}>
              <Text style={styles.ruleEmoji}>{emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.ruleTitle}>{title}</Text>
                <Text style={styles.ruleDesc}>{desc}</Text>
              </View>
            </View>
          ))}
          <View style={{ height: 8 }} />
          <PrimaryButton label="Anladım" pulse={false} onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.pitch.deep,
  },
  safe: {
    flex: 1,
    paddingHorizontal: 28,
    paddingVertical: 24,
  },
  top: {
    alignItems: 'center',
    marginTop: 24,
  },
  // actions flex:1 ile esner → butonlar top ile bottomSpacer arasının ORTASINDA.
  bottomSpacer: {
    height: 64,
  },
  logo: {
    width: 96,
    height: 96,
  },
  brand: {
    color: colors.accent.goldHi,
    fontSize: 44,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginTop: 12,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 12,
  },
  tagline: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 22,
    maxWidth: 300,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  actions: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#0a2614',
    borderColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderRadius: 20,
    padding: 24,
  },
  modalTitle: {
    color: colors.accent.goldHi,
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 16,
    textAlign: 'center',
  },
  ruleRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
    alignItems: 'flex-start',
  },
  ruleEmoji: { fontSize: 24 },
  ruleTitle: { color: colors.text.primary, fontSize: 15, fontWeight: '800' },
  ruleDesc: { color: colors.text.muted, fontSize: 13, marginTop: 2, lineHeight: 18 },
});
