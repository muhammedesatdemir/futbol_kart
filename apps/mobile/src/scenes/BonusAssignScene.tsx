import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Player } from '@futbol-kart/shared-types';
import {
  buildConditionLibrary,
  type BonusConditionLite,
  type ConditionContext,
} from '@futbol-kart/game-engine';
import { PlayerCard } from '../components/PlayerCard';
import { PrimaryButton } from '../components/Buttons';
import { colors, radius } from '../theme';
import { haptics } from '../lib/haptics';

const LIBRARY = buildConditionLibrary();
const LIB_BY_ID = new Map(LIBRARY.map((c) => [c.id, c]));

/**
 * Bonus atama sahnesi (BONUS_ASSIGN). Web karşılığı: BonusAssignScene.tsx
 *
 * Ana maç ilk turunda: 3 kategoriye birer kart ata; turunu kazanırsa +2 puan.
 * Aktif slot seçilir, ele uygun kartlar parlar, atanınca sonraki boş slota geçer.
 */
export function BonusAssignScene({
  sideName,
  conditions,
  hand,
  assigned,
  ctx,
  onAssign,
  onConfirm,
}: {
  sideName: string;
  conditions: BonusConditionLite[];
  hand: Player[];
  assigned: Array<string | null>;
  ctx: ConditionContext;
  onAssign: (slot: number, cardId: string | null) => void;
  onConfirm: () => void;
}) {
  const handById = useMemo(() => new Map(hand.map((p) => [p.id, p])), [hand]);
  const firstEmpty = assigned.findIndex((c) => c === null);
  const [activeSlot, setActiveSlot] = useState(firstEmpty === -1 ? 0 : firstEmpty);

  const activeCond = LIB_BY_ID.get(conditions[activeSlot]?.id ?? '');
  const eligibleIds = useMemo(() => {
    const set = new Set<string>();
    if (!activeCond) return set;
    for (const p of hand) if (activeCond.test(p, ctx)) set.add(p.id);
    return set;
  }, [activeCond, hand, ctx]);

  const assignedSet = useMemo(
    () => new Set(assigned.filter((c): c is string => c !== null)),
    [assigned],
  );
  const allFilled = assigned.every((c) => c !== null);
  const filledCount = assigned.filter((c) => c !== null).length;

  const handleCard = (cardId: string) => {
    const existing = assigned.indexOf(cardId);
    if (existing !== -1) {
      // Zaten atanmış → boşalt.
      haptics.light();
      onAssign(existing, null);
      setActiveSlot(existing);
      return;
    }
    if (!eligibleIds.has(cardId)) {
      haptics.warning();
      return;
    }
    haptics.selection();
    onAssign(activeSlot, cardId);
    const nextEmpty = assigned.findIndex((c, i) => c === null && i !== activeSlot);
    if (nextEmpty !== -1) setActiveSlot(nextEmpty);
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.chip}>BONUS TUR — +2 PUAN</Text>
        <Text style={styles.title}>{sideName}, 3 kategoriye kart ata</Text>
      </View>

      {/* 3 slot */}
      <View style={styles.slots}>
        {conditions.map((cond, slot) => {
          const cardId = assigned[slot];
          const card = cardId ? handById.get(cardId) : undefined;
          const isActive = slot === activeSlot;
          return (
            <Pressable
              key={cond.id}
              onPress={() => setActiveSlot(slot)}
              style={[styles.slot, isActive && styles.slotActive]}
            >
              <Text style={styles.slotLabel} numberOfLines={3}>
                {cond.label}
              </Text>
              <View style={styles.slotCard}>
                {card ? (
                  <PlayerCard player={card} width={72} selected />
                ) : (
                  <View style={[styles.emptySlot, isActive && styles.emptySlotActive]}>
                    <Text style={styles.plus}>+</Text>
                  </View>
                )}
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* El */}
      <Text style={styles.handLabel}>
        {activeCond
          ? `"${conditions[activeSlot]?.label}" için uygun kartlar parlak`
          : 'Elin'}
      </Text>
      <ScrollView contentContainerStyle={styles.hand}>
        <View style={styles.handRow}>
          {hand.map((p) => {
            const isAssigned = assignedSet.has(p.id);
            const isEligible = eligibleIds.has(p.id);
            const dimmed = !isAssigned && !isEligible;
            return (
              <Pressable
                key={p.id}
                onPress={() => handleCard(p.id)}
                style={dimmed && { opacity: 0.3 }}
              >
                <PlayerCard player={p} width={76} selected={isAssigned} />
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton
          label={allFilled ? 'Devam — maça başla' : `${filledCount}/3 kategori dolu`}
          pulse={false}
          onPress={() => {
            if (allFilled) {
              haptics.success();
              onConfirm();
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
  root: { flex: 1, paddingHorizontal: 12 },
  header: { alignItems: 'center', paddingTop: 6, paddingBottom: 8, gap: 4 },
  chip: {
    color: colors.accent.goldHi,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    backgroundColor: 'rgba(240,193,75,0.18)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  title: { color: colors.text.primary, fontSize: 17, fontWeight: '900', textAlign: 'center' },
  slots: { flexDirection: 'row', gap: 6, justifyContent: 'space-between' },
  slot: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(0,0,0,0.3)',
    padding: 6,
  },
  slotActive: {
    borderColor: 'rgba(240,193,75,0.7)',
    backgroundColor: 'rgba(240,193,75,0.1)',
  },
  slotLabel: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    minHeight: 42,
  },
  slotCard: { height: 108, justifyContent: 'center' },
  emptySlot: {
    width: 72,
    height: 108,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptySlotActive: { borderColor: 'rgba(240,193,75,0.5)' },
  plus: { color: 'rgba(255,255,255,0.3)', fontSize: 28 },
  handLabel: {
    color: colors.accent.goldHi,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 10,
    marginBottom: 6,
    textAlign: 'center',
  },
  hand: { paddingBottom: 90 },
  handRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
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
