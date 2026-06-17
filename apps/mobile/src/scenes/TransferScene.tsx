import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Player } from '@futbol-kart/shared-types';
import { transferableCards, type SessionState } from '@futbol-kart/game-engine';
import { PlayerCard } from '../components/PlayerCard';
import { PrimaryButton, GhostButton } from '../components/Buttons';
import { colors } from '../theme';
import { haptics } from '../lib/haptics';

/**
 * Transfer jokeri sahnesi (ROUND_TRANSFER). Web karşılığı: TransferScene.tsx
 *
 * Kendi (kilitsiz, bonus olmayan) kartlarından birini VER, rakipten birini AL.
 * Onayla → swap. Transfer maçta 1×; geri alınamaz (kartlar kilitlenir).
 */
export function TransferScene({
  state,
  side,
  playersById,
  onExecute,
  onSkip,
}: {
  state: SessionState;
  side: 'P1' | 'P2';
  playersById: Map<string, Player>;
  onExecute: (give: string, take: string) => void;
  onSkip: () => void;
}) {
  const ownHand = side === 'P1' ? state.p1Hand : state.p2Hand;
  const ownBonus = side === 'P1' ? state.p1BonusCards : state.p2BonusCards;
  const oppHand = side === 'P1' ? state.p2Hand : state.p1Hand;
  const oppBonus = side === 'P1' ? state.p2BonusCards : state.p1BonusCards;

  const ownPool = useMemo(
    () => transferableCards(ownHand, ownBonus, state.transferLockedIds),
    [ownHand, ownBonus, state.transferLockedIds],
  );
  const oppPool = useMemo(
    () => transferableCards(oppHand, oppBonus, state.transferLockedIds),
    [oppHand, oppBonus, state.transferLockedIds],
  );

  const [give, setGive] = useState<string | null>(null);
  const [take, setTake] = useState<string | null>(null);
  const ready = give && take;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.chip}>🔄 TRANSFER HAMLESİ</Text>
        <Text style={styles.title}>Bir kartını ver, rakipten bir kart al</Text>
        <Text style={styles.sub}>Bu hamle maçta bir kez. Geri alınamaz.</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* VER */}
        <Text style={[styles.colLabel, { color: colors.side.red }]}>
          VERECEĞİN ({ownPool.length})
        </Text>
        <View style={styles.row}>
          {ownPool.map((id) => {
            const p = playersById.get(id);
            if (!p) return null;
            return (
              <Pressable
                key={id}
                onPress={() => {
                  haptics.selection();
                  setGive(id === give ? null : id);
                }}
              >
                <PlayerCard player={p} width={84} side="red" selected={id === give} />
              </Pressable>
            );
          })}
        </View>

        {/* AL */}
        <Text style={[styles.colLabel, { color: colors.side.blue, marginTop: 16 }]}>
          ALACAĞIN ({oppPool.length})
        </Text>
        <View style={styles.row}>
          {oppPool.map((id) => {
            const p = playersById.get(id);
            if (!p) return null;
            return (
              <Pressable
                key={id}
                onPress={() => {
                  haptics.selection();
                  setTake(id === take ? null : id);
                }}
              >
                <PlayerCard player={p} width={84} side="blue" selected={id === take} />
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton
          label={ready ? 'Takası onayla' : 'Ver + al seç'}
          pulse={false}
          onPress={() => {
            if (give && take) {
              haptics.success();
              onExecute(give, take);
            } else {
              haptics.warning();
            }
          }}
        />
        <View style={{ height: 10 }} />
        <GhostButton label="Vazgeç" onPress={onSkip} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 12 },
  header: { alignItems: 'center', paddingTop: 6, paddingBottom: 8, gap: 3 },
  chip: {
    color: colors.accent.goldHi,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
  },
  title: { color: colors.text.primary, fontSize: 17, fontWeight: '900', textAlign: 'center' },
  sub: { color: colors.text.muted, fontSize: 12 },
  scroll: { paddingBottom: 130 },
  colLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 1, marginBottom: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 24,
    backgroundColor: 'rgba(6,26,14,0.95)',
  },
});
