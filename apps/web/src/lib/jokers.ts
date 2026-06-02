/**
 * Joker (özel hamle) saf mantığı.
 *
 * Şimdilik 2 joker — her ikisi de mevcut tur akışına INLINE girer (yeni sahne yok):
 *  - Çarpan: max soruda kendi değerini ×2, min soruda ÷2 yapar. Tek kullanım/taraf.
 *    Yön soruya göre otomatik (akıllı): max → ×2 (büyük kazanır), min → ÷2 (küçük kazanır).
 *  - İstatistiği Gör: kendi elindeki kartların bu soruya ait değerini rozet olarak gösterir
 *    (saf görsel, state'i değiştirmez).
 *
 * Her joker maçta 1×/taraf; faz (main/extra/sudden) fark etmez.
 */
import type { Player } from '@futbol-kart/shared-types';
import {
  computeValue,
  type Template,
  type ResolverContext,
} from '@futbol-kart/question-templates';

/** Çarpan jokerinin uygulayacağı yön — soruya göre belirlenir. */
export type MultiplierDirection = 'x2' | 'half';

/**
 * Çarpan jokeri için UYGUN OLMAYAN şablonlar.
 *
 * Bu şablonların "değeri" gerçek bir nicelik değil; yıl / ay / gün / doğum ms /
 * (saf) oran gibi şeyler. ×2 veya ÷2 bunlarda anlamsız ya da yanıltıcı olur
 * (örn. "2003 yılı ×2" = 4006; "Mart ÷2"). Bu yüzden bilinçli dışlanır.
 *
 * Proximity (category === 'proximity') + bool (compareOp === 'bool') ayrıca
 * canUseMultiplier içinde elenir; burada yalnızca max/min ama "çarpılamaz"
 * anlamlı-olmayan değerler listelenir.
 */
const MULTIPLIER_DENY_IDS = new Set<string>([
  // yaş / doğum ms tabanlı (değer = birthDate ms ya da yaş indeksi)
  't01_younger',
  't02_older',
  't03_birth_year',
  't04_birth_month_late',
  't05_birth_day_late',
  't06_earlier_debut',
  // yıl değerleri
  'n10_pro_debut_year',
  'c03_first_club_year_early',
  'c04_last_club_year_late',
]);

/**
 * Çarpan jokeri bu soruda kullanılabilir mi?
 *  - bool sorularda anlamsız (Evet/Hayır) → hayır.
 *  - proximity sorularda hedefe yakınlık ölçülür, çarpan anlamı bozar → hayır.
 *  - yıl/ay/gün/doğum-ms gibi nicelik-olmayan max/min sorular → hayır.
 *  - geri kalan tüm max/min (nicelik) sorular → evet.
 */
export function canUseMultiplier(template: Template | null): boolean {
  if (!template) return false;
  if (template.compareOp === 'bool') return false;
  if (template.category === 'proximity') return false;
  if (template.id.includes('_proximity')) return false;
  if (MULTIPLIER_DENY_IDS.has(template.id)) return false;
  return template.compareOp === 'max' || template.compareOp === 'min';
}

/**
 * Sorunun çarpan yönü: max → ×2 (kendi değerini büyüt), min → ÷2 (kendi değerini küçült).
 * canUseMultiplier true ise her zaman tanımlı bir yön döner.
 */
export function multiplierDirection(template: Template): MultiplierDirection {
  return template.compareOp === 'min' ? 'half' : 'x2';
}

/** Bir değere çarpanı uygula (sayısal değilse aynen döndürülür — güvenlik). */
export function applyMultiplier(
  value: number | boolean | null,
  dir: MultiplierDirection,
): number | boolean | null {
  if (typeof value !== 'number') return value;
  return dir === 'x2' ? value * 2 : value / 2;
}

export interface RevealedHandValue {
  cardId: string;
  value: number | boolean | null;
}

/**
 * "İstatistiği Gör" jokeri — verilen elin her kartı için bu sorudaki değeri hesaplar.
 * Saf hesaplama; state değiştirmez. Bilinmeyen oyuncu/şablon → value null.
 */
export function revealHandValues(
  template: Template,
  handCardIds: string[],
  playersById: Map<string, Player>,
  ctx: ResolverContext,
  params?: ResolverContext['params'],
): RevealedHandValue[] {
  const prev = ctx.params;
  ctx.params = params;
  try {
    return handCardIds.map((cardId) => {
      const player = playersById.get(cardId);
      const value = player ? computeValue(template, player, ctx) : null;
      return { cardId, value };
    });
  } finally {
    ctx.params = prev;
  }
}

/**
 * Bot joker kararı — basit ve deterministik (PRNG ile).
 *
 * Çarpan: bot kart seçtikten sonra, eğer joker hakkı varsa ve soru uygunsa,
 * ~%55 olasılıkla kullanır (kendi değerini avantajlı yöne çarpar). Aşırı
 * agresif değil; bazen saklar.
 *
 * İstatistiği Gör: bot zaten tüm değerleri "bilir" (rastgele seçer), bu yüzden
 * görsel joker botta tetiklenmez — sadece çarpan kararı verilir.
 */
export function botShouldUseMultiplier(
  template: Template | null,
  alreadyUsed: boolean,
  rng: () => number,
): boolean {
  if (alreadyUsed) return false;
  if (!canUseMultiplier(template)) return false;
  return rng() < 0.55;
}

// ===========================
// Transfer Hamlesi jokeri
// ===========================

/**
 * Bir elin TRANSFER EDİLEBİLİR kartları:
 *  - Bonus slotuna atanmış kartlar hariç (yalnızca ana maçta bonus var;
 *    uzatma/penaltıda bonusCards hep null → tüm el).
 *  - Daha önce transfer edilmiş (kilitli) kartlar hariç — geri alınamaz.
 *
 * Hem "verilebilir" (kendi eli) hem "alınabilir" (rakip eli) için aynı kural.
 */
export function transferableCards(
  handCardIds: string[],
  bonusCards: Array<string | null>,
  transferLockedIds: string[],
): string[] {
  const bonusSet = new Set(bonusCards.filter((c): c is string => c !== null));
  const lockedSet = new Set(transferLockedIds);
  return handCardIds.filter((id) => !bonusSet.has(id) && !lockedSet.has(id));
}

/**
 * Transfer jokeri bu turda kullanılabilir mi?
 *  - Daha önce kullanılmadıysa,
 *  - Bu fazın SON turu DEĞİLse (son turda kapalı),
 *  - Hem kendi hem rakip tarafında en az 1 transfer-edilebilir kart varsa.
 *
 * NOT: Rakip tarafında transfer-edilebilir kart kalmadıysa buton yine gösterilir
 * ama açınca "değişecek kart yok" durumu oluşur (kaos kuralı) — bunu UI yönetir.
 * Burada SADECE kullanılabilirlik (buton aktif mi) için kendi tarafına bakarız.
 */
export function canUseTransfer(
  alreadyUsed: boolean,
  isLastRoundOfPhase: boolean,
  ownTransferable: number,
): boolean {
  if (alreadyUsed) return false;
  if (isLastRoundOfPhase) return false;
  return ownTransferable > 0;
}

export interface BotTransferChoice {
  give: string;
  take: string;
}

/**
 * Transfer otomatik-tamamlama. Joker'e basıldıysa transfer KESİN gerçekleşir:
 * kullanıcının (varsa) seçimleri korunur, eksikler deterministik (PRNG) doldurulur.
 *
 *  - give yoksa: kendi havuzundan rastgele bir kart.
 *  - take yoksa: rakip havuzundan rastgele bir kart.
 *  - ikisi varsa: aynen döner.
 *
 * Havuzlardan biri boşsa null döner (transfer imkansız — upstream zaten engeller).
 */
export function autoCompleteTransfer(
  ownPool: string[],
  oppPool: string[],
  give: string | null,
  take: string | null,
  rng: () => number,
): BotTransferChoice | null {
  if (ownPool.length === 0 || oppPool.length === 0) return null;
  const resolvedGive =
    give && ownPool.includes(give)
      ? give
      : ownPool[Math.floor(rng() * ownPool.length)]!;
  const resolvedTake =
    take && oppPool.includes(take)
      ? take
      : oppPool[Math.floor(rng() * oppPool.length)]!;
  return { give: resolvedGive, take: resolvedTake };
}

/**
 * Bot transfer kararı — ~%25 olasılıkla kör değiş-tokuş.
 * Kendi transfer-edilebilir kartlarından rastgele birini verir, rakibin
 * transfer-edilebilir kartlarından rastgele birini alır. Uygun kart yoksa null.
 */
export function botTransferChoice(
  alreadyUsed: boolean,
  isLastRoundOfPhase: boolean,
  ownTransferable: string[],
  oppTransferable: string[],
  rng: () => number,
): BotTransferChoice | null {
  if (alreadyUsed || isLastRoundOfPhase) return null;
  if (ownTransferable.length === 0 || oppTransferable.length === 0) return null;
  if (rng() >= 0.25) return null;
  const give = ownTransferable[Math.floor(rng() * ownTransferable.length)]!;
  const take = oppTransferable[Math.floor(rng() * oppTransferable.length)]!;
  return { give, take };
}
