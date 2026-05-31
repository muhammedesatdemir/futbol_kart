/**
 * Manuel kart görsel framing override'ları.
 *
 * TM portreleri standardize değil — bazı oyuncularda yüz daha aşağıda,
 * bazılarında daha uzaktan çekilmiş. Default crop herkes için uymaz.
 *
 * Bu dosya ihtiyaç oldukça genişletilir. ID veya slug üzerinden override.
 *
 * Kullanım örneği:
 *   {
 *     'p_lionel-messi': { scale: 1.15, objectPosition: '50% 12%' },
 *   }
 *
 * Tipik değerler:
 *   - scale: 1.0 (yakın çekilmiş portre) - 1.25 (uzaktan çekilmiş)
 *   - objectPosition: '50% 0%' (en yukarı) - '50% 35%' (göğüs seviyesi)
 */

export interface PortraitOverride {
  /** CSS transform scale. Default: 1.08 */
  scale?: number;
  /** CSS object-position. Default: '50% 0%' (center top) */
  objectPosition?: string;
}

/**
 * Player id veya slug ile override map.
 * Anahtar: "p_<slug>" formatı (Player.id) veya saf slug.
 *
 * NOT: Manuel ekleyerek genişletilir. Bilinen sorunlu oyuncular için.
 */
const OVERRIDES: Record<string, PortraitOverride> = {
  // === ÖRNEKLER (gerekirse aktive edilir) ===

  // Pele eski siyah-beyaz portre, yüz orta seviyede
  'p_pele': { scale: 1.0, objectPosition: '50% 30%' },

  // Gerd Müller eski portre, yüz biraz aşağıda
  'p_gerd-mller': { scale: 1.0, objectPosition: '50% 28%' },

  // Modern TM portrelerinde yüz tipik olarak üstte
  // Default değerler bu durumda iyi çalışır — override gerekmez
};

const DEFAULT: Required<PortraitOverride> = {
  // Çok hafif crop — yüz büyük durur ama baş tamamen görünür, hiç taşma yok.
  scale: 1.03,
  // Yüz dikey ortada: TM portrelerinde kafanın üstünde boşluk var, bu yüzden
  // hizayı aşağı çekiyoruz ki alın da çene de kesilmesin.
  objectPosition: '50% 28%',
};

/**
 * Bir oyuncu için kullanılacak portrait framing değerlerini dön.
 * Override yoksa default.
 */
export function portraitFraming(
  playerId: string,
  slug?: string,
): Required<PortraitOverride> {
  const override = OVERRIDES[playerId] ?? (slug ? OVERRIDES[slug] : undefined);
  return {
    scale: override?.scale ?? DEFAULT.scale,
    objectPosition: override?.objectPosition ?? DEFAULT.objectPosition,
  };
}

/** Yeni override ekle (gerekirse runtime'da, tipik kullanım: dev/debug). */
export function registerOverride(playerId: string, override: PortraitOverride): void {
  OVERRIDES[playerId] = override;
}
