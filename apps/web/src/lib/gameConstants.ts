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
