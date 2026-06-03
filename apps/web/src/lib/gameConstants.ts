/**
 * Tek noktada toplanmış oyun sabitleri.
 * 8 kart + 7 tur seçimi: son turda bile hâlâ 2 kart arasından seçim olsun diye.
 */
export const HAND_SIZE = 8;
export const TOTAL_ROUNDS = 7;

/** Uzatma: eşitlik durumunda. 4 kart, 3 soru. */
export const EXTRA_HAND_SIZE = 4;
export const EXTRA_ROUNDS = 3;

/** Sudden death: uzatma da eşit biterse. Tek kart, tek soru. */
export const SUDDEN_HAND_SIZE = 1;
export const SUDDEN_ROUNDS = 1;

// ===========================
// Süre (geri sayım) sabitleri
// ===========================

/**
 * Tüm geri sayım süreleri ~1.7× artırıldı (kullanıcı geri bildirimi: süreler
 * kısaydı, "ne olduğunu anlayamadan bitiyordu"). Bot süre kullanmaz (anlık).
 */

/** Tur içi kart oynama süresi (sn). Süre dolarsa rastgele kart otomatik oynanır. */
export const CARD_PLAY_SECONDS = 34;

/** Bonus kategori atama süresi (sn). Süre dolarsa fizibil otomatik tamamlanır. */
export const BONUS_ASSIGN_SECONDS = 50;

/** Transfer jokeri değiş-tokuş süresi (sn). */
export const TRANSFER_SECONDS = 30;

/** Kadro Kur — Arkadaşa Karşı snake draft: tek seçim süresi (sn). Dolarsa
 *  rastgele boş mevkiye rastgele uygun oyuncu atanır. */
export const SQUAD_DRAFT_SECONDS = 40;

/** Hedefe Yaklaş — 5 oyuncu seçilir. */
export const TARGET_PICK_COUNT = 5;

/** Hedefe Yaklaş — 5 oyuncuyu kör seçme süresi (sn). Dolarsa boşlar rastgele
 *  uygun oyuncuyla tamamlanır. handPickSeconds(5) = 65. */
export const TARGET_PICK_SECONDS = handPickSeconds(TARGET_PICK_COUNT);

/** Hedefe Yaklaş — Arkadaşa Karşı snake draft: tek seçim süresi (sn). Dolarsa
 *  rastgele uygun oyuncu atanır. */
export const TARGET_DRAFT_SECONDS = 40;

/** Liste Doldur — top-10. */
export const LIST_SIZE = 10;

/** Liste Doldur — Bota karşı: tüm liste için toplam tahmin süresi (sn). */
export const LIST_PLAY_SECONDS = 90;

/** Liste Doldur — Arkadaşa karşı: tek tahmin (tur) süresi (sn). Dolarsa pas → sıra geçer. */
export const LIST_TURN_SECONDS = 35;

/**
 * El hazırlama süresi (sn) — kart sayısına orantılı: handSize×13, en az 40.
 * 8 kart → 104, 4 kart → 52, 1 kart → 40 (min).
 * Süre dolarsa eksik kartlar rastgele tamamlanıp otomatik onaylanır.
 */
export function handPickSeconds(handSize: number): number {
  return Math.max(40, handSize * 13);
}
