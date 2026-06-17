import * as Haptics from 'expo-haptics';

/**
 * Dokunsal geri bildirim katmanı — web'de OLMAYAN, mobile özgü "his".
 *
 * Oyun olaylarını anlamlı titreşimlerle eşler. Tek yerden yönetilir ki tüm
 * sahnelerde tutarlı olsun. Hata olursa sessizce yutulur (cihazda haptik yoksa
 * oyun bozulmaz).
 */
function safe(fn: () => Promise<void>) {
  try {
    void fn().catch(() => {});
  } catch {
    /* no-op */
  }
}

export const haptics = {
  /** Hafif dokunuş — kart seçimi, buton, küçük etkileşim. */
  light: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Orta — kart oynama, onaylama. */
  medium: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** Sert — gol, kart açılışı vurgusu. */
  heavy: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
  /** Başarı — tur/maç kazanma. */
  success: () =>
    safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** Uyarı — can kaybı (Liste Doldur), riskli durum. */
  warning: () =>
    safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  /** Hata — yanlış cevap, geçersiz hamle. */
  error: () =>
    safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
  /** Seçim değişimi — liste/filtre kaydırma (çok hafif tık). */
  selection: () => safe(() => Haptics.selectionAsync()),
};
