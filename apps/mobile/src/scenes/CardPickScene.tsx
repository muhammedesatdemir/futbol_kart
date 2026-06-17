import { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Player } from '@futbol-kart/shared-types';
import { PlayerCard } from '../components/PlayerCard';
import { PrimaryButton } from '../components/Buttons';
import { colors, radius } from '../theme';
import { haptics } from '../lib/haptics';

const COLUMNS = 3;

/**
 * El seçimi sahnesi (CARD_PICK). Web karşılığı: CardPickScene.tsx
 * Oyuncu havuzundan `handSize` kart seç (arama + grid). Sade ama işlevsel:
 * web'in filtre/sayfalama zenginliği yerine arama + sanal liste (FlatList).
 */
export function CardPickScene({
  players,
  handSize,
  exclude,
  side,
  playerName,
  onSubmit,
}: {
  players: Player[];
  handSize: number;
  /** Seçilemeyecek kart id'leri (rakip eli + kullanılmışlar). */
  exclude: Set<string>;
  side: 'P1' | 'P2';
  playerName: string;
  onSubmit: (cards: string[]) => void;
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);

  const pool = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr');
    return players
      .filter((p) => !exclude.has(p.id))
      .filter((p) => (q ? p.name.toLocaleLowerCase('tr').includes(q) : true))
      .slice(0, 120); // arama yokken ilk 120 (performans); arama daralt
  }, [players, exclude, query]);

  const toggle = (id: string) => {
    setSelected((cur) => {
      if (cur.includes(id)) {
        haptics.light();
        return cur.filter((c) => c !== id);
      }
      if (cur.length >= handSize) {
        haptics.warning();
        return cur; // dolu
      }
      haptics.selection();
      return [...cur, id];
    });
  };

  const remaining = handSize - selected.length;
  const sideColor = side === 'P1' ? colors.side.red : colors.side.blue;

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={[styles.who, { color: sideColor }]}>{playerName}</Text>
        <Text style={styles.title}>{handSize} kartını seç</Text>
        <Text style={styles.counter}>
          {selected.length}/{handSize}{' '}
          {remaining > 0 ? `· ${remaining} kart kaldı` : '· hazır!'}
        </Text>
      </View>

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Oyuncu ara..."
        placeholderTextColor={colors.text.faint}
        style={styles.search}
      />

      <FlatList
        data={pool}
        keyExtractor={(p) => p.id}
        numColumns={COLUMNS}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.grid}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <Pressable onPress={() => toggle(item.id)} style={styles.cell}>
            <PlayerCard
              player={item}
              width={98}
              selected={selected.includes(item.id)}
            />
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>Sonuç yok — aramayı değiştir.</Text>
        }
      />

      <View style={styles.footer}>
        <PrimaryButton
          label={remaining > 0 ? `${remaining} kart daha seç` : 'Onayla'}
          pulse={false}
          onPress={() => {
            if (selected.length === handSize) {
              haptics.success();
              onSubmit(selected);
            } else {
              haptics.warning();
            }
          }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 16 },
  header: { alignItems: 'center', paddingTop: 8, paddingBottom: 12 },
  who: { fontSize: 14, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  title: { color: colors.text.primary, fontSize: 22, fontWeight: '900', marginTop: 2 },
  counter: { color: colors.accent.goldHi, fontSize: 13, fontWeight: '700', marginTop: 4 },
  search: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.text.primary,
    fontSize: 15,
    marginBottom: 12,
  },
  grid: { paddingBottom: 90 },
  row: { justifyContent: 'space-between', marginBottom: 12 },
  cell: {},
  empty: { color: colors.text.muted, textAlign: 'center', marginTop: 40 },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingVertical: 16,
    backgroundColor: 'rgba(6,26,14,0.85)',
  },
});
