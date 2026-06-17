import { useCallback, useDeferredValue, useMemo, useState } from 'react';
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
const CARD_W = 104;
const ROW_H = CARD_W * 1.5 + 12; // kart yüksekliği + satır boşluğu

/**
 * El seçimi sahnesi (CARD_PICK). Web karşılığı: CardPickScene.tsx
 *
 * PERFORMANS: renderItem useCallback, selected → Set, FlatList sanallaştırma
 * (windowSize/getItemLayout/removeClippedSubviews). PlayerCard React.memo'lu.
 * exclude filtresi query'den ayrı memoize → her tuşta 8912 elemanı 2× taramaz.
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
  exclude: Set<string>;
  side: 'P1' | 'P2';
  playerName: string;
  onSubmit: (cards: string[]) => void;
}) {
  const [query, setQuery] = useState('');
  // Klavye anında yazar (value={query}) ama liste/foto işi yazma duraksayınca
  // hesaplanır → her tuşta 40 foto fetch + render baskısı yok.
  const deferredQuery = useDeferredValue(query);
  const [selected, setSelected] = useState<string[]>([]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  // exclude filtresi query'den BAĞIMSIZ → bir kez hesaplanır (8912 tarama).
  const available = useMemo(
    () => players.filter((p) => !exclude.has(p.id)),
    [players, exclude],
  );

  // Arama: önce-filtrelenmiş diziyi tara. 40 sonuç → tek seferde max 40 foto fetch.
  const pool = useMemo(() => {
    const q = deferredQuery.trim().toLocaleLowerCase('tr');
    if (!q) return available.slice(0, 40);
    return available.filter((p) => p.name.toLocaleLowerCase('tr').includes(q)).slice(0, 40);
  }, [available, deferredQuery]);

  const toggle = useCallback(
    (id: string) => {
      setSelected((cur) => {
        if (cur.includes(id)) {
          haptics.light();
          return cur.filter((c) => c !== id);
        }
        if (cur.length >= handSize) {
          haptics.warning();
          return cur;
        }
        haptics.selection();
        return [...cur, id];
      });
    },
    [handSize],
  );

  const renderItem = useCallback(
    ({ item }: { item: Player }) => (
      <Pressable onPress={() => toggle(item.id)} style={styles.cell}>
        <PlayerCard player={item} width={CARD_W} selected={selectedSet.has(item.id)} />
      </Pressable>
    ),
    [toggle, selectedSet],
  );

  const getItemLayout = useCallback(
    (_: unknown, index: number) => {
      const row = Math.floor(index / COLUMNS);
      return { length: ROW_H, offset: ROW_H * row, index };
    },
    [],
  );

  const remaining = handSize - selected.length;
  const sideColor = side === 'P1' ? colors.side.red : colors.side.blue;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
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
        renderItem={renderItem}
        extraData={selectedSet}
        getItemLayout={getItemLayout}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.grid}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={9}
        maxToRenderPerBatch={9}
        windowSize={5}
        removeClippedSubviews
        ListEmptyComponent={<Text style={styles.empty}>Sonuç yok — aramayı değiştir.</Text>}
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
  header: { alignItems: 'center', paddingTop: 8, paddingBottom: 10 },
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
    marginBottom: 10,
  },
  // Footer artık akışta DEĞİL ama grid'e yeterli alt boşluk → son satır footer
  // arkasında kalmaz.
  grid: { paddingBottom: 96 },
  row: { justifyContent: 'space-between', marginBottom: 12 },
  cell: {},
  empty: { color: colors.text.muted, textAlign: 'center', marginTop: 40 },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 28,
    backgroundColor: 'rgba(6,26,14,0.95)',
  },
});
