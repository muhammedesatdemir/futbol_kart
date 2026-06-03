/**
 * "Hedefe Yaklaş" modu — saf mantık (React/DOM yok, test edilebilir).
 *
 * Oyuncu 5 futbolcu seçer; seçilen metriğin (örn. Dünya Kupası maçı) toplamı
 * bir HEDEF değere en yakın olan taraf kazanır. "Üstü serbest" — yalnızca
 * mutlak uzaklık (|toplam − hedef|) önemli; blackjack/diskalifiye yok.
 *
 * Tasarım notu (ince dikey dilim): şu an tek kriter ("Dünya Kupası maçı") ve
 * sabit 5 slot (pozisyon kısıtsız) canlı. Yapı, kalan metrikleri (UCL/milli/lig)
 * yalnızca TARGET_CRITERIA'ya veri ekleyerek kapsayacak şekilde kuruldu —
 * squadMode.ts'in kardeş şablonu.
 */
import type { Player } from '@futbol-kart/shared-types';

/** Kaç oyuncu seçilir (görsellerdeki "5 futbolcu kullan"). */
export const SLOT_COUNT = 5;

/** Bir kriterin değerini bir oyuncudan çıkaran fonksiyon (eksikse null). */
export type TargetMetric = (p: Player) => number | null;

export interface TargetCriterion {
  id: string;
  /** Metrik adı (TR) — "Dünya Kupası maçı". Hedef bandında ve sonuçta gösterilir. */
  title: string;
  /** Birim etiketi, örn. "maç". */
  unit: string;
  /** Hedef değer aralığı [min, max] — çark bu aralıkta durur (step ile hizalı). */
  targetRange: [number, number];
  /** Çark durağı adımı (örn. 5 → 60,65,70,75,80). */
  targetStep: number;
  /** Oyuncudan değeri çıkar (eksik veri → null → havuz dışı). */
  metric: TargetMetric;
  /**
   * Opsiyonel havuz kısıtı — yalnızca bu koşulu sağlayan oyuncular seçilebilir.
   * Tanımsızsa metrik verisi olan tüm havuz kullanılır.
   */
  poolFilter?: (p: Player) => boolean;
}

/** stats alt alanı pozitifse döndür, değilse null (havuz dışı). squadMode ile aynı. */
const statMetric =
  (pick: (p: Player) => number | undefined): TargetMetric =>
  (p) => {
    const v = pick(p);
    return typeof v === 'number' && v > 0 ? v : null;
  };

/**
 * İlk dilim kriteri: Dünya Kupası maçı. Dağılım (ölçüldü): max 26, top-5 ort 24,
 * n=2066. 5 oyuncuyla 60–80 hedefi tam oturur (ulaşılabilir ama kolay değil).
 */
export const CRITERION_WORLD_CUP_APPS: TargetCriterion = {
  id: 'tg_world_cup_apps',
  title: 'Dünya Kupası maçı',
  unit: 'maç',
  targetRange: [60, 80],
  targetStep: 5,
  metric: statMetric((p) => p.stats.competitions?.worldCupApps),
};

export const TARGET_CRITERIA: TargetCriterion[] = [CRITERION_WORLD_CUP_APPS];

export function criterionById(id: string): TargetCriterion | undefined {
  return TARGET_CRITERIA.find((c) => c.id === id);
}

/**
 * Hedef değeri seç — kriterin aralığında, adıma hizalı (çark durakları net).
 * rng deterministik (PRNG) verilirse maç içinde tutarlı.
 */
export function pickTarget(criterion: TargetCriterion, rng: () => number): number {
  const [min, max] = criterion.targetRange;
  const step = criterion.targetStep;
  const stops = Math.floor((max - min) / step) + 1; // örn. 60..80 step 5 → 5 durak
  const i = Math.min(stops - 1, Math.floor(rng() * stops));
  return min + i * step;
}

/** Bir tarafın 5 seçimi: index → playerId (null = boş). Slot id'siz, düz dizi. */
export type TargetPicks = (string | null)[];

export function emptyPicks(): TargetPicks {
  return Array.from({ length: SLOT_COUNT }, () => null);
}

export interface TargetScore {
  /** Slot bazlı dökümler (sıralı reveal için). */
  perPick: Array<{ playerId: string | null; value: number }>;
  total: number;
  /** Veri eksik / boş slot sayısı (0 katkı). */
  missing: number;
}

/** Bir tarafın seçtiği 5 oyuncunun metrik toplamı. Boş/eksik slot 0 katkı yapar. */
export function scoreTarget(
  picks: TargetPicks,
  criterion: TargetCriterion,
  playersById: Map<string, Player>,
): TargetScore {
  const perPick: TargetScore['perPick'] = [];
  let total = 0;
  let missing = 0;
  for (const pid of picks) {
    const player = pid ? playersById.get(pid) : undefined;
    const raw = player ? criterion.metric(player) : null;
    const value = raw ?? 0;
    if (!player || raw === null) missing++;
    total += value;
    perPick.push({ playerId: pid, value });
  }
  return { perPick, total, missing };
}

/** Toplamın hedefe mutlak uzaklığı. */
export function targetDistance(total: number, target: number): number {
  return Math.abs(total - target);
}

export type TargetWinner = 'P1' | 'P2' | 'tie';

/**
 * İki tarafı karşılaştır — hedefe DAHA YAKIN olan (küçük uzaklık) kazanır.
 * Eşit uzaklıkta berabere (rastgele/keyfî kazanan yok — VS modunun adalet ilkesi).
 */
export function compareToTarget(
  p1Total: number,
  p2Total: number,
  target: number,
): TargetWinner {
  const d1 = targetDistance(p1Total, target);
  const d2 = targetDistance(p2Total, target);
  if (d1 === d2) return 'tie';
  return d1 < d2 ? 'P1' : 'P2';
}

/** Metrik verisi olan + havuz kısıtını geçen + dışlanmamış aday havuzu. */
function eligiblePool(
  criterion: TargetCriterion,
  pool: Player[],
  excludeIds: Set<string>,
): Player[] {
  return pool.filter(
    (p) =>
      criterion.metric(p) !== null &&
      (!criterion.poolFilter || criterion.poolFilter(p)) &&
      !excludeIds.has(p.id),
  );
}

/**
 * Bot/oto kadro — HEDEFE yaklaşan ama mükemmel olmayan 5 oyuncu seçer.
 *
 * Strateji (Kadro Kur buildAutoSquad'ın hedef-uzaklık uyarlaması): her adımda
 * "kalan hedefe (remaining/kalanSlot) yakın değerli" adayları sıralar ama
 * mutlak en iyiyi değil, üst bir PENCEREDEN rastgele seçer (skip + window,
 * strength'e bağlı). Böylece bot çoğu zaman 5–15 uzaklıkta bitirir — insanın
 * yenebileceği orta-iyi bir kadro. Mükemmel kombinasyon garanti edilmez.
 *
 * @param strength 0..1 — yüksek = hedefe daha yakın (ama asla garanti değil).
 */
export function buildAutoTarget(
  criterion: TargetCriterion,
  pool: Player[],
  excludeIds: Set<string>,
  target: number,
  rng: () => number,
  strength = 0.55,
): TargetPicks {
  const picks = emptyPicks();
  const used = new Set(excludeIds);
  const candidates = eligiblePool(criterion, pool, used);

  let runningTotal = 0;
  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    const slotsLeft = SLOT_COUNT - slot;
    // Bu slot için "ideal" katkı: kalan hedefi kalan slotlara böl.
    const remaining = target - runningTotal;
    const idealPerSlot = remaining / slotsLeft;

    const avail = candidates.filter((p) => !used.has(p.id));
    if (avail.length === 0) break;

    // İdeale yakınlığa göre sırala (en yakın → en uzak).
    avail.sort(
      (a, b) =>
        Math.abs(criterion.metric(a)! - idealPerSlot) -
        Math.abs(criterion.metric(b)! - idealPerSlot),
    );

    // "En iyiyi atla": ilk birkaç (en isabetli) adayı pas geç, sonra bir
    // pencereden rastgele seç. skip + pencere strength'e bağlı.
    const n = avail.length;
    const skip = Math.min(n - 1, Math.round((1 - strength) * 3) + 1); // 1..4
    const windowSize = Math.max(3, Math.round((1 - strength) * 12) + 4); // ~5..16
    const start = Math.min(skip, Math.max(0, n - 1));
    const end = Math.min(n, start + windowSize);
    const idx = start + Math.floor(rng() * Math.max(1, end - start));
    const chosen = avail[Math.min(idx, n - 1)];

    picks[slot] = chosen.id;
    used.add(chosen.id);
    runningTotal += criterion.metric(chosen)!;
  }
  return picks;
}

/**
 * Süre dolunca oto-tamamlama — kullanıcının seçtiklerini KORUYARAK boş slotları
 * RASTGELE uygun oyuncuyla doldurur ("random slot → random oyuncu" kuralı).
 * Tüm dolu/aday yoksa olduğu gibi döner.
 */
export function autoFillTarget(
  picks: TargetPicks,
  criterion: TargetCriterion,
  pool: Player[],
  excludeIds: Set<string>,
  rng: () => number,
): TargetPicks {
  const out = [...picks];
  // Zaten seçilmiş + rakip kullanmış olanları dışla.
  const used = new Set(excludeIds);
  for (const id of out) if (id) used.add(id);
  const avail = eligiblePool(criterion, pool, used);
  // Rastgele sırayla aday tüket.
  const shuffled = [...avail].sort(() => rng() - 0.5);
  let k = 0;
  for (let i = 0; i < out.length; i++) {
    if (out[i] !== null) continue;
    if (k >= shuffled.length) break;
    out[i] = shuffled[k++].id;
  }
  return out;
}
