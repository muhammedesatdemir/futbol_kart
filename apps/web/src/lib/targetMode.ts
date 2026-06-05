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
import { METRIC_FIELDS, type MetricField } from './criteriaCatalog';

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
 * Kriter ÜRETİCİSİ — catalog'daki `targetEligible` + `targetBand`'i olan her
 * alandan bir TargetCriterion türetir. Hedef bandı (`targetRange`/`step`),
 * 5-oyuncu toplamının gerçek dağılımından hesaplanıp catalog'a yazıldı; çark
 * o bantta durur (ulaşılabilir ama kolay değil).
 */
function buildTargetCriterion(field: MetricField): TargetCriterion {
  return {
    id: `tg_${field.key}`,
    title: field.shortLabel,
    unit: field.unit,
    targetRange: field.targetBand!.range,
    targetStep: field.targetBand!.step,
    metric: statMetric(field.pick),
  };
}

export const TARGET_CRITERIA: TargetCriterion[] = METRIC_FIELDS
  .filter((f) => f.targetEligible && f.targetBand)
  .map(buildTargetCriterion);

/** Geriye dönük uyumluluk: eski tek kriter referansı. */
export const CRITERION_WORLD_CUP_APPS = TARGET_CRITERIA.find((c) => c.id === 'tg_wcapps')!;

export function criterionById(id: string): TargetCriterion | undefined {
  return TARGET_CRITERIA.find((c) => c.id === id);
}

/**
 * Üretilen hedef kriterlerini gerçek havuza göre ayıkla — yalnız hedefe
 * ULAŞILABİLİR olanlar kalır: en iyi 5 oyuncunun toplamı, hedef üst sınırına
 * en az erişebilmeli (yoksa kimse hedefi tutturamaz → bozuk tur).
 */
export function pruneTargetCriteria(
  pool: Player[],
  criteria: TargetCriterion[] = TARGET_CRITERIA,
): TargetCriterion[] {
  return criteria.filter((c) => {
    const top5 = pool
      .map((p) => c.metric(p))
      .filter((v): v is number => v !== null)
      .sort((a, b) => b - a)
      .slice(0, SLOT_COUNT)
      .reduce((s, v) => s + v, 0);
    // En iyi 5'in toplamı, hedef bandının üst sınırını karşılayabilmeli.
    return top5 >= c.targetRange[1];
  });
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

/** Bot'un gerçek hedeften ne kadar sapabileceği (±). 60 hedefte 50–70 bandı. */
export const BOT_TARGET_DRIFT = 10;

/**
 * Bot/oto kadro — HEDEFE yaklaşan ama KASITLI hata yapan 5 oyuncu seçer.
 *
 * Strateji: bot gerçek hedefi değil, `target ± [0..BOT_TARGET_DRIFT]` arası
 * rastgele bir "bot hedefi" kovalar. Böylece tam isabet etmez; 60 hedefinde
 * tipik olarak 50–70 bandında biter (insanın iyi oynayınca yenebileceği bir
 * rakip). Her adımda bu sapmalı hedefe göre "ideale yakın" adayları bir
 * pencereden rastgele seçer (Kadro Kur buildAutoSquad deseni).
 *
 * @param strength 0..1 — yüksek = sapmalı hedefe daha yakın (ama isabet garanti değil).
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

  // Kasıtlı sapma: bot ±BOT_TARGET_DRIFT içinde rastgele bir hedefi kovalar.
  const drift = Math.round((rng() * 2 - 1) * BOT_TARGET_DRIFT); // -10..+10
  const botTarget = Math.max(criterion.targetStep, target + drift);

  let runningTotal = 0;
  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    const slotsLeft = SLOT_COUNT - slot;
    // Bu slot için "ideal" katkı: kalan (sapmalı) hedefi kalan slotlara böl.
    const remaining = botTarget - runningTotal;
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

// ===========================================================================
// Snake draft (Arkadaşa Karşı / hot-seat) — iki oyuncu sırayla 1'er kart seçer.
// Mod 1 ile aynı yapı; ama burada pozisyon yok (5 düz slot). snakeDraftOrder
// squadMode'dan yeniden kullanılır (slot sayısı = SLOT_COUNT).
// ===========================================================================

export type DraftSide = 'P1' | 'P2';

/**
 * Snake draft sırası. Toplam 2×SLOT_COUNT adım. Tur içi sıra dönüşümlü
 * (A,B / B,A / A,B …) — standart yılan, ilk-seçen avantajını dengeler.
 * 5 slot → A B B A A B B A A B (10 adım).
 */
export function snakeDraftOrder(first: DraftSide = 'P1'): DraftSide[] {
  const other: DraftSide = first === 'P1' ? 'P2' : 'P1';
  const order: DraftSide[] = [];
  for (let round = 0; round < SLOT_COUNT; round++) {
    const [a, b] = round % 2 === 0 ? [first, other] : [other, first];
    order.push(a, b);
  }
  return order;
}

/** İki tarafın tüm seçtiği oyuncu id'leri — draft havuzundan çıkarılır. */
export function draftedTargetIds(p1: TargetPicks, p2: TargetPicks): Set<string> {
  const out = new Set<string>();
  for (const v of p1) if (v) out.add(v);
  for (const v of p2) if (v) out.add(v);
  return out;
}

/** Bir tarafın ilk boş slot indeksini döndürür (yoksa -1). */
export function firstEmptySlot(picks: TargetPicks): number {
  return picks.findIndex((v) => v === null);
}

/**
 * Süre dolunca draft oto-seçim — aktif tarafın ilk boş slotuna RASTGELE uygun
 * (kullanılmamış) bir oyuncu koyar. Aday yoksa null.
 */
export function autoPickForTargetDraft(
  picks: TargetPicks,
  criterion: TargetCriterion,
  pool: Player[],
  excludeIds: Set<string>,
  rng: () => number,
): { slotIdx: number; playerId: string } | null {
  const slotIdx = firstEmptySlot(picks);
  if (slotIdx < 0) return null;
  const avail = eligiblePool(criterion, pool, excludeIds);
  if (avail.length === 0) return null;
  const chosen = avail[Math.floor(rng() * avail.length)];
  return { slotIdx, playerId: chosen.id };
}
