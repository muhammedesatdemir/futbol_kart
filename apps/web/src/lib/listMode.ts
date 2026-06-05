/**
 * "Liste Doldur" modu — saf mantık (React/DOM yok, test edilebilir).
 *
 * Sıralı bir top-10 listesi (örn. "En çok milli maç") verilir; oyuncu havuzdan
 * kart seçerek isim tahmin eder. Seçilen oyuncu listedeyse otomatik gerçek
 * sırasına oturur ve o sıranın puanını kazanır (düz: 1. sıra = 1, 10. = 10).
 * En çok puanı toplayan kazanır. Sporcle tarzı "hatırlama" oyunu.
 *
 * Liste players.json'dan RUNTIME türetilir — ek dosya/scrape yok.
 * targetMode.ts'in kardeş şablonu.
 */
import type { Player } from '@futbol-kart/shared-types';
import {
  METRIC_FIELDS,
  LIST_POOL_FILTERS,
  type MetricField,
  type PoolFilterDef,
} from './criteriaCatalog';

/** Liste uzunluğu (top-10). */
export const LIST_SIZE = 10;

export type ListMetric = (p: Player) => number | null;

export interface ListCriterion {
  id: string;
  /** Liste başlığı (TR), örn. "En çok milli maç". */
  title: string;
  /** Birim, örn. "maç". */
  unit: string;
  /** Oyuncudan değeri çıkar (eksik → null → listeye giremez). */
  metric: ListMetric;
  /** Opsiyonel havuz kısıtı (örn. yalnız Türk oyuncular). Tanımsızsa tüm havuz. */
  poolFilter?: (p: Player) => boolean;
}

/**
 * Kriter ÜRETİCİSİ — "En çok {alan}" listesini (alan × filtre) kombinasyonundan
 * türetir. Kart kapışmadaki çoklu-şablon mantığının liste karşılığı. Stabil ID
 * (`ls_{alan}_{filtre}`) sayesinde oyun state'i kriteri ID ile saklayabilir.
 *
 * Yalnızca `listEligible` alanlar (top-10 olarak anlamlı, "yüksek = iyi"). Her
 * uygun alan, genel + birkaç filtre (pozisyon/aktif/milliyet) varyantıyla çoğaltılır.
 */
function buildListCriterion(field: MetricField, filter: PoolFilterDef | null): ListCriterion {
  const id = filter ? `ls_${field.key}_${filter.key}` : `ls_${field.key}`;
  const title = filter ? `${field.listLabel} (${filter.label})` : field.listLabel;
  return {
    id,
    title,
    unit: field.unit,
    metric: (p) => {
      const v = field.pick(p);
      return typeof v === 'number' && v > 0 ? v : null;
    },
    ...(filter ? { poolFilter: filter.test } : {}),
  };
}

/**
 * Tüm liste kriterleri = (listEligible alanlar) × (genel + uygun filtreler).
 * Filtreler: pozisyon (alan pozisyona uygunsa), aktif/efsane, büyük milliyetler.
 */
function generateListCriteria(): ListCriterion[] {
  const out: ListCriterion[] = [];
  for (const field of METRIC_FIELDS) {
    if (!field.listEligible) continue;
    // Genel (filtresiz)
    out.push(buildListCriterion(field, null));
    // Filtreli varyantlar
    for (const filter of LIST_POOL_FILTERS) {
      if (filter.appliesTo && !filter.appliesTo(field)) continue;
      out.push(buildListCriterion(field, filter));
    }
  }
  return out;
}

export const LIST_CRITERIA: ListCriterion[] = generateListCriteria();

/** Geriye dönük uyumluluk: eski tek kriter referansı. */
export const CRITERION_MOST_CAPS = LIST_CRITERIA.find((c) => c.id === 'ls_caps')!;

export function criterionById(id: string): ListCriterion | undefined {
  return LIST_CRITERIA.find((c) => c.id === id);
}

/**
 * Üretilen kriterleri GERÇEK havuza göre ayıkla — yalnız sağlıklı listeler kalır:
 *   - tam dolu top-LIST_SIZE üretebilen (yetersiz oyunculu kombinasyonlar elenir,
 *     örn. "kaleci golü", veri-dışı milliyet),
 *   - en az `minPhotos` fotoğraflı (kart görseli garantisi).
 * Uygulama açılışında bir kez çağrılıp seçim havuzu olarak kullanılır.
 */
export function pruneListCriteria(
  pool: Player[],
  criteria: ListCriterion[] = LIST_CRITERIA,
  minPhotos = 8,
): ListCriterion[] {
  const byId = new Map(pool.map((p) => [p.id, p]));
  return criteria.filter((c) => {
    const list = buildList(c, pool);
    if (list.length < LIST_SIZE) return false;
    const photos = list.filter((e) => byId.get(e.playerId)?.imageUrl).length;
    return photos >= minPhotos;
  });
}

/** Listedeki bir sıra. rank 1..LIST_SIZE. */
export interface ListEntry {
  rank: number;
  playerId: string;
  value: number;
}

/**
 * Kritere göre top-LIST_SIZE listesini havuzdan TÜRET. Metrik > 0 olanlar
 * azalan sıralanır, ilk LIST_SIZE alınır. Deterministik (eşit değerde id ile
 * sabit sıra — maç içinde tutarlı).
 */
export function buildList(criterion: ListCriterion, pool: Player[]): ListEntry[] {
  const eligible = pool
    .filter((p) => criterion.metric(p) !== null)
    .filter((p) => !criterion.poolFilter || criterion.poolFilter(p));
  eligible.sort((a, b) => {
    const d = criterion.metric(b)! - criterion.metric(a)!;
    return d !== 0 ? d : a.id.localeCompare(b.id); // eşitlikte deterministik
  });
  return eligible.slice(0, LIST_SIZE).map((p, i) => ({
    rank: i + 1,
    playerId: p.id,
    value: criterion.metric(p)!,
  }));
}

/** Düz puanlama: sıra = puan (1. sıra 1, 10. sıra 10 → az bilinen daha değerli). */
export function pointsForRank(rank: number): number {
  return rank;
}

export type GuessResult =
  | { hit: false }
  | { hit: true; entry: ListEntry; alreadyFilled: boolean };

/**
 * Bir tahmini değerlendir: seçilen oyuncu listede mi? Varsa entry'sini döndür.
 * `filledRanks` zaten açılmış sıralar — denk gelirse alreadyFilled=true (puan yok).
 */
export function evaluateGuess(
  playerId: string,
  list: ListEntry[],
  filledRanks: Set<number>,
): GuessResult {
  const entry = list.find((e) => e.playerId === playerId);
  if (!entry) return { hit: false };
  return { hit: true, entry, alreadyFilled: filledRanks.has(entry.rank) };
}

/** Bir tarafın açtığı sıraların toplam puanı. */
export function scoreFilled(filledRanks: Set<number>): number {
  let sum = 0;
  for (const r of filledRanks) sum += pointsForRank(r);
  return sum;
}

export type ListWinner = 'P1' | 'P2' | 'tie';

export function compareScores(p1: number, p2: number): ListWinner {
  if (p1 === p2) return 'tie';
  return p1 > p2 ? 'P1' : 'P2';
}

// ===========================================================================
// Snake draft (Arkadaşa Karşı) — sırayla tahmin (A-B-B-A-A-B…).
// ===========================================================================

export type ListSide = 'P1' | 'P2';

/**
 * Snake sırası — toplam adım sayısı kadar. Liste 10 sıralı ama tahminler
 * yanlış da olabilir, o yüzden adım sayısı sıradan fazla olmalı. `steps` kadar
 * dönüşümlü sıra üretir (A,B / B,A / …). Oyun liste dolunca erken biter.
 */
export function listSnakeOrder(steps: number, first: ListSide = 'P1'): ListSide[] {
  const other: ListSide = first === 'P1' ? 'P2' : 'P1';
  const order: ListSide[] = [];
  for (let round = 0; round < Math.ceil(steps / 2); round++) {
    const [a, b] = round % 2 === 0 ? [first, other] : [other, first];
    order.push(a, b);
  }
  return order.slice(0, steps);
}

/**
 * Bot tahminleri — listenin rastgele bir altkümesini "bilir". knownRatio kadar
 * sırayı doğru sayar (Mod 2 bot-drift felsefesi: yapay mükemmellik yok). Döndürdüğü
 * Set, botun bildiği rank'lar. Bota karşı modda bot bunları otomatik açar.
 */
export function botKnownRanks(
  list: ListEntry[],
  rng: () => number,
  knownRatio = 0.6,
): Set<number> {
  const ranks = list.map((e) => e.rank);
  // Fisher-Yates (rng ile) karıştır, ilk N'i al.
  const shuffled = [...ranks];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const n = Math.max(1, Math.round(list.length * knownRatio));
  return new Set(shuffled.slice(0, n));
}
