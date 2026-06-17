import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, ScrollView } from 'react-native';
import {
  initialSession,
  HAND_SIZE,
  TOTAL_ROUNDS,
} from '@futbol-kart/game-engine';

// FAZ 0 SMOKE TEST
// Amaç: paylaşılan @futbol-kart/game-engine paketinin (ham TS export eden workspace
// paketi) Expo/Metro tarafından transpile edilip mobilde çalıştığını KANITLAMAK.
// initialSession() çağrılır; dönen SessionState ekrana basılır. Burada bir şey
// görünüyorsa → paket köprüsü çalışıyor demektir.
const session = initialSession('smoke-test', 'derby-seed-001');

export default function App() {
  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <Text style={styles.brand}>DerbyGoal</Text>
      <Text style={styles.subtitle}>Mobil · Faz 0 · Paket Köprüsü</Text>

      <View style={styles.card}>
        <Text style={styles.ok}>✓ game-engine import edildi</Text>
        <ScrollView style={styles.stateBox}>
          <Row label="gameId" value={session.gameId} />
          <Row label="seed" value={session.seed} />
          <Row label="scene" value={session.scene} />
          <Row label="phase" value={session.phase} />
          <Row label="totalRounds" value={String(session.totalRounds)} />
          <Row label="handSize" value={String(session.handSize)} />
          <Row label="HAND_SIZE (sabit)" value={String(HAND_SIZE)} />
          <Row label="TOTAL_ROUNDS (sabit)" value={String(TOTAL_ROUNDS)} />
        </ScrollView>
      </View>

      <Text style={styles.footer}>
        Bu ekran görünüyorsa paylaşılan TS paketleri mobilde çalışıyor.
      </Text>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a2614',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  brand: {
    color: '#ffd76b',
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 14,
    marginTop: 4,
    marginBottom: 24,
  },
  card: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
  },
  ok: {
    color: '#5fe07a',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 12,
  },
  stateBox: {
    maxHeight: 280,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    borderBottomWidth: 1,
  },
  rowLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
  },
  rowValue: {
    color: '#f7f7f7',
    fontSize: 13,
    fontWeight: '600',
  },
  footer: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 24,
  },
});
