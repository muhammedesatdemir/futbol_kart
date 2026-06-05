/**
 * Kriter kataloğu — Liste/Hedef/Kadro modlarının PAYLAŞTIĞI tek veri kaynağı.
 *
 * Felsefe (kart kapışmanın 106 şablonu gibi): çeşitliliği elle 100 kriter yazarak
 * değil, **alan × filtre** kombinasyonundan ÜRETEREK sağlarız. Burada:
 *   - METRIC_FIELDS: bir oyuncudan sayısal değer çıkaran "alan" tanımları (etiket,
 *     birim, hangi moda uygun, hedef bandı ipucu).
 *   - POOL_FILTERS: havuzu daraltan "filtre" tanımları (pozisyon, aktiflik, milliyet).
 *
 * Her mod, bu katalogdan kendi kriter listesini üretir (stabil ID ile). Doluluk
 * oranları players.json üzerinde ölçüldü; yalnız ayırt edici (top-değeri anlamlı)
 * alanlar dahil edildi.
 */
import type { Player, Position } from '@futbol-kart/shared-types';

/** Bir oyuncudan değer çıkaran picker (eksikse undefined). */
type Picker = (p: Player) => number | undefined;

export interface MetricField {
  /** Stabil anahtar — kriter ID'sinin parçası (`ls_goals`, `tg_goals`...). */
  key: string;
  /** Liste başlığı: "En çok {…}" formunda tam ifade (örn. "En çok gol"). */
  listLabel: string;
  /** Hedef/Kadro için kısa ad (örn. "Toplam gol"). */
  shortLabel: string;
  /** Birim (örn. "gol", "maç", "cm", "M€"). */
  unit: string;
  /** Oyuncudan ham değeri çıkar. */
  pick: Picker;
  /** Liste modunda kriter olur mu? (top-10 anlamlı, "yüksek = iyi"). */
  listEligible: boolean;
  /** Hedef modunda kriter olur mu? (5 oyuncu toplamı anlamlı bir hedefe oturur). */
  targetEligible: boolean;
  /** Kadro modunda kriter olur mu? (11 slot toplamı anlamlı). */
  squadEligible: boolean;
  /** Kadro modunda yön — bazı alanlar min de sorulabilir (boy gibi). */
  squadDirections?: Array<'max' | 'min'>;
  /**
   * Hedef bandı: 5 oyuncu toplamı için [min, max] hedef + adım. buildTargetCriteria
   * bunu kullanır. Yoksa hedef modunda dışlanır (targetEligible=false ile tutarlı).
   * Değerler players.json dağılımından hesaplandı (scripts/analyzeTargets benzeri).
   */
  targetBand?: { range: [number, number]; step: number };
  /** Pozisyon filtresi anlamlı mı? (kaleci golü sormak saçma → false). */
  positionFilterable: boolean;
}

/** stat picker kısayolu. */
const s = (pick: (p: Player) => number | undefined): Picker => pick;

/**
 * SAĞLAM alanlar (doluluk + ayırt edicilik ölçüldü). Her biri birden çok modda
 * kullanılabilir. targetBand'ler 5-oyuncu toplamı dağılımından türetildi.
 */
export const METRIC_FIELDS: MetricField[] = [
  // ——— Kariyer toplamları (yüksek doluluk) ———
  { key: 'goals', listLabel: 'En çok gol', shortLabel: 'Toplam gol', unit: 'gol',
    pick: s((p) => p.stats.totalGoals), listEligible: true, targetEligible: true, squadEligible: true,
    squadDirections: ['max'], targetBand: { range: [800, 1400], step: 100 }, positionFilterable: true },
  { key: 'assists', listLabel: 'En çok asist', shortLabel: 'Toplam asist', unit: 'asist',
    pick: s((p) => p.stats.totalAssists), listEligible: true, targetEligible: true, squadEligible: true,
    squadDirections: ['max'], targetBand: { range: [400, 800], step: 50 }, positionFilterable: true },
  { key: 'apps', listLabel: 'En çok maç', shortLabel: 'Toplam maç', unit: 'maç',
    pick: s((p) => p.stats.totalApps), listEligible: true, targetEligible: true, squadEligible: true,
    squadDirections: ['max'], targetBand: { range: [2500, 4500], step: 250 }, positionFilterable: false },
  { key: 'caps', listLabel: 'En çok milli maç', shortLabel: 'Milli maç', unit: 'maç',
    pick: s((p) => p.stats.nationalCaps), listEligible: true, targetEligible: true, squadEligible: true,
    squadDirections: ['max'], targetBand: { range: [400, 700], step: 50 }, positionFilterable: false },
  { key: 'natgoals', listLabel: 'En çok milli gol', shortLabel: 'Milli gol', unit: 'gol',
    pick: s((p) => p.stats.nationalGoals), listEligible: true, targetEligible: true, squadEligible: true,
    squadDirections: ['max'], targetBand: { range: [150, 350], step: 25 }, positionFilterable: true },
  { key: 'seasongoals', listLabel: 'En çok tek-sezon golü', shortLabel: 'Tek sezon gol', unit: 'gol',
    pick: s((p) => p.stats.maxSeasonGoals), listEligible: true, targetEligible: true, squadEligible: true,
    squadDirections: ['max'], targetBand: { range: [150, 300], step: 25 }, positionFilterable: true },
  { key: 'career', listLabel: 'En uzun kariyer', shortLabel: 'Kariyer yılı', unit: 'yıl',
    pick: s((p) => p.stats.careerYears), listEligible: true, targetEligible: true, squadEligible: true,
    squadDirections: ['max', 'min'], targetBand: { range: [80, 130], step: 10 }, positionFilterable: false },
  { key: 'value', listLabel: 'En değerli (piyasa değeri)', shortLabel: 'Piyasa değeri', unit: 'M€',
    pick: s((p) => (p.stats.maxTransferFeeEUR ? Math.round(p.stats.maxTransferFeeEUR / 1_000_000) : undefined)),
    listEligible: true, targetEligible: true, squadEligible: true, squadDirections: ['max'],
    targetBand: { range: [300, 700], step: 50 }, positionFilterable: true },
  // ——— Fiziksel ———
  { key: 'height', listLabel: 'En uzun boy', shortLabel: 'Boy', unit: 'cm',
    pick: s((p) => (typeof p.heightCm === 'number' && p.heightCm > 0 ? p.heightCm : undefined)),
    listEligible: true, targetEligible: true, squadEligible: true, squadDirections: ['max', 'min'],
    targetBand: { range: [880, 940], step: 10 }, positionFilterable: true },
  // ——— Turnuva / lig kırılımları ———
  { key: 'uclapps', listLabel: 'En çok Şampiyonlar Ligi maçı', shortLabel: 'ŞL maçı', unit: 'maç',
    pick: s((p) => p.stats.competitions?.uclApps), listEligible: true, targetEligible: true, squadEligible: true,
    squadDirections: ['max'], targetBand: { range: [300, 600], step: 50 }, positionFilterable: false },
  { key: 'uclgoals', listLabel: 'En çok Şampiyonlar Ligi golü', shortLabel: 'ŞL golü', unit: 'gol',
    pick: s((p) => p.stats.competitions?.uclGoals), listEligible: true, targetEligible: false, squadEligible: true,
    squadDirections: ['max'], positionFilterable: true },
  { key: 'leaguegoals', listLabel: 'En çok lig golü', shortLabel: 'Lig golü', unit: 'gol',
    pick: s((p) => p.stats.competitions?.leagueGoals), listEligible: true, targetEligible: true, squadEligible: true,
    squadDirections: ['max'], targetBand: { range: [500, 1000], step: 100 }, positionFilterable: true },
  { key: 'leagueapps', listLabel: 'En çok lig maçı', shortLabel: 'Lig maçı', unit: 'maç',
    pick: s((p) => p.stats.competitions?.leagueApps), listEligible: true, targetEligible: true, squadEligible: true,
    squadDirections: ['max'], targetBand: { range: [1500, 2800], step: 250 }, positionFilterable: false },
  { key: 'wcapps', listLabel: 'En çok Dünya Kupası maçı', shortLabel: 'Dünya Kupası maçı', unit: 'maç',
    pick: s((p) => p.stats.competitions?.worldCupApps), listEligible: true, targetEligible: true, squadEligible: true,
    squadDirections: ['max'], targetBand: { range: [60, 80], step: 5 }, positionFilterable: false },
  // ——— Başarılar ———
  { key: 'trophies', listLabel: 'En çok kupa', shortLabel: 'Toplam kupa', unit: 'kupa',
    pick: s((p) => p.achievements.trophies?.totalTitles), listEligible: true, targetEligible: true, squadEligible: true,
    squadDirections: ['max'], targetBand: { range: [60, 120], step: 10 }, positionFilterable: false },
  { key: 'leaguetitles', listLabel: 'En çok lig şampiyonluğu', shortLabel: 'Lig şampiyonluğu', unit: 'kupa',
    pick: s((p) => p.achievements.trophies?.domesticLeagueTitles), listEligible: true, targetEligible: true, squadEligible: true,
    squadDirections: ['max'], targetBand: { range: [20, 50], step: 5 }, positionFilterable: false },
  { key: 'awards', listLabel: 'En çok bireysel ödül', shortLabel: 'Bireysel ödül', unit: 'ödül',
    pick: s((p) => p.achievements.trophies?.individual?.totalIndividual), listEligible: true, targetEligible: false, squadEligible: true,
    squadDirections: ['max'], positionFilterable: true },
];

export function fieldByKey(key: string): MetricField | undefined {
  return METRIC_FIELDS.find((f) => f.key === key);
}

// ===========================================================================
// FİLTRELER — havuzu daraltan eksenler. Her biri bir kriter "varyantı" üretir.
// ===========================================================================

export interface PoolFilterDef {
  /** Stabil anahtar — kriter ID'sinin parçası. */
  key: string;
  /** Etiket eki (başlığa parantez içinde eklenir). */
  label: string;
  /** Havuz testi. */
  test: (p: Player) => boolean;
  /**
   * Bu filtre yalnız belirli alanlara uygulanır mı? (örn. pozisyon filtresi
   * yalnız positionFilterable alanlara). undefined → tüm alanlara.
   */
  appliesTo?: (field: MetricField) => boolean;
}

const positionFilter = (pos: Position, label: string): PoolFilterDef => ({
  key: `pos${pos}`,
  label,
  test: (p) => p.position === pos,
  appliesTo: (f) => f.positionFilterable,
});

/** Büyük milliyetler (>=150 oyunculu) — filtreli liste hem zengin hem ayırt edici. */
const nationalityFilter = (code: string, label: string): PoolFilterDef => ({
  key: `nat${code}`,
  label,
  test: (p) => p.nationalityCode === code,
});

/**
 * LİSTE modu filtreleri. Pozisyon (golcü alanlarda), aktiflik, büyük milliyetler.
 * Her filtre, uygun her alana yeni bir liste kriteri ekler → çeşitlilik çarpanı.
 */
export const LIST_POOL_FILTERS: PoolFilterDef[] = [
  positionFilter('FWD', 'forvet'),
  positionFilter('MID', 'orta saha'),
  positionFilter('DEF', 'defans'),
  positionFilter('GK', 'kaleci'),
  { key: 'active', label: 'aktif', test: (p) => p.isActive },
  { key: 'legend', label: 'emekli', test: (p) => !p.isActive },
  nationalityFilter('TR', 'Türk'),
  nationalityFilter('BR', 'Brezilyalı'),
  nationalityFilter('AR', 'Arjantinli'),
  nationalityFilter('ES', 'İspanyol'),
  nationalityFilter('FR', 'Fransız'),
  nationalityFilter('DE', 'Alman'),
  nationalityFilter('IT', 'İtalyan'),
  nationalityFilter('EN', 'İngiliz'),
  nationalityFilter('NL', 'Hollandalı'),
];

/**
 * KADRO modu filtreleri — pozisyon yok (formasyonda zaten var), ama aktiflik +
 * milliyetler kadro çeşitliliğini katlar ("En golcü Türk kadrosu", "En değerli
 * Brezilyalı kadrosu"…). Yetersiz pozisyonlu kombinasyonlar pruneSquadCriteria
 * tarafından elenir (örn. küçük milliyetlerde kaleci/defans bulunamayabilir).
 */
export const SQUAD_POOL_FILTERS: PoolFilterDef[] = [
  { key: 'active', label: 'aktif', test: (p) => p.isActive },
  { key: 'legend', label: 'emekli', test: (p) => !p.isActive },
  nationalityFilter('TR', 'Türk'),
  nationalityFilter('BR', 'Brezilyalı'),
  nationalityFilter('AR', 'Arjantinli'),
  nationalityFilter('ES', 'İspanyol'),
  nationalityFilter('FR', 'Fransız'),
  nationalityFilter('DE', 'Alman'),
  nationalityFilter('IT', 'İtalyan'),
  nationalityFilter('EN', 'İngiliz'),
];
