/**
 * "Ortak Bul" modu — saf mantık (React/DOM yok, test edilebilir).
 *
 * Her TUR ekrana 2 kulüp gelir (örn. Fenerbahçe × Juventus). İki oyuncu, bu
 * ikisinde DE oynamış bir futbolcuyu havuzdan bulmaya çalışır. Doğru bulursa o
 * ortak oyuncunun NADİRLİK PUANINI (1=bariz, 2=orta, 3=gizli) kazanır. 5 tur
 * sonunda en çok puan kazanan kazanır.
 *
 * VS Düello deseni (Zincir/Liste DEĞİL): her tur YENİ çift + EŞZAMANLI seçim +
 * reveal'da iki cevap birlikte açılır. Tek seçim/tur → can sistemi YOK.
 *
 * Veri: clubPairs.json (build-time üretilmiş çiftler + nadirlik puanlı cevaplar)
 * + clubPool.json (logo/ad). Ek scrape/runtime hesap yok — puanlar hazır gelir.
 * Bkz PLAN.md §20.
 */
import type { Player } from '@futbol-kart/shared-types';
import { createPRNG } from '@futbol-kart/game-engine';

/** Bir maçtaki tur (çift) sayısı. */
export const COMMON_ROUNDS = 5;

/** clubPairs.json'daki bir kabul-edilen cevap (nadirlik puanlı). */
export interface CommonAnswer {
  id: string;
  name: string;
  /** Nadirlik bandı: 1 = bariz/yıldız, 2 = orta, 3 = gizli/şaşırtıcı. */
  points: 1 | 2 | 3;
}

/** clubPairs.json'daki bir kulüp çifti. */
export interface ClubPair {
  a: string;
  b: string;
  aName: string;
  bName: string;
  count: number;
  answers: CommonAnswer[];
}

/** clubPairs.json kök yapısı. */
export interface ClubPairsFile {
  generatedAt: string;
  minAnswers: number;
  clubCount: number;
  pairCount: number;
  pairs: ClubPair[];
}

/** Havuzdaki bir kulüp (clubPool.json) — logo/ad gösterimi için. */
export interface PoolClub {
  id: string;
  name: string;
  country?: string;
  crestUrl?: string;
}

/** Ekrandaki bir tur için seçilmiş çift — kulüp logoları çözümlenmiş. */
export interface CommonRoundPair {
  a: string;
  b: string;
  aName: string;
  bName: string;
  aCrestUrl?: string;
  bCrestUrl?: string;
  /** Bu çiftteki toplam ortak oyuncu sayısı (UI'da "N ortak isim var"). */
  count: number;
}

export type CommonSide = 'P1' | 'P2';

// ===========================================================================
// Çift kürasyonu (modun kalbi — her tur dengeli, çözülebilir çift)
// ===========================================================================

/**
 * Bir maç için COMMON_ROUNDS çift seç (seed'den deterministik → iki oyuncu aynı
 * maçı görür, adalet). KÜRASYON: çok-sığ (count=min) çiftler sıkıcı, çok-derin
 * (count 30+) çiftler "herkes bilir"; orta-derinlikli (count≥5) çiftlerden ağırlık
 * ver ama tekrar etme. Çiftler tekrarsız (aynı maçta aynı çift iki kez gelmez).
 */
export function curatePairs(seed: string, file: ClubPairsFile): ClubPair[] {
  const prng = createPRNG(`ortak:${seed}:pairs`);
  // İdeal havuz: en az 5 ortaklı çiftler (sığ olanlar ölü tur riski). Yetmezse
  // tüm havuza düş (güvenlik).
  const rich = file.pairs.filter((p) => p.count >= 5);
  const source = rich.length >= COMMON_ROUNDS ? rich : file.pairs;
  const shuffled = prng.shuffle(source);
  return shuffled.slice(0, Math.min(COMMON_ROUNDS, shuffled.length));
}

/** Bir ClubPair'i ekran çiftine çevir (kulüp logolarını havuzdan çöz). */
export function toRoundPair(pair: ClubPair, poolById: Map<string, PoolClub>): CommonRoundPair {
  return {
    a: pair.a,
    b: pair.b,
    aName: pair.aName,
    bName: pair.bName,
    aCrestUrl: poolById.get(pair.a)?.crestUrl,
    bCrestUrl: poolById.get(pair.b)?.crestUrl,
    count: pair.count,
  };
}

// ===========================================================================
// Tahmin değerlendirme + puanlama
// ===========================================================================

/** Bir çiftteki cevapları id → answer haritasına çevir (hızlı arama). */
export function answersById(pair: ClubPair): Map<string, CommonAnswer> {
  return new Map(pair.answers.map((a) => [a.id, a]));
}

/** Bir seçimin sonucu (sunucuda hesaplanır, client'a reveal'da açılır). */
export interface CommonSelectResult {
  /** Doğru ortak mı (çiftin answers'ında mı)? */
  correct: boolean;
  /** Kazanılan puan (doğruysa nadirlik puanı, yanlışsa 0). */
  points: number;
  /** Seçilen oyuncu id'si. */
  playerId: string;
}

/**
 * Bir seçimi değerlendir: oyuncu bu çiftin ortaklarından mı? Doğruysa nadirlik
 * puanı, değilse 0. Berabere kuralı (PLAN §20): iki taraf aynı kişiyi seçse bile
 * ikisi de tam puan alır → bu fonksiyon TARAF-BAĞIMSIZ (her seçim kendi puanını
 * alır, çakışma cezası YOK).
 */
export function evaluateSelection(pair: ClubPair, playerId: string): CommonSelectResult {
  const ans = answersById(pair).get(playerId);
  if (!ans) return { correct: false, points: 0, playerId };
  return { correct: true, points: ans.points, playerId };
}

export type CommonWinner = 'P1' | 'P2' | 'tie';

export function decideWinner(p1Score: number, p2Score: number): CommonWinner {
  if (p1Score === p2Score) return 'tie';
  return p1Score > p2Score ? 'P1' : 'P2';
}

// ===========================================================================
// İpucu jokeri (1×/maç) — kapatılmamış bir ortağı KISMEN açar (adını değil)
// ===========================================================================

/** İpucu içeriği — baş harf + pozisyon + milliyet (ad ASLA verilmez). */
export interface CommonHint {
  /** Görünen adın baş harfi (örn. "S" → "S…"). */
  initial: string;
  /** Pozisyon grubu (GK/DEF/MID/FWD) — varsa. */
  position: string | null;
  /** Milliyet (örn. "Brezilya") — varsa. */
  nationality: string | null;
}

/**
 * İpucu üret: bu çiftin HENÜZ seçilmemiş ortaklarından birini seç (deterministik,
 * adım/seed bazlı) ve KISMEN aç. Tercihen GİZLİ (points=3) bir ismi seç — ipucu
 * en çok orada işe yarar. Adı asla verme. Seçilebilir ortak yoksa null.
 *
 * `excludeIds` zaten iki tarafça seçilmiş oyuncular (onları açmak anlamsız).
 * `salt` deterministik çeşitlilik için (örn. round indeksi).
 */
export function buildHint(
  pair: ClubPair,
  playersById: Map<string, Player>,
  excludeIds: Set<string>,
  salt: number,
): CommonHint | null {
  const fresh = pair.answers.filter((a) => !excludeIds.has(a.id));
  if (fresh.length === 0) return null;
  // Gizli (3) > orta (2) > bariz (1) önceliği — ipucu en çok gizli ismi avlamada değerli.
  fresh.sort((a, b) => b.points - a.points || a.id.localeCompare(b.id));
  // Üst dilimden (en gizli ~%50) deterministik bir aday seç.
  const topK = Math.max(1, Math.ceil(fresh.length * 0.5));
  const idx = Math.abs(salt * 2654435761) % topK;
  const chosen = fresh[idx]!;
  const p = playersById.get(chosen.id);
  return {
    initial: (chosen.name.trim()[0] ?? '?').toLocaleUpperCase('tr-TR'),
    position: p ? positionGroup(p.position) : null,
    nationality: p?.nationality ?? null,
  };
}

/** Pozisyonu kaba gruba indir (UI ipucu için yeterli). */
function positionGroup(position: string | undefined): string | null {
  if (!position) return null;
  const s = position.toLowerCase();
  if (s.includes('keeper') || s === 'gk' || s.includes('kale')) return 'Kaleci';
  if (s.includes('back') || s.includes('def') || s.includes('defans')) return 'Defans';
  if (s.includes('mid') || s.includes('orta')) return 'Orta saha';
  if (s.includes('wing') || s.includes('forward') || s.includes('strik') || s.includes('for'))
    return 'Forvet';
  return null;
}

// ===========================================================================
// Bot (Bota Karşı) — kasıtlı kusurlu (squaresMode/chainMode bot felsefesi)
// ===========================================================================

/**
 * Botun bir turdaki seçimi: çiftin ortaklarından birini seçer ama HER ZAMAN en
 * bariz/kolay olanı değil (kasıtlı kusur — yenilebilir). `skill` 0..1: yüksek =
 * daha sık bariz (düşük-puanlı ama doğru) ismi bulur. Bazen hiç bulamaz (boş tur).
 *
 * Bot bariz isimleri (points=1) daha kolay "bilir"; gizli (points=3) nadiren.
 * Döndürdüğü id, çiftin bir cevabıdır (her zaman doğru — bot "yanlış" seçmez,
 * sadece bulamaz → null). Gerçekçi: insan rakip de çoğu zaman doğru ama düşük puan.
 */
export function botSelect(
  pair: ClubPair,
  rng: () => number,
  skill = 0.6,
): string | null {
  // Botun "bulma" olasılığı (her tur değil). Düşük skill → daha sık boş tur.
  if (rng() > 0.55 + skill * 0.35) return null; // ~%55-90 bulur
  // Bariz isimleri tercih et (gerçekçi: bot da önce bilineni bulur).
  const weighted = pair.answers
    .map((a) => ({ a, w: a.points === 1 ? 3 : a.points === 2 ? 1.5 : 0.6 }))
    .sort((x, y) => y.w - x.w);
  // skill düştükçe daha geriden seç (kasıtlı kusur).
  const span = Math.max(1, Math.floor((1 - skill) * weighted.length) || 1);
  const idx = Math.floor(rng() * Math.min(span, weighted.length));
  return weighted[Math.min(idx, weighted.length - 1)]!.a.id;
}
