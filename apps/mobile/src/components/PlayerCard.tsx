import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { Player } from '@futbol-kart/shared-types';
import {
  countryFlag,
  initialsOf,
  positionShort,
  positionTheme,
} from '../lib/playerDisplay';
import { colors } from '../theme';

/**
 * Oyuncu kartı (mobil). Web karşılığı: PlayerCard.tsx
 *
 * Sadeleştirildi: web'in 3D tilt + holo + shine band efektleri mobilde atlandı
 * (mouse yok, performans). Korunan "his": pozisyon gradyanı, portre, numara/bayrak
 * rozetleri, isim, seçili glow. Boyut `width` prop'uyla; aspect 2:3 sabit.
 */
export function PlayerCard({
  player,
  faceDown = false,
  index,
  side = 'red',
  selected = false,
  width = 144,
  hideName = false,
  hideBadges = false,
  style,
}: {
  player?: Player;
  faceDown?: boolean;
  index?: number;
  side?: 'red' | 'blue';
  selected?: boolean;
  width?: number;
  hideName?: boolean;
  hideBadges?: boolean;
  style?: ViewStyle;
}) {
  const height = width * 1.5; // aspect 2:3

  if (faceDown || !player) {
    return <CardBack index={index} side={side} width={width} height={height} style={style} />;
  }

  const theme = positionTheme(player.position);
  const flag = countryFlag(player.nationalityCode);
  const number = player.jerseyNumbers[0] ?? '?';

  return (
    <View
      style={[
        styles.card,
        { width, height },
        selected && { borderColor: colors.accent.goldHi, borderWidth: 2 },
        selected && styles.selectedGlow,
        style,
      ]}
    >
      {/* Üst pozisyon gradyanı */}
      <LinearGradient
        colors={theme.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* Alt koyu base */}
      <LinearGradient
        colors={['transparent', 'rgba(9,9,11,0.95)']}
        locations={[0.55, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Portre alanı */}
      <View style={[styles.media, hideName && { height: '100%' }]}>
        {player.imageUrl ? (
          <Image
            source={{ uri: player.imageUrl }}
            style={styles.photo}
            contentFit="cover"
            contentPosition="top"
            cachePolicy="memory-disk"
            transition={150}
          />
        ) : (
          <View style={[styles.monogram, { backgroundColor: theme.hexLight }]}>
            <Text style={[styles.monogramText, { color: theme.hexDark }]}>
              {initialsOf(player.displayName)}
            </Text>
          </View>
        )}
      </View>

      {/* Rozetler */}
      {!hideBadges && (
        <>
          <View style={[styles.badge, styles.badgeLeft, { backgroundColor: theme.badgeBg }]}>
            <Text style={[styles.badgeText, { color: theme.badgeText }]}>{number}</Text>
          </View>
          <View style={[styles.badge, styles.badgeRight, { backgroundColor: theme.badgeBg }]}>
            <Text style={styles.flag}>{flag || player.nationalityCode}</Text>
          </View>
        </>
      )}

      {/* İsim + pozisyon */}
      {!hideName && (
        <View style={styles.info}>
          <View style={[styles.divider, { backgroundColor: theme.hexLight }]} />
          <Text style={styles.name} numberOfLines={1}>
            {player.displayName}
          </Text>
          <Text style={[styles.position, { color: theme.hexLight }]}>
            {positionShort(player.position)}
          </Text>
        </View>
      )}

      {/* İç çerçeve */}
      <View style={[styles.innerBorder, { borderColor: theme.hexDark + '80' }]} pointerEvents="none" />
    </View>
  );
}

function CardBack({
  index,
  side,
  width,
  height,
  style,
}: {
  index?: number;
  side: 'red' | 'blue';
  width: number;
  height: number;
  style?: ViewStyle;
}) {
  const palette =
    side === 'red'
      ? { from: colors.side.red, to: colors.side.redDark, text: '#fee2e2' }
      : { from: colors.side.blue, to: colors.side.blueDark, text: '#dbeafe' };

  return (
    <View style={[styles.card, { width, height }, style]}>
      <LinearGradient
        colors={[palette.from, palette.to]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.backInner}>
        <Text style={[styles.backBall, { color: palette.text }]}>⚽</Text>
        {typeof index === 'number' && (
          <Text style={[styles.backIndex, { color: palette.text }]}>{index + 1}</Text>
        )}
      </View>
      <View style={[styles.innerBorder, { borderColor: 'rgba(255,255,255,0.15)' }]} pointerEvents="none" />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#18181b',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  selectedGlow: {
    shadowColor: colors.accent.goldHi,
    shadowOpacity: 0.7,
    shadowRadius: 16,
  },
  media: {
    height: '72%',
    width: '100%',
    overflow: 'hidden',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  monogram: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monogramText: {
    fontSize: 40,
    fontWeight: '900',
  },
  badge: {
    position: 'absolute',
    top: 6,
    minWidth: 26,
    height: 24,
    borderRadius: 8,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeLeft: { left: 6 },
  badgeRight: { right: 6 },
  badgeText: {
    fontSize: 13,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  flag: { fontSize: 14 },
  info: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  divider: {
    height: 1,
    width: '55%',
    opacity: 0.7,
    marginBottom: 3,
  },
  name: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    textAlign: 'center',
  },
  position: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginTop: 1,
  },
  innerBorder: {
    position: 'absolute',
    top: 3,
    left: 3,
    right: 3,
    bottom: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  backInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  backBall: { fontSize: 40 },
  backIndex: { fontSize: 22, fontWeight: '900' },
});
