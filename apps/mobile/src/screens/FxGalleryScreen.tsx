import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BallLoader, CountUp, CountdownRing, WinFx, RoundStinger } from '../fx';
import { GhostButton, PrimaryButton } from '../components/Buttons';
import { useSfx } from '../lib/useSfx';
import { useSoundStore } from '../lib/soundStore';
import { haptics } from '../lib/haptics';
import { colors } from '../theme';

/**
 * GEÇİCİ Faz 2 efekt galerisi — emülatörde tüm efektleri tek ekranda denemek için.
 * Faz 3'te navigasyon gelince kaldırılacak. App.tsx'ten basit toggle ile açılır.
 */
export function FxGalleryScreen({ onBack }: { onBack?: () => void }) {
  const playSfx = useSfx();
  const soundOn = useSoundStore((s) => s.enabled);
  const toggleSound = useSoundStore((s) => s.toggle);

  const [winKey, setWinKey] = useState(0);
  const [winSide, setWinSide] = useState<'P1' | 'P2'>('P1');
  const [showWin, setShowWin] = useState(false);

  const [stingerKey, setStingerKey] = useState(0);
  const [showStinger, setShowStinger] = useState(false);

  const [countTarget, setCountTarget] = useState(0);
  const [ringKey, setRingKey] = useState(0);

  const fireWin = (side: 'P1' | 'P2') => {
    setWinSide(side);
    setWinKey((k) => k + 1);
    setShowWin(true);
    playSfx('win');
    haptics.success();
    setTimeout(() => setShowWin(false), 800);
  };

  const fireStinger = () => {
    setStingerKey((k) => k + 1);
    setShowStinger(true);
    playSfx('whistleStart');
    setTimeout(() => setShowStinger(false), 1400);
  };

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.title}>Efekt Galerisi · Faz 2</Text>

          {/* Ses anahtarı */}
          <Section label={`Ses: ${soundOn ? 'AÇIK' : 'KAPALI'}`}>
            <GhostButton label={soundOn ? 'Sesi kapat' : 'Sesi aç'} onPress={toggleSound} />
          </Section>

          {/* CountdownRing */}
          <Section label="Geri Sayım Halkası (Skia)">
            <View style={styles.rowCenter}>
              <CountdownRing
                key={ringKey}
                seconds={8}
                size={72}
                stroke={6}
                runKey={ringKey}
                onComplete={() => haptics.warning()}
              />
            </View>
            <GhostButton label="Yeniden başlat" onPress={() => setRingKey((k) => k + 1)} />
          </Section>

          {/* CountUp */}
          <Section label="Skor Sayacı (CountUp)">
            <CountUp target={countTarget} durationMs={700} style={styles.bigNum} />
            <View style={styles.btnRow}>
              <GhostButton label="+3" onPress={() => setCountTarget((v) => v + 3)} />
              <GhostButton label="Sıfırla" onPress={() => setCountTarget(0)} />
            </View>
          </Section>

          {/* BallLoader */}
          <Section label="Top Yükleyici (BallLoader)">
            <BallLoader label="Rakip aranıyor" sub="Bekleme animasyonu" size={48} />
          </Section>

          {/* WinFx */}
          <Section label="Kazanma Efekti (WinFx · Skia)">
            <View style={styles.btnRow}>
              <PrimaryButton label="P1 kazandı" pulse={false} onPress={() => fireWin('P1')} />
              <PrimaryButton label="P2 kazandı" pulse={false} onPress={() => fireWin('P2')} />
            </View>
          </Section>

          {/* RoundStinger */}
          <Section label="Tur Geçişi (RoundStinger)">
            <GhostButton label="Tur stinger tetikle" onPress={fireStinger} />
          </Section>

          {/* Haptik testleri */}
          <Section label="Dokunsal (Haptik)">
            <View style={styles.btnRow}>
              <GhostButton label="Hafif" onPress={haptics.light} />
              <GhostButton label="Sert" onPress={haptics.heavy} />
              <GhostButton label="Başarı" onPress={haptics.success} />
              <GhostButton label="Hata" onPress={haptics.error} />
            </View>
          </Section>

          <View style={{ height: 24 }} />
          <GhostButton label="← Geri" onPress={onBack} />
          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>

      {/* Overlay efektler */}
      {showWin && <WinFx side={winSide} fireKey={winKey} />}
      {showStinger && (
        <RoundStinger key={stingerKey} round={3} totalRounds={7} phaseChip="UZATMA" />
      )}
    </View>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.pitch.deep },
  safe: { flex: 1 },
  scroll: { padding: 20, gap: 4 },
  title: {
    color: colors.accent.goldHi,
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 12,
  },
  section: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginVertical: 8,
    gap: 12,
    alignItems: 'center',
  },
  sectionLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '700',
    alignSelf: 'flex-start',
  },
  rowCenter: { alignItems: 'center', justifyContent: 'center' },
  btnRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
  },
  bigNum: {
    color: colors.text.primary,
    fontSize: 40,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
});
