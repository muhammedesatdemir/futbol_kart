/**
 * "4'lü Kıyas" modu — saf mantık (React/DOM yok, test edilebilir).
 *
 * Her TUR ekrana 4 futbolcu kartı + 1 metrik gelir (örn. "Hangisinin TOPLAM GOLÜ
 * en fazla?"). İki oyuncu AYNI ANDA bir kart seçer; reveal'da 4 gerçek değer +
 * doğru cevap birlikte açılır. Doğru seçen +1 puan. 7 tur, en çok puan kazanır
 * (berabere = berabere, uzatma YOK — kardeş modlarla tutarlı).
 *
 * Ortak Bul (`commonMode.ts`) deseninin uyarlaması: her tur YENİ içerik +
 * EŞZAMANLI seçim + reveal'da iki cevap birlikte. Tek seçim/tur → can YOK.
 *
 * ADİL SEÇİM (PLAN §14.3 "pozisyon-grupla + percentile bantlama"):
 *  - `isMarquee` havuz (bilinmedik oyuncu sorulmaz).
 *  - Metrik seed'den deterministik (METRIC_FIELDS — Liste/Hedef/Kadro ile ortak).
 *  - Metrik pozisyona bağlıysa (gol/boy → `positionFilterable`) 4 oyuncu da AYNI
 *    pozisyon grubundan ("kaleci golü vs forvet golü" saçmalığı engellenir).
 *  - Ankraj + percentile bandı: yakın ama eşit-olmayan 4 oyuncu.
 *  - Belirginlik şartı: doğru cevap (en yüksek) 2.'den ≥ MIN_MARGIN_RATIO fazla
 *    olsun ("ölü tur"/belirsizlik yok).
 *
 * 2 JOKER (her biri maçta 1×; aynı turda birlikte kullanılabilir = garanti doğru):
 *  - %50 (eleme): istatistik-bazlı 2 şık elenir → kalan = doğru + en yakın çeldirici.
 *  - x2 (çift işaret): o turda 2 seçim hakkı; ikisinden biri doğruysa +1.
 *
 * Veri: players.json (stats). Ek scrape/runtime hesap yok. Bkz PLAN.md §14.3, §22.
 */
import type { Player, Position } from '@futbol-kart/shared-types';
import { createPRNG } from '@futbol-kart/game-engine';
import { METRIC_FIELDS } from './criteriaCatalog';

/** Bir maçtaki tur sayısı. */
export const QUIZ_ROUNDS = 7;
/** Bir turdaki kart (şık) sayısı. */
export const QUIZ_CHOICES = 4;
/**
 * Belirginlik şartı: doğru cevap (1.) ikinciden EN AZ bu oranda fazla olmalı
 * (örn. 1.15 → %15). "Berabere/belirsiz" turları (4 değer birbirine çok yakın)
 * eler. Düşük-varyanslı metriklerde (boy) bantlamanın yine de tetiklenmesi için
 * mutlak bir alt-fark da (MIN_MARGIN_ABS) aranır.
 */
const MIN_MARGIN_RATIO = 1.15;
/** Mutlak minimum fark (oran küçük değerlerde anlamsızlaşır; örn. 70 vs 71 kupa). */
const MIN_MARGIN_ABS = 2;

export type QuizSide = 'P1' | 'P2';

/** Joker türleri. */
export type QuizJoker = 'fifty' | 'double';

// ===========================================================================
// Marquee (tanınırlık) — bilinmeyen oyuncu sorulmasın (careerMode ile aynı felsefe)
// ===========================================================================

/**
 * Oyuncu "tanınır" mı? (PLAN §14.0 marquee). Fotoğrafı olmalı + (≥30 milli maç
 * VEYA ≥25M zirve transfer). Efsaneleri de (caps) modern yıldızları da (değer) yakalar.
 */
export function isMarquee(p: Player): boolean {
  if (!p.imageUrl) return false;
  const s = p.stats;
  return (s?.nationalCaps ?? 0) >= 30 || (s?.maxTransferFeeEUR ?? 0) >= 25_000_000;
}

// ===========================================================================
// Metrik havuzu — 4'lü Kıyas metrikleri (criteriaCatalog alt-kümesi + quiz-özel)
// ===========================================================================

/** 4'lü Kıyas'ın ihtiyaç duyduğu sade metrik modeli (MetricField'ın çekirdeği). */
export interface QuizMetric {
  key: string;
  /** Kısa etiket (büyük başlık). */
  shortLabel: string;
  /** Birim (gol/maç/kupa/cm/M€…). */
  unit: string;
  /** Tek oyuncudan ham değer (yoksa undefined/0). */
  pick: (p: Player) => number | undefined;
  /** Pozisyona bağlı mı? (gol → evet; toplam maç → hayır) */
  positionFilterable: boolean;
}

/** criteriaCatalog'taki bir MetricField'ı QuizMetric'e indir. */
function fromCatalog(key: string): QuizMetric {
  const f = METRIC_FIELDS.find((m) => m.key === key)!;
  return {
    key: f.key,
    shortLabel: f.shortLabel,
    unit: f.unit,
    pick: f.pick,
    positionFilterable: f.positionFilterable,
  };
}

/** stat picker kısayolu (undefined/NaN korumalı çağıran tarafta). */
const pk = (fn: (p: Player) => number | undefined) => fn;

/**
 * Bu modda kullanılabilir metrikler. (A) criteriaCatalog'tan listEligible olanlar
 * + (B) quiz-özel YENİ metrikler (doluluk + ayırt edicilik players.json'da ölçüldü;
 * yalnız ≥%40 dolu + net-kazanan üreten alanlar — "ölü tur" üretmez).
 */
export const QUIZ_METRICS: QuizMetric[] = [
  // (A) Kataloğtan gelen 17 metrik
  ...METRIC_FIELDS.filter((f) => f.listEligible).map((f) => fromCatalog(f.key)),
  // (B) Quiz-özel yeni metrikler (criteriaCatalog'a dokunmaz; ölçülmüş güvenli alanlar)
  { key: 'leagueassists', shortLabel: 'Lig asisti', unit: 'asist', positionFilterable: true,
    pick: pk((p) => p.stats.competitions?.leagueAssists) },
  { key: 'uelapps', shortLabel: 'Avrupa Ligi maçı', unit: 'maç', positionFilterable: false,
    pick: pk((p) => p.stats.competitions?.uelApps) },
  { key: 'uelgoals', shortLabel: 'Avrupa Ligi golü', unit: 'gol', positionFilterable: true,
    pick: pk((p) => p.stats.competitions?.uelGoals) },
  { key: 'uclassists', shortLabel: 'Şampiyonlar Ligi asisti', unit: 'asist', positionFilterable: true,
    pick: pk((p) => p.stats.competitions?.uclAssists) },
  { key: 'domcupapps', shortLabel: 'Ulusal kupa maçı', unit: 'maç', positionFilterable: false,
    pick: pk((p) => p.stats.competitions?.domesticCupApps) },
  { key: 'domcupgoals', shortLabel: 'Ulusal kupa golü', unit: 'gol', positionFilterable: true,
    pick: pk((p) => p.stats.competitions?.domesticCupGoals) },
  { key: 'domcuptitles', shortLabel: 'Ulusal kupa', unit: 'kupa', positionFilterable: false,
    pick: pk((p) => p.achievements.trophies?.domesticCupTitles) },
  { key: 'last5goals', shortLabel: 'Son sezonların lig golü', unit: 'gol', positionFilterable: true,
    pick: pk((p) => p.stats.last5LeagueGoals) },
  { key: 'clubs', shortLabel: 'Farklı kulüp sayısı', unit: 'kulüp', positionFilterable: false,
    pick: pk((p) => new Set(p.clubs.map((c) => c.clubId)).size) },
];

export function metricByKey(key: string): QuizMetric | undefined {
  return QUIZ_METRICS.find((f) => f.key === key);
}

// ===========================================================================
// Türkçe soru ifadeleri (iyelik eki + net anlam) — UI metni, veriye dokunmaz
// ===========================================================================

/** Bir metriğin Türkçe ifade biçimi (sahne başlığı + reveal için). */
export interface QuizPhrase {
  /** "Hangisinin ___ en fazla/yüksek?" boşluğu (iyelik ekli; örn. "toplam kupası"). */
  question: string;
  /** "En çok/yüksek ___" reveal başlığı boşluğu (örn. "toplam kupa"). */
  reveal: string;
  /** Karşılaştırma fiili — sayılabilir → "en fazla", ölçü → "en yüksek". */
  most: 'en fazla' | 'en yüksek';
}

/**
 * Metrik → Türkçe ifade. `criteriaCatalog.shortLabel` ham/eksiz (örn. "Toplam kupa");
 * burada iyelik eki + uygun fiil verilir → "Hangisinin TOPLAM KUPASI en fazla?".
 * Transfer/piyasa değeri NET ifade edilir: kariyer ZİRVE değeri (aktif değil).
 */
const QUIZ_METRIC_PHRASES: Record<string, QuizPhrase> = {
  goals: { question: 'toplam golü', reveal: 'toplam gol', most: 'en fazla' },
  assists: { question: 'toplam asisti', reveal: 'toplam asist', most: 'en fazla' },
  apps: { question: 'toplam maçı', reveal: 'toplam maç', most: 'en fazla' },
  caps: { question: 'milli maçı', reveal: 'milli maç', most: 'en fazla' },
  natgoals: { question: 'milli golü', reveal: 'milli gol', most: 'en fazla' },
  seasongoals: { question: 'tek sezonluk gol rekoru', reveal: 'tek sezon gol rekoru', most: 'en yüksek' },
  career: { question: 'kariyer süresi', reveal: 'kariyer süresi', most: 'en uzun' as 'en yüksek' },
  // Transfer değeri NET: kariyer ZİRVESİNDE ulaştığı en yüksek piyasa değeri.
  value: { question: 'kariyerindeki zirve piyasa değeri', reveal: 'zirve piyasa değeri', most: 'en yüksek' },
  height: { question: 'boyu', reveal: 'boy', most: 'en yüksek' },
  uclapps: { question: 'Şampiyonlar Ligi maçı', reveal: 'Şampiyonlar Ligi maçı', most: 'en fazla' },
  uclgoals: { question: 'Şampiyonlar Ligi golü', reveal: 'Şampiyonlar Ligi golü', most: 'en fazla' },
  leaguegoals: { question: 'lig golü', reveal: 'lig golü', most: 'en fazla' },
  leagueapps: { question: 'lig maçı', reveal: 'lig maçı', most: 'en fazla' },
  wcapps: { question: 'Dünya Kupası maçı', reveal: 'Dünya Kupası maçı', most: 'en fazla' },
  trophies: { question: 'toplam kupası', reveal: 'toplam kupa', most: 'en fazla' },
  leaguetitles: { question: 'lig şampiyonluğu', reveal: 'lig şampiyonluğu', most: 'en fazla' },
  awards: { question: 'bireysel ödülü', reveal: 'bireysel ödül', most: 'en fazla' },
  // Quiz-özel yeni metrikler
  leagueassists: { question: 'lig asisti', reveal: 'lig asisti', most: 'en fazla' },
  uelapps: { question: 'Avrupa Ligi maçı', reveal: 'Avrupa Ligi maçı', most: 'en fazla' },
  uelgoals: { question: 'Avrupa Ligi golü', reveal: 'Avrupa Ligi golü', most: 'en fazla' },
  uclassists: { question: 'Şampiyonlar Ligi asisti', reveal: 'Şampiyonlar Ligi asisti', most: 'en fazla' },
  domcupapps: { question: 'ulusal kupa maçı', reveal: 'ulusal kupa maçı', most: 'en fazla' },
  domcupgoals: { question: 'ulusal kupa golü', reveal: 'ulusal kupa golü', most: 'en fazla' },
  domcuptitles: { question: 'ulusal kupası', reveal: 'ulusal kupa', most: 'en fazla' },
  last5goals: { question: 'son sezonlardaki lig golü', reveal: 'son sezon lig golü', most: 'en fazla' },
  clubs: { question: 'forma giydiği farklı kulüp sayısı', reveal: 'farklı kulüp sayısı', most: 'en fazla' },
};

/** Metriğin Türkçe ifadesi (yoksa shortLabel'den makul fallback). */
export function quizPhrase(key: string): QuizPhrase {
  const p = QUIZ_METRIC_PHRASES[key];
  if (p) return p;
  const f = metricByKey(key);
  const label = (f?.shortLabel ?? key).toLocaleLowerCase('tr-TR');
  return { question: label, reveal: label, most: 'en fazla' };
}

/** Pozisyon grubu → Türkçe çoğul-bağlam etiketi (soru bağlamı: "...forvetler arasında"). */
export function positionGroupLabel(group: Position | null): string | null {
  switch (group) {
    case 'GK':
      return 'kaleciler';
    case 'DEF':
      return 'defans oyuncuları';
    case 'MID':
      return 'orta saha oyuncuları';
    case 'FWD':
      return 'forvetler';
    default:
      return null;
  }
}

/**
 * Soru bağlamı (sıfat + pozisyon noun) — "...arasında" öncesi. Türkçe sıralama:
 *   filtre sıfatı + pozisyon/genel-noun → çoğul.
 *   ("Brezilyalı forvetler", "aktif oyuncular", "Türk futbolcular", "forvetler").
 * Hiç filtre+pozisyon yoksa null (sade "Hangisinin ...").
 */
export function quizContextLabel(filterKey: string | null, group: Position | null): string | null {
  const adj = filterByKey(filterKey)?.adjective ?? null;
  const pos = positionGroupLabel(group);
  if (adj && pos) return `${adj} ${pos}`;
  if (adj) return `${adj} futbolcular`;
  if (pos) return pos;
  return null;
}

/** Bir oyuncunun metrikteki ham değeri (yoksa null). */
export function metricValue(field: QuizMetric, p: Player): number | null {
  const v = field.pick(p);
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

// ===========================================================================
// Filtre ekseni (çeşitlilik çarpanı) — çağ + milliyet (pozisyon ayrı eksende)
// ===========================================================================

/** Bir havuz filtresi: oyuncuyu daraltır + Türkçe ifade ekleri taşır. */
export interface QuizFilter {
  key: string;
  test: (p: Player) => boolean;
  /** Soru ifadesine eklenen sıfat (örn. "Brezilyalı", "aktif"). */
  adjective: string;
}

/** Çağ filtreleri (×2). */
const ERA_FILTERS: QuizFilter[] = [
  { key: 'active', adjective: 'aktif', test: (p) => p.isActive },
  { key: 'legend', adjective: 'emekli', test: (p) => !p.isActive },
];

/** Milliyet filtreleri (Liste Doldur ile aynı 9 ülke). */
const NAT_FILTERS: QuizFilter[] = [
  { key: 'natTR', adjective: 'Türk', test: (p) => p.nationalityCode === 'TR' },
  { key: 'natBR', adjective: 'Brezilyalı', test: (p) => p.nationalityCode === 'BR' },
  { key: 'natAR', adjective: 'Arjantinli', test: (p) => p.nationalityCode === 'AR' },
  { key: 'natES', adjective: 'İspanyol', test: (p) => p.nationalityCode === 'ES' },
  { key: 'natFR', adjective: 'Fransız', test: (p) => p.nationalityCode === 'FR' },
  { key: 'natDE', adjective: 'Alman', test: (p) => p.nationalityCode === 'DE' },
  { key: 'natIT', adjective: 'İtalyan', test: (p) => p.nationalityCode === 'IT' },
  { key: 'natEN', adjective: 'İngiliz', test: (p) => p.nationalityCode === 'EN' },
  { key: 'natNL', adjective: 'Hollandalı', test: (p) => p.nationalityCode === 'NL' },
];

/**
 * Filtre eksenleri. `null` = filtre yok (sade soru). buildQuizRounds her tur bir
 * eksen seçer (ya çağ ya milliyet ya hiç) → "En golcü Brezilyalı", "en değerli
 * aktif oyuncu", veya filtresiz. (Pozisyon AYRI bir eksen — positionGroup.)
 */
export const QUIZ_FILTERS: Array<QuizFilter | null> = [null, ...ERA_FILTERS, ...NAT_FILTERS];

export function filterByKey(key: string | null): QuizFilter | null {
  if (!key) return null;
  return QUIZ_FILTERS.find((f) => f?.key === key) ?? null;
}

// ===========================================================================
// Tur içeriği — ekrana giden 4'lü çeyrek (cevap sunucu-içi)
// ===========================================================================

/** Bir turdaki tek bir şık (ekrana giden — DEĞER GİZLİ, reveal'da açılır). */
export interface QuizChoice {
  playerId: string;
}

/** Bir tur (sunucu-içi tam veri: değerler + doğru cevap dahil). */
export interface QuizRound {
  /** Metrik anahtarı — değer build-time `pick`le çözülür (state'te `values` hazır). */
  metricKey: string;
  /**
   * Pozisyon grubu — yalnız pozisyona-bağlı metriklerde (4 oyuncu bu gruptan).
   * Soru ifadesine bağlam katar ("en golcü forvet?") → çeşitlilik artar. Yoksa null.
   */
  positionGroup: Position | null;
  /** Filtre anahtarı (çağ/milliyet) — havuz daraltıldı + ifadeye sıfat. Yoksa null. */
  filterKey: string | null;
  /** 4 oyuncu id'si (ekran sırası — karıştırılmış). */
  choiceIds: string[];
  /** Her oyuncunun metrikteki ham değeri (choiceIds ile aynı sıra). */
  values: number[];
  /** Doğru cevabın choiceIds içindeki indexi (en yüksek değer). */
  correctIndex: number;
  /**
   * %50 jokeri elerse KALACAK iki index (doğru + en yakın çeldirici).
   * Önceden hesaplanır (deterministik) → joker basınca sunucu/offline aynı sonucu verir.
   */
  fiftyKeepIndexes: [number, number];
}

/** Ekrana giden tur (DEĞER + doğru cevap GİZLİ — spoiler koruması). */
export interface QuizRoundView {
  metricKey: string;
  /** Metrik etiketi (örn. "Toplam gol") — sahne başlığı için. */
  metricLabel: string;
  /** Metrik birimi (örn. "gol"). */
  metricUnit: string;
  /** 4 oyuncu id'si (ekran sırası). */
  choiceIds: string[];
}

/** Reveal/sonuç için tam tur dökümü (değerler + doğru cevap açık). */
export interface QuizRoundReveal extends QuizRoundView {
  values: number[];
  correctIndex: number;
}

// ===========================================================================
// 4'lü seçim algoritması (modun kalbi — adil + belirgin)
// ===========================================================================

/** Pozisyon → kaba grup (gol/boy gibi pozisyon-bağımlı metrikte aynı gruptan seç). */
function positionGroup(pos: Position): Position {
  return pos; // GK/DEF/MID/FWD zaten kaba grup (4 sınıf yeter).
}

/**
 * Bir metrik için aday havuzu: marquee + metrikte değeri olan oyuncular.
 * Metrik pozisyona bağlıysa (`positionFilterable`) verilen pozisyon grubundan;
 * ayrıca opsiyonel filtre (çağ/milliyet) uygulanır.
 */
function metricPool(
  field: QuizMetric,
  players: Player[],
  group: Position | null,
  filter: QuizFilter | null,
): Player[] {
  return players.filter((p) => {
    if (!isMarquee(p)) return false;
    if (group !== null && positionGroup(p.position) !== group) return false;
    if (filter && !filter.test(p)) return false;
    return metricValue(field, p) !== null && metricValue(field, p)! > 0;
  });
}

/**
 * Bir aday havuzdan adil + belirgin bir 4'lü kıyas turu kur (deterministik PRNG).
 *  1. Havuzu metriğe göre azalan sırala (percentile için sıralı dizi).
 *  2. Rastgele bir ANKRAJ index seç (uçlardan kaçın — bant taşmasın).
 *  3. Ankrajın percentile'ı ±bandından (sıralı dizide ±window komşu) 4 aday topla.
 *  4. BELİRGİNLİK: 4 adayın en yükseği 2.'den ≥ MIN_MARGIN ise kabul; değilse
 *     bandı genişlet/kaydır (birkaç deneme), olmazsa null (çağıran başka metrik dener).
 * Döndürülen 4 oyuncu KARIŞTIRILIR (doğru cevap sıradan anlaşılmaz).
 */
function buildRoundFromPool(
  field: QuizMetric,
  pool: Player[],
  rng: () => number,
): { ids: string[]; values: number[] } | null {
  if (pool.length < QUIZ_CHOICES + 2) return null;
  const sorted = [...pool].sort(
    (a, b) => (metricValue(field, b) ?? 0) - (metricValue(field, a) ?? 0),
  );
  const n = sorted.length;

  // Birkaç ankraj dene; belirginlik sağlanınca dur.
  // Ankrajı dağılımın ÜST ~%60'ına yasla: alt kuyruk (örn. "12 vs 10 gol")
  // değerleri küçük + tanınması zor → daha anlamlı/yüksek değerli turlar.
  const anchorCap = Math.max(QUIZ_CHOICES, Math.ceil(n * 0.6));
  for (let attempt = 0; attempt < 24; attempt++) {
    // Pencere genişliği: percentile ±~%8'lik bir bant (en az QUIZ_CHOICES kadar).
    const window = Math.max(QUIZ_CHOICES, Math.round(n * 0.08) + attempt);
    // Ankraj: üst dilimden (deneme arttıkça aşağı doğru genişler) bir başlangıç.
    const cap = Math.min(n - QUIZ_CHOICES, anchorCap + attempt * QUIZ_CHOICES);
    const maxStart = Math.max(0, Math.min(n - window, cap));
    const start = Math.floor(rng() * (maxStart + 1));
    const slice = sorted.slice(start, start + window);
    if (slice.length < QUIZ_CHOICES) continue;

    // Bant içinden QUIZ_CHOICES farklı oyuncu seç (rastgele ama yakın değerli).
    const picked = pickDistinct(slice, QUIZ_CHOICES, rng);
    const vals = picked.map((p) => metricValue(field, p) ?? 0);
    const sortedVals = [...vals].sort((a, b) => b - a);
    const top = sortedVals[0]!;
    const second = sortedVals[1]!;
    // Belirginlik: en yüksek, ikinciden net fazla mı?
    if (top >= second * MIN_MARGIN_RATIO && top - second >= MIN_MARGIN_ABS) {
      // Karıştır (doğru cevap sıradan anlaşılmasın).
      const order = shuffleIndexes(picked.length, rng);
      const ids = order.map((i) => picked[i]!.id);
      const values = order.map((i) => vals[i]!);
      return { ids, values };
    }
  }
  return null;
}

/** Bir diziden n FARKLI öğe seç (Fisher-Yates prefix). */
function pickDistinct<T>(arr: T[], n: number, rng: () => number): T[] {
  const a = [...arr];
  for (let i = 0; i < Math.min(n, a.length); i++) {
    const j = i + Math.floor(rng() * (a.length - i));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a.slice(0, n);
}

/** 0..n-1 index dizisini karıştır. */
function shuffleIndexes(n: number, rng: () => number): number[] {
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [idx[i], idx[j]] = [idx[j]!, idx[i]!];
  }
  return idx;
}

/**
 * GK'nin anlamlı olduğu pozisyon-bağlı metrikler. "Kaleci golü/asisti" saçma →
 * GK yalnız fiziksel/değer metriklerinde aday olur (boy, piyasa değeri).
 */
const GK_OK_METRICS = new Set<string>(['height', 'value']);

/**
 * Bir maç için QUIZ_ROUNDS tur kur (seed'den deterministik → iki oyuncu aynı
 * maçı görür, adalet). Her tur farklı metrik (mümkünse tekrarsız) + adil 4'lü.
 *
 * Pozisyona bağlı metrikte pozisyon grubu da seed'den seçilir; GK havuzu dar
 * (~226) olduğundan GK grubu DÜŞÜK olasılıkla seçilir (FWD/MID/DEF ağırlıklı).
 */
export function buildQuizRounds(seed: string, players: Player[]): QuizRound[] {
  const prng = createPRNG(`kiyas:${seed}:rounds`);
  const rounds: QuizRound[] = [];
  const usedMetrics = new Set<string>();

  // Soru-kimliği = metrik + (varsa) pozisyon + (varsa) filtre. Bu üç eksen birlikte
  // "En golcü Brezilyalı forvet" ile "En golcü aktif orta saha"yı FARKLI soru yapar
  // → devasa çeşitlilik. Aynı kombinasyon maç-içinde tekrar etmez.
  const usedQuestions = new Set<string>();

  let guard = 0;
  while (rounds.length < QUIZ_ROUNDS && guard < QUIZ_ROUNDS * 50) {
    guard++;
    // 1) Metrik: bu maçta HİÇ kullanılmamış metrikleri önceliklendir (geniş çeşitlilik).
    const fresh = QUIZ_METRICS.filter((f) => !usedMetrics.has(f.key));
    const metricList = fresh.length > 0 ? fresh : QUIZ_METRICS;
    const field = metricList[Math.floor(prng.next() * metricList.length)]!;

    // 2) Pozisyon grubu (metrik pozisyona bağlıysa). GK seyrek + yalnız
    //    GK-anlamlı metriklerde (boy/değer) — "kaleci golü" gibi saçma sorular elenir.
    let group: Position | null = null;
    if (field.positionFilterable) {
      group = pickPositionGroup(prng.next, GK_OK_METRICS.has(field.key));
    }

    // 3) Filtre (çağ/milliyet) — ~%55 olasılıkla bir filtre uygula (kalanı sade soru).
    //    Filtre + pozisyon küçük havuz yaratabilir → buildRoundFromPool prune eder.
    let filter: QuizFilter | null = null;
    if (prng.next() < 0.55) {
      const f = QUIZ_FILTERS[Math.floor(prng.next() * QUIZ_FILTERS.length)] ?? null;
      filter = f;
    }

    const qKey = `${field.key}|${group ?? ''}|${filter?.key ?? ''}`;
    if (usedQuestions.has(qKey)) continue; // aynı (metrik+poz+filtre) tekrarı yok

    const pool = metricPool(field, players, group, filter);
    const built = buildRoundFromPool(field, pool, prng.next);
    if (!built) continue; // havuz yetmedi / belirginlik veremedi → başka kombinasyon

    const values = built.values;
    const correctIndex = argmax(values);
    rounds.push({
      metricKey: field.key,
      positionGroup: group,
      filterKey: filter?.key ?? null,
      choiceIds: built.ids,
      values,
      correctIndex,
      fiftyKeepIndexes: computeFiftyKeep(values, correctIndex),
    });
    usedMetrics.add(field.key);
    usedQuestions.add(qKey);
  }

  return rounds;
}

/** Pozisyon grubu seç — GK düşük olasılıkla + yalnız GK-uygun metrikte. */
function pickPositionGroup(rng: () => number, gkAllowed: boolean): Position {
  const r = rng();
  if (gkAllowed) {
    // FWD %35, MID %28, DEF %25, GK %12 (boy/değerde kaleci anlamlı).
    if (r < 0.35) return 'FWD';
    if (r < 0.63) return 'MID';
    if (r < 0.88) return 'DEF';
    return 'GK';
  }
  // GK yok (gol/asist gibi): FWD %40, MID %33, DEF %27.
  if (r < 0.4) return 'FWD';
  if (r < 0.73) return 'MID';
  return 'DEF';
}

/** En yüksek değerin indexi (eşitlikte ilk; belirginlik şartı eşitliği zaten eler). */
function argmax(values: number[]): number {
  let best = 0;
  for (let i = 1; i < values.length; i++) if (values[i]! > values[best]!) best = i;
  return best;
}

/**
 * %50 jokeri elemesinde KALACAK iki index: doğru cevap + EN YAKIN çeldirici
 * (2. en yüksek). Elenen: en uzak + 2. en uzak (kullanıcı kararı 2026-06-14).
 */
function computeFiftyKeep(values: number[], correctIndex: number): [number, number] {
  const correctVal = values[correctIndex]!;
  // Doğru hariç adayları, doğruya YAKINLIĞA göre sırala (en yakın çeldirici başta).
  const others = values
    .map((v, i) => ({ i, dist: Math.abs(correctVal - v) }))
    .filter((o) => o.i !== correctIndex)
    .sort((a, b) => a.dist - b.dist);
  const closest = others[0]!.i;
  return [correctIndex, closest];
}

// ===========================================================================
// Tahmin değerlendirme + puanlama
// ===========================================================================

/**
 * Bir seçimi değerlendir: seçilen index(ler)den biri doğru mu? +1 puan, değil 0.
 * x2 jokeri → `indexes` 2 elemanlı olabilir (ikisinden biri doğruysa kazanır).
 * Berabere kuralı (Ortak Bul ile aynı): TARAF-BAĞIMSIZ — iki taraf da kendi
 * puanını alır, çakışma cezası YOK.
 */
export function evaluateQuizPick(round: QuizRound, indexes: number[]): { correct: boolean; points: number } {
  const correct = indexes.includes(round.correctIndex);
  return { correct, points: correct ? 1 : 0 };
}

export type QuizWinner = 'P1' | 'P2' | 'tie';

export function decideQuizWinner(p1Score: number, p2Score: number): QuizWinner {
  if (p1Score === p2Score) return 'tie';
  return p1Score > p2Score ? 'P1' : 'P2';
}

// ===========================================================================
// Bot (Bota Karşı) — kasıtlı kusurlu (commonMode/chainMode bot felsefesi)
// ===========================================================================

/**
 * Botun bir turdaki seçimi (tek index). `skill` 0..1: yüksek = daha sık doğru.
 * Kasıtlı kusur (yenilebilir): bazen en yakın çeldiriciye kanar. Bot joker
 * kullanmaz (sadelik; insan rakip avantajı). Döndürdüğü index choiceIds'tedir.
 */
export function botPick(round: QuizRound, rng: () => number, skill = 0.62): number {
  // skill olasılıkla doğru; değilse en yakın çeldiriciye (insanvari hata) kayar.
  if (rng() < skill) return round.correctIndex;
  // En yakın çeldirici = fiftyKeepIndexes'in doğru-olmayanı.
  const [a, b] = round.fiftyKeepIndexes;
  const closest = a === round.correctIndex ? b : a;
  // Bazen tamamen rastgele yanlış (daha gerçekçi dağılım).
  if (rng() < 0.5) return closest;
  const wrongs = round.choiceIds.map((_, i) => i).filter((i) => i !== round.correctIndex);
  return wrongs[Math.floor(rng() * wrongs.length)] ?? closest;
}
