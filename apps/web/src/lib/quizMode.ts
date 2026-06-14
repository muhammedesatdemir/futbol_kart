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
import { METRIC_FIELDS, type MetricField } from './criteriaCatalog';

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
// Metrik havuzu — 4'lü Kıyas'a uygun METRIC_FIELDS alt-kümesi
// ===========================================================================

/**
 * Bu modda kullanılabilir metrikler: değer "yüksek = daha çok" anlamı taşıyan,
 * tek oyuncuda anlamlı alanlar (listEligible bunu zaten kodluyor — top-10
 * sıralanabilen alanlar tek-oyuncu kıyasına da uygun). Hepsi `pick` + `unit`
 * + `positionFilterable` taşır (criteriaCatalog).
 */
export const QUIZ_METRICS: MetricField[] = METRIC_FIELDS.filter((f) => f.listEligible);

export function metricByKey(key: string): MetricField | undefined {
  return QUIZ_METRICS.find((f) => f.key === key);
}

/** Bir oyuncunun metrikteki ham değeri (yoksa null). */
export function metricValue(field: MetricField, p: Player): number | null {
  const v = field.pick(p);
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
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
  /** Metrik anahtarı (criteriaCatalog) — değer her çağrı `pick`le çözülür. */
  metricKey: string;
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
 * Metrik pozisyona bağlıysa (`positionFilterable`) verilen pozisyon grubundan.
 */
function metricPool(
  field: MetricField,
  players: Player[],
  group: Position | null,
): Player[] {
  return players.filter((p) => {
    if (!isMarquee(p)) return false;
    if (group !== null && positionGroup(p.position) !== group) return false;
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
  field: MetricField,
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

  let guard = 0;
  while (rounds.length < QUIZ_ROUNDS && guard < QUIZ_ROUNDS * 30) {
    guard++;
    // Metrik seç (tekrarsız tercih — havuz tükenirse tekrar serbest).
    const avail = QUIZ_METRICS.filter((f) => !usedMetrics.has(f.key));
    const metricList = avail.length > 0 ? avail : QUIZ_METRICS;
    const field = metricList[Math.floor(prng.next() * metricList.length)]!;

    // Pozisyon grubu (metrik pozisyona bağlıysa). GK seyrek tutulur.
    let group: Position | null = null;
    if (field.positionFilterable) {
      group = pickPositionGroup(prng.next);
    }

    const pool = metricPool(field, players, group);
    const built = buildRoundFromPool(field, pool, prng.next);
    if (!built) continue; // bu metrik/grup belirginlik veremedi → tekrar dene

    const values = built.values;
    const correctIndex = argmax(values);
    rounds.push({
      metricKey: field.key,
      choiceIds: built.ids,
      values,
      correctIndex,
      fiftyKeepIndexes: computeFiftyKeep(values, correctIndex),
    });
    usedMetrics.add(field.key);
  }

  return rounds;
}

/** Pozisyon grubu seç — GK düşük olasılıkla (havuz dar). */
function pickPositionGroup(rng: () => number): Position {
  const r = rng();
  // FWD %38, MID %30, DEF %24, GK %8 (GK havuzu darlığına saygı — §14.3).
  if (r < 0.38) return 'FWD';
  if (r < 0.68) return 'MID';
  if (r < 0.92) return 'DEF';
  return 'GK';
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
