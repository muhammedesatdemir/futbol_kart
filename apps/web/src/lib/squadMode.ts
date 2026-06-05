/**
 * "Kadro Kur" modu — saf mantık (React/DOM yok, test edilebilir).
 *
 * Oyuncular bir formasyonu pozisyon bazlı kartlarla doldurur; sistem seçilen
 * kriteri (örn. boy toplamı) toplar; iki kadro karşılaştırılır. VS düello
 * modundan (sessionMachine) tamamen bağımsız — joker/transfer/faz mekaniği yok.
 *
 * Tasarım notu (ince dikey dilim): şu an tek kriter ("en uzun kadro") ve tek
 * formasyon (6 slot) canlı. Ama yapı, kalan ~14 kriteri ve diğer formasyonları
 * yalnızca veri (SQUAD_CRITERIA / FORMATIONS) ekleyerek kapsayacak şekilde
 * kuruldu — bu, Mod 1 şablon formatının referansıdır.
 */
import type { Player, Position } from '@futbol-kart/shared-types';
import { METRIC_FIELDS, SQUAD_POOL_FILTERS } from './criteriaCatalog';

/** Bir formasyon slotu: hangi pozisyondan kart istenir. */
export interface FormationSlot {
  /** Slot id (stabil; UI key + ataması için). */
  id: string;
  position: Position;
  /** Saha üzerindeki gösterim etiketi (TR). */
  label: string;
}

export interface Formation {
  id: string;
  /** Gösterim adı, örn. "1-2-2-1". */
  name: string;
  slots: FormationSlot[];
}

/**
 * 4-3-3 — tam saha (varsayılan): 1 KL + 4 DEF + 3 ORT + 3 FOR = 11 slot.
 * Veri fazlasıyla yeter (boy: GK 357 / DEF 1446 / MID 2222 / FWD 3686).
 */
export const FORMATION_433: Formation = {
  id: 'f433',
  name: '4-3-3',
  slots: [
    { id: 'gk', position: 'GK', label: 'KL' },
    { id: 'def1', position: 'DEF', label: 'DEF' },
    { id: 'def2', position: 'DEF', label: 'DEF' },
    { id: 'def3', position: 'DEF', label: 'DEF' },
    { id: 'def4', position: 'DEF', label: 'DEF' },
    { id: 'mid1', position: 'MID', label: 'ORT' },
    { id: 'mid2', position: 'MID', label: 'ORT' },
    { id: 'mid3', position: 'MID', label: 'ORT' },
    { id: 'fwd1', position: 'FWD', label: 'FOR' },
    { id: 'fwd2', position: 'FWD', label: 'FOR' },
    { id: 'fwd3', position: 'FWD', label: 'FOR' },
  ],
};

/**
 * Eski 6 slot'luk formasyon — varsayılan değil, ileride "formasyon seç" için durur.
 * 1 KL + 2 DEF + 2 ORT + 1 FOR.
 */
export const FORMATION_6: Formation = {
  id: 'f6_1221',
  name: '1-2-2-1',
  slots: [
    { id: 'gk', position: 'GK', label: 'KL' },
    { id: 'def1', position: 'DEF', label: 'DEF' },
    { id: 'def2', position: 'DEF', label: 'DEF' },
    { id: 'mid1', position: 'MID', label: 'ORT' },
    { id: 'mid2', position: 'MID', label: 'ORT' },
    { id: 'fwd1', position: 'FWD', label: 'FOR' },
  ],
};

export const FORMATIONS: Formation[] = [FORMATION_433, FORMATION_6];

/** Bir kriterin değerini bir oyuncudan çıkaran fonksiyon (eksikse null). */
export type SquadMetric = (p: Player) => number | null;

export interface SquadCriterion {
  id: string;
  /** Soru başlığı (TR) — "En X kadroyu kur". */
  title: string;
  /** Toplam etiketi + birim, örn. "cm" / "yaş" / "gol". */
  unit: string;
  /** Daha yüksek toplam mı kazanır (max), yoksa daha düşük mü (min)? */
  direction: 'max' | 'min';
  /** Oyuncudan değeri çıkar (eksik veri → null → o slot 0 sayılır + uyarı). */
  metric: SquadMetric;
  /**
   * Opsiyonel havuz kısıtı — yalnızca bu koşulu sağlayan oyuncular seçilebilir.
   * Örn. yaş kriterlerinde "aktif futbolcu" (ölmüş/emekli efsaneler havuz dışı).
   * Tanımsızsa tüm tarihi havuz kullanılır.
   */
  poolFilter?: (p: Player) => boolean;
}

/** heightCm değeri (yoksa null). En uzun/en kısa kadro paylaşır. */
const heightMetric: SquadMetric = (p) =>
  typeof p.heightCm === 'number' && p.heightCm > 0 ? p.heightCm : null;

/**
 * Bir oyuncunun yaşı (tam yıl). birthDate referans tarihe göre hesaplanır.
 * Referans sabit (REFERENCE_YEAR) — deterministik + maç içinde tutarlı.
 */
const REFERENCE_YEAR = 2026;
const ageMetric: SquadMetric = (p) => {
  const y = Number((p.birthDate ?? '').slice(0, 4));
  if (!y || y < 1900) return null;
  return REFERENCE_YEAR - y;
};

/** stats alt alanı pozitifse döndür, değilse null (havuz dışı / 0 katkı). */
const statMetric =
  (pick: (p: Player) => number | undefined): SquadMetric =>
  (p) => {
    const v = pick(p);
    return typeof v === 'number' && v > 0 ? v : null;
  };

/** Forma numarası (ilk/birincil). 0 da geçerli olabilir → >=0 kabul. */
const jerseyMetric: SquadMetric = (p) =>
  p.jerseyNumbers.length > 0 ? p.jerseyNumbers[0] : null;

/**
 * Mod 1 kriter kataloğu. Her biri tek bir `SquadCriterion` nesnesi — yeni
 * sahne/route gerekmez. "İnce dilim" formatının kanıtladığı şablon yapısı.
 *
 * Veri notu: kaleci-ağırlıklı olmayan kriterlerde (gol/asist) GK slotu çoğu
 * zaman 0 katkı yapar — bu adil (iki taraf da aynı handikap) ve bilinçli.
 */
export const CRITERION_TALLEST: SquadCriterion = {
  id: 'sq_tallest',
  title: 'En uzun kadroyu kur',
  unit: 'cm',
  direction: 'max',
  metric: heightMetric,
};

/** ELLE yazılmış çekirdek kriterler — özel başlıkları olan, doğrulanmış set. */
const CORE_CRITERIA: SquadCriterion[] = [
  CRITERION_TALLEST,
  { id: 'sq_shortest', title: 'En kısa kadroyu kur', unit: 'cm', direction: 'min', metric: heightMetric },
  // Yaş kriterleri yalnızca AKTİF futbolcularla — ölmüş/emekli efsaneler havuz dışı.
  { id: 'sq_oldest', title: 'En yaşlı (aktif) kadroyu kur', unit: 'yaş', direction: 'max', metric: ageMetric, poolFilter: (p) => p.isActive },
  { id: 'sq_youngest', title: 'En genç kadroyu kur', unit: 'yaş', direction: 'min', metric: ageMetric, poolFilter: (p) => p.isActive },
  { id: 'sq_lowest_jersey', title: 'Forma numaraları toplamı en küçük kadroyu kur', unit: 'no', direction: 'min', metric: jerseyMetric },
];

/**
 * Kriter ÜRETİCİSİ — catalog'daki `squadEligible` alanlardan kadro kriterleri
 * türetir. Her alan, `squadDirections` (max/min) × (genel + uygun filtreler)
 * varyantlarıyla çoğaltılır → çeşitlilik çarpanı.
 */
function generateSquadCriteria(): SquadCriterion[] {
  const out: SquadCriterion[] = [];
  const dirWord = (dir: 'max' | 'min') => (dir === 'max' ? 'En çok' : 'En az');
  for (const field of METRIC_FIELDS) {
    if (!field.squadEligible) continue;
    const directions = field.squadDirections ?? ['max'];
    for (const dir of directions) {
      const metric: SquadMetric = (p) => {
        const v = field.pick(p);
        return typeof v === 'number' && v > 0 ? v : null;
      };
      // Genel
      out.push({ id: `sq_${field.key}_${dir}`, title: `${dirWord(dir)} ${field.shortLabel.toLowerCase()} kadrosunu kur`, unit: field.unit, direction: dir, metric });
      // Filtreli varyantlar (yalnız max yön — min+filtre çok niş)
      if (dir === 'max') {
        for (const filter of SQUAD_POOL_FILTERS) {
          out.push({ id: `sq_${field.key}_${dir}_${filter.key}`, title: `${dirWord(dir)} ${field.shortLabel.toLowerCase()} (${filter.label}) kadrosunu kur`, unit: field.unit, direction: dir, metric, poolFilter: filter.test });
        }
      }
    }
  }
  return out;
}

/** Çekirdek + üretilen — ID çakışması olursa çekirdek öncelikli. */
export const SQUAD_CRITERIA: SquadCriterion[] = (() => {
  const seen = new Set(CORE_CRITERIA.map((c) => c.id));
  const generated = generateSquadCriteria().filter((c) => !seen.has(c.id));
  return [...CORE_CRITERIA, ...generated];
})();

export function criterionById(id: string): SquadCriterion | undefined {
  return SQUAD_CRITERIA.find((c) => c.id === id);
}

/**
 * Kadro kriterlerini gerçek havuza göre ayıkla — her POZİSYON için yeterli aday
 * olmalı (formasyon 11 slot, pozisyon bazlı). Filtreli kriterlerde (Türk/aktif)
 * bazı pozisyonlar boş kalabilir → o kriter elenir.
 */
export function pruneSquadCriteria(
  pool: Player[],
  formation: Formation,
  criteria: SquadCriterion[] = SQUAD_CRITERIA,
  minPerPosition = 3,
): SquadCriterion[] {
  const neededPositions = new Set(formation.slots.map((s) => s.position));
  return criteria.filter((c) => {
    const eligible = pool.filter((p) => c.metric(p) !== null && (!c.poolFilter || c.poolFilter(p)));
    // Her gereken pozisyonda en az minPerPosition aday var mı?
    for (const pos of neededPositions) {
      if (eligible.filter((p) => p.position === pos).length < minPerPosition) return false;
    }
    return true;
  });
}

/** Bir tarafın doldurduğu kadro: slotId → playerId (null = boş). */
export type SquadAssignment = Record<string, string | null>;

export function emptyAssignment(formation: Formation): SquadAssignment {
  const a: SquadAssignment = {};
  for (const s of formation.slots) a[s.id] = null;
  return a;
}

export interface SquadScore {
  /** Slot bazlı dökümler (UI'da göstermek için). */
  perSlot: Array<{ slotId: string; playerId: string | null; value: number }>;
  total: number;
  /** Veri eksik olup 0 sayılan slot sayısı. */
  missing: number;
}

/** Bir kadronun toplam skorunu hesapla. Boş/eksik slot 0 katkı yapar. */
export function scoreSquad(
  assignment: SquadAssignment,
  formation: Formation,
  criterion: SquadCriterion,
  playersById: Map<string, Player>,
): SquadScore {
  const perSlot: SquadScore['perSlot'] = [];
  let total = 0;
  let missing = 0;
  for (const slot of formation.slots) {
    const pid = assignment[slot.id] ?? null;
    const player = pid ? playersById.get(pid) : undefined;
    const raw = player ? criterion.metric(player) : null;
    const value = raw ?? 0;
    if (player && raw === null) missing++;
    total += value;
    perSlot.push({ slotId: slot.id, playerId: pid, value });
  }
  return { perSlot, total, missing };
}

export type SquadWinner = 'P1' | 'P2' | 'tie';

/** İki kadroyu karşılaştır — yön (max/min) dikkate alınır. Eşitse 'tie'. */
export function compareSquads(
  p1: SquadScore,
  p2: SquadScore,
  criterion: SquadCriterion,
): SquadWinner {
  if (p1.total === p2.total) return 'tie';
  const p1Better =
    criterion.direction === 'max' ? p1.total > p2.total : p1.total < p2.total;
  return p1Better ? 'P1' : 'P2';
}

/**
 * Bot/oto kadro: her slot için kritere göre İYİ ama mükemmel-değil bir oyuncu
 * seçer (greedy, çakışmasız). Mükemmel kadro kurmaz — pozisyon başına sıralı
 * havuzun üst bir "penceresinden" rastgele seçer; pencere mutlak en iyiyi
 * dışlayacak şekilde kaydırılır (skip), böylece bot çoğu zaman insanın
 * yenebileceği orta-iyi bir kadro kurar.
 *
 * @param strength 0..1 — yüksek = daha iyi (ama asla "en iyiyi garanti" değil).
 */
export function buildAutoSquad(
  formation: Formation,
  criterion: SquadCriterion,
  pool: Player[],
  excludeIds: Set<string>,
  rng: () => number,
  strength = 0.55,
): SquadAssignment {
  const assignment = emptyAssignment(formation);
  const used = new Set(excludeIds);
  // Pozisyon başına, kritere göre sıralı aday havuzu (değeri olan + havuz kısıtı).
  const byPos = new Map<Position, Player[]>();
  for (const p of pool) {
    if (used.has(p.id)) continue;
    if (criterion.metric(p) === null) continue;
    if (criterion.poolFilter && !criterion.poolFilter(p)) continue;
    const list = byPos.get(p.position) ?? [];
    list.push(p);
    byPos.set(p.position, list);
  }
  for (const [, list] of byPos) {
    list.sort((a, b) => {
      const va = criterion.metric(a)!;
      const vb = criterion.metric(b)!;
      return criterion.direction === 'max' ? vb - va : va - vb;
    });
  }
  for (const slot of formation.slots) {
    const list = byPos.get(slot.position) ?? [];
    const candidates = list.filter((p) => !used.has(p.id));
    if (candidates.length === 0) continue;
    // "En iyiyi atla": ilk birkaç (en güçlü) adayı pas geç, sonra bir pencereden
    // rastgele seç. skip + pencere strength'e bağlı — yüksek strength daha iyi
    // ama yine de en iyiyi garanti etmez (heyecan + adil kapışma).
    const n = candidates.length;
    const skip = Math.min(n - 1, Math.round((1 - strength) * 3) + 1); // 1..4 arası
    const windowSize = Math.max(3, Math.round((1 - strength) * 12) + 4); // ~5..16
    const start = Math.min(skip, Math.max(0, n - 1));
    const end = Math.min(n, start + windowSize);
    const idx = start + Math.floor(rng() * Math.max(1, end - start));
    const chosen = candidates[Math.min(idx, n - 1)];
    assignment[slot.id] = chosen.id;
    used.add(chosen.id);
  }
  return assignment;
}

// ===========================================================================
// Snake draft (Arkadaşa Karşı / hot-seat) — iki oyuncu sırayla 1'er oyuncu seçer.
// ===========================================================================

export type DraftSide = 'P1' | 'P2';

/**
 * Snake draft sırası. Toplam 2×slotSayısı adım. Her "tur"da iki taraf da
 * bir seçim yapar ama tur içi sıra dönüşümlü:
 *   Tur 0: A, B    Tur 1: B, A    Tur 2: A, B   ...
 * Bu, ilk-seçen avantajını dengeler (standart snake draft).
 *
 * @returns adım sırası — örn. ['P1','P2','P2','P1','P1','P2', ...]
 */
export function snakeDraftOrder(slotCount: number, first: DraftSide = 'P1'): DraftSide[] {
  const other: DraftSide = first === 'P1' ? 'P2' : 'P1';
  const order: DraftSide[] = [];
  for (let round = 0; round < slotCount; round++) {
    // Çift turda first önce, tek turda other önce (yılan).
    const [a, b] = round % 2 === 0 ? [first, other] : [other, first];
    order.push(a, b);
  }
  return order;
}

/** Bir tarafın kadrosunda ilk boş slotları (id) döndürür. */
export function emptySlots(assignment: SquadAssignment, formation: Formation): FormationSlot[] {
  return formation.slots.filter((s) => assignment[s.id] === null);
}

/** İki tarafın tüm atanmış oyuncu id'leri — draft havuzundan çıkarılır. */
export function draftedIds(p1: SquadAssignment, p2: SquadAssignment): Set<string> {
  const out = new Set<string>();
  for (const v of Object.values(p1)) if (v) out.add(v);
  for (const v of Object.values(p2)) if (v) out.add(v);
  return out;
}

/**
 * Bir slot için kritere göre uygun, kullanılmamış adayları sıralı döndürür.
 * (En iyi → en kötü, yöne göre.)
 */
export function candidatesForSlot(
  slot: FormationSlot,
  criterion: SquadCriterion,
  pool: Player[],
  excludeIds: Set<string>,
): Player[] {
  return pool
    .filter((p) => p.position === slot.position)
    .filter((p) => criterion.metric(p) !== null)
    .filter((p) => !criterion.poolFilter || criterion.poolFilter(p))
    .filter((p) => !excludeIds.has(p.id))
    .sort((a, b) => {
      const va = criterion.metric(a)!;
      const vb = criterion.metric(b)!;
      return criterion.direction === 'max' ? vb - va : va - vb;
    });
}

export interface Suggestion {
  slotId: string;
  playerId: string;
  /** O kriterdeki ham değer (UI'da "21 yıl" gibi gösterilir). */
  value: number;
}

/**
 * Öneri jokeri — kalan boş mevkilerden birine, kritere göre İYİ-MÜKEMMEL arası
 * (rastgele değil) bir oyuncu önerir. Mutlak en iyiyi değil, üst dilimden bir
 * aday seçer (oyuncuya yardım ama oyunu bitirmez). Öneri için istatistik döner.
 *
 * Strateji: boş slotlar arasında "en iyi adayı en güçlü olan" slotu seç (en
 * değerli öneri), o slotun üst ~%15'inden (en az 1, en çok 4 aday) birini al.
 */
export function suggestForDraft(
  assignment: SquadAssignment,
  formation: Formation,
  criterion: SquadCriterion,
  pool: Player[],
  excludeIds: Set<string>,
  rng: () => number,
): Suggestion | null {
  const slots = emptySlots(assignment, formation);
  if (slots.length === 0) return null;

  // Her boş slot için aday listesini hazırla, en iyi adayı olan slotu seç.
  let best: { slot: FormationSlot; cands: Player[] } | null = null;
  for (const slot of slots) {
    const cands = candidatesForSlot(slot, criterion, pool, excludeIds);
    if (cands.length === 0) continue;
    if (!best || criterion.metric(cands[0])! > criterion.metric(best.cands[0])! === (criterion.direction === 'max')) {
      // direction'a göre "daha iyi ilk aday" olan slotu tercih et.
      if (!best) best = { slot, cands };
      else {
        const a = criterion.metric(cands[0])!;
        const b = criterion.metric(best.cands[0])!;
        const better = criterion.direction === 'max' ? a > b : a < b;
        if (better) best = { slot, cands };
      }
    }
  }
  if (!best) return null;

  // İYİ-MÜKEMMEL arası: üst dilimden seç (en iyi 1..4 aday içinden).
  const topK = Math.min(4, Math.max(1, Math.ceil(best.cands.length * 0.15)));
  const idx = Math.floor(rng() * topK);
  const chosen = best.cands[Math.min(idx, best.cands.length - 1)];
  return {
    slotId: best.slot.id,
    playerId: chosen.id,
    value: criterion.metric(chosen)!,
  };
}

/**
 * Süre dolunca oto-seçim — RASTGELE bir boş mevkiye, o mevkiye uygun RASTGELE
 * bir oyuncu (kullanıcı talebi: "random mevkiye random oyuncu"). Aday yoksa null.
 */
export function autoPickForDraft(
  assignment: SquadAssignment,
  formation: Formation,
  criterion: SquadCriterion,
  pool: Player[],
  excludeIds: Set<string>,
  rng: () => number,
): { slotId: string; playerId: string } | null {
  const slots = emptySlots(assignment, formation);
  if (slots.length === 0) return null;
  // Rastgele slot sırası dene — adayı olan ilkini al.
  const shuffledSlots = [...slots].sort(() => rng() - 0.5);
  for (const slot of shuffledSlots) {
    const cands = candidatesForSlot(slot, criterion, pool, excludeIds);
    if (cands.length === 0) continue;
    const chosen = cands[Math.floor(rng() * cands.length)];
    return { slotId: slot.id, playerId: chosen.id };
  }
  return null;
}
