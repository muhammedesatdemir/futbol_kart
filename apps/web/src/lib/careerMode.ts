/**
 * "Kariyer Yolu" modu — saf mantık (React/DOM yok, test edilebilir).
 *
 * Her tur 1 futbolcunun KARİYER KULÜPLERİ kademe kademe açılır; oyuncu kimin
 * kariyeri olduğunu tahmin eder. 4 ipucu kademesi (puan azalan):
 *   1) kulüpler DAĞINIK + logo/bayrak       → 5 puan
 *   2) kulüpler SIRALI + çizgi (kronoloji)   → 3 puan
 *   3) + yıl aralığı + milliyet              → 2 puan
 *   4) + ilk harf                            → 1 puan
 * Her kademe eşzamanlı süreli; doğru bilen puanını alıp kilitlenir, yanlış/boş
 * bir sonraki kademeye düşer. 3 tur, en çok puan kazanır.
 *
 * Veri: players.json (clubs[] kariyer) + clubs.json (ad/ülke/logo). Ek scrape yok.
 * KÜRASYON: marquee (tanınır) + ≥3 farklı kulüp + ≥1 elit/Türk durak (tanıdık çapa).
 * Bkz PLAN.md §21.
 */
import type { Player } from '@futbol-kart/shared-types';
import { createPRNG } from '@futbol-kart/game-engine';

/** Bir maçtaki tur (kariyer) sayısı. */
export const CAREER_ROUNDS = 3;
/** İpucu kademe sayısı. */
export const CAREER_TIERS = 4;
/** Kademe → o kademede doğru bilmenin puanı (1-bazlı tier indexiyle). */
export const TIER_POINTS = [5, 3, 2, 1] as const;

export type CareerSide = 'P1' | 'P2';

// ===========================================================================
// Elit kulüpler (Zincir / Ortak Bul ile AYNI liste) + Türk büyükleri
// ===========================================================================

/** Elit (kalburüstü) kulüpler — TM id. "Tanıdık çapa": kariyerde en az 1 tane olmalı. */
const ELITE_CLUB_IDS = new Set<string>([
  'tm_5', 'tm_46', 'tm_506', 'tm_6195', 'tm_12', 'tm_36', 'tm_141', 'tm_114',
  'tm_148', 'tm_11', 'tm_281', 'tm_31', 'tm_985', 'tm_631', 'tm_27', 'tm_16',
  'tm_15', 'tm_33', 'tm_244', 'tm_583', 'tm_1041', 'tm_131', 'tm_418', 'tm_13',
  'tm_368', 'tm_610', 'tm_294', 'tm_720',
]);
/**
 * 5 büyük lig + Türkiye ülke kodları (countryCode). "Lig yayılımı" çapası:
 * kariyer bu 6 ülkeden ≥2'sine yayılmışsa "büyük liglerde gezmiş, takip
 * edilebilir" demektir. Niş-tek-ülke kariyerleri eler.
 */
const BIG6_COUNTRY_CODES = new Set<string>(['EN', 'ES', 'DE', 'IT', 'FR', 'TR']);

// ===========================================================================
// Marquee (tanınırlık) — bilinmeyen oyuncu sorulmasın
// ===========================================================================

/**
 * Oyuncu "tanınır" mı? (PLAN §14.0 marquee felsefesi). Fotoğrafı olmalı +
 * (≥30 milli maç VEYA ≥25M zirve transfer). Efsaneleri de yakalar (caps),
 * modern yıldızları da (market değeri).
 */
export function isMarquee(p: Player): boolean {
  if (!p.imageUrl) return false;
  const s = p.stats;
  return (s?.nationalCaps ?? 0) >= 30 || (s?.maxTransferFeeEUR ?? 0) >= 25_000_000;
}

/** Bir oyuncunun farklı kulüp id'leri. */
function distinctClubIds(p: Player): string[] {
  return [...new Set(p.clubs.map((s) => s.clubId))];
}

/**
 * Oyuncunun kariyerinin yayıldığı FARKLI büyük-lig ülkesi sayısı (5 büyük + TR).
 * clubsById ile her kulübün countryCode'una bakar.
 */
function big6CountryCount(p: Player, clubsById: Map<string, ClubInfo>): number {
  const codes = new Set<string>();
  for (const id of distinctClubIds(p)) {
    const cc = clubsById.get(id)?.countryCode;
    if (cc && BIG6_COUNTRY_CODES.has(cc)) codes.add(cc);
  }
  return codes.size;
}

/**
 * Kariyer Yolu için uygun mu (kullanıcı kararı F, 2026-06-13):
 *   marquee + ≥3 farklı kulüp + **6 büyük ülke liginden ≥2 farklı ülke**
 *   + **≥1 elit kulüp durağı**.
 * İki katmanlı tanınırlık: "büyük liglere yayılmış" (niş-tek-ülke eler) + "en az
 * bir net tanıdık çapa" (tek-elit-gerisi-niş eler). Havuz 1126 (ölçüldü) → bol.
 */
export function isCareerEligible(p: Player, clubsById: Map<string, ClubInfo>): boolean {
  if (!isMarquee(p)) return false;
  const ids = distinctClubIds(p);
  if (ids.length < 3) return false;
  if (big6CountryCount(p, clubsById) < 2) return false;
  return ids.some((id) => ELITE_CLUB_IDS.has(id));
}

// ===========================================================================
// Kariyer çizgisi (stint'ler → görsel satırlar; fromYear-bazlı, toYear gürültüsüz)
// ===========================================================================

/** Bir kulübün gösterim bilgisi (ad/ülke/logo — clubs.json'dan çözülür). */
export interface ClubInfo {
  id: string;
  name: string;
  countryCode?: string;
  crestUrl?: string;
}

/** Kariyer çizgisindeki bir satır (bir stint). */
export interface CareerStop {
  clubId: string;
  name: string;
  countryCode?: string;
  crestUrl?: string;
  /** Başlangıç yılı (fromYear — %100 temiz). */
  fromYear: number;
  /**
   * Bitiş yılı — bir SONRAKİ stint'in fromYear'ı (kronolojik tutarlı). Son
   * stint'te toYear güvenilirse o, absürtse (toYear<from veya >12 yıl) null.
   * toYear verisinin %2.9'u bozuk → fromYear zinciriyle çözülür.
   */
  toYear: number | null;
}

/**
 * Bir oyuncunun kariyer duraklarını kur (fromYear sıralı, her stint ayrı satır).
 * Bitiş yılı SONRAKİ stint'in başlangıcından türetilir → bozuk toYear'lar atlanır.
 * Aynı kulübe tekrar gelme AYRI satır olarak korunur (kullanıcı kararı).
 */
export function buildCareer(p: Player, clubsById: Map<string, ClubInfo>): CareerStop[] {
  const sorted = [...p.clubs].sort((a, b) => a.fromYear - b.fromYear);
  return sorted.map((s, i) => {
    const next = sorted[i + 1];
    let toYear: number | null;
    if (next) {
      toYear = next.fromYear; // kronolojik zincir (güvenilir)
    } else {
      // Son durak: toYear güvenilirse kullan, absürtse null ("…").
      const ty = s.toYear ?? null;
      toYear = ty !== null && ty >= s.fromYear && ty - s.fromYear <= 12 ? ty : null;
    }
    const info = clubsById.get(s.clubId);
    return {
      clubId: s.clubId,
      name: info?.name ?? s.clubId,
      countryCode: info?.countryCode,
      crestUrl: info?.crestUrl,
      fromYear: s.fromYear,
      toYear,
    };
  });
}

// ===========================================================================
// Kürasyon — bir maç için CAREER_ROUNDS kariyer seç (seed'den deterministik)
// ===========================================================================

export interface CareerPuzzle {
  /** Doğru cevap (SUNUCU-İÇİ; client'a sızmaz). */
  playerId: string;
  /** Doğru oyuncunun adı (RESULT'ta açılır). */
  playerName: string;
  /** Oyuncunun ilk harfi (kademe 4 ipucu). */
  initial: string;
  /** Milliyet (kademe 3 ipucu). */
  nationality: string | null;
  /** Kariyer durakları (kademelere göre kısmen açılır). */
  stops: CareerStop[];
}

/**
 * Bir maç için CAREER_ROUNDS kariyer seç. Havuz: isCareerEligible (marquee +
 * ≥3 kulüp + 6 büyük ülkeden ≥2 + ≥1 elit). Seed'den deterministik (iki oyuncu
 * aynı maçı görür). Tekrarsız. Havuz yetersizse (olmamalı) eşik gevşetilir.
 */
export function curateCareers(
  seed: string,
  players: Player[],
  clubsById: Map<string, ClubInfo>,
): CareerPuzzle[] {
  const prng = createPRNG(`kariyer:${seed}:careers`);
  let pool = players.filter((p) => isCareerEligible(p, clubsById));
  if (pool.length < CAREER_ROUNDS) {
    // Güvenlik: eşik gevşet (lig/elit şartını kaldır, sadece marquee + ≥3 kulüp).
    pool = players.filter((p) => isMarquee(p) && distinctClubIds(p).length >= 3);
  }
  const chosen = prng.shuffle(pool).slice(0, Math.min(CAREER_ROUNDS, pool.length));
  return chosen.map((p) => ({
    playerId: p.id,
    playerName: p.displayName || p.name,
    initial: (p.displayName || p.name).trim()[0]?.toLocaleUpperCase('tr-TR') ?? '?',
    nationality: p.nationality ?? null,
    stops: buildCareer(p, clubsById),
  }));
}

// ===========================================================================
// Kademeli ipucu görünümü (client'a tier'a göre KISMEN açılır)
// ===========================================================================

/**
 * Bir kariyerin client'a gönderilecek görünümü — `revealedTier`'a kadar açık.
 * Sunucu bunu üretir; doğru cevap (playerId/playerName) ASLA buraya girmez
 * (RESULT hariç). Spoiler koruması: açılmamış kademe bilgisi gönderilmez.
 *
 *   tier 0 (5p): kulüpler DAĞINIK (sıra karıştırılmış), logo/ad
 *   tier 1 (3p): kulüpler SIRALI (kronolojik) + çizgi
 *   tier 2 (2p): + yıl aralıkları + milliyet
 *   tier 3 (1p): + ilk harf
 */
export interface CareerClue {
  /** Görünür kulüp satırları (tier'a göre sıralı veya dağınık). */
  stops: Array<{
    clubId: string;
    name: string;
    countryCode?: string;
    crestUrl?: string;
    /** tier ≥ 2 ise dolu, yoksa null (yıl gizli). */
    fromYear: number | null;
    toYear: number | null;
  }>;
  /** Kulüpler kronolojik sırada mı (tier ≥ 1) yoksa dağınık mı (tier 0)? */
  ordered: boolean;
  /** tier ≥ 2 ise milliyet açık. */
  nationality: string | null;
  /** tier ≥ 3 ise ilk harf açık. */
  initial: string | null;
  /** Şu an açık kademe (0..3). */
  tier: number;
}

/**
 * Bir kariyeri `tier` kademesine kadar açılmış olarak görünüme çevir.
 * `shuffleSeed`: dağınık (tier 0) sıralama deterministik olsun diye.
 */
export function clueForTier(puzzle: CareerPuzzle, tier: number, shuffleSeed: string): CareerClue {
  const showYears = tier >= 2;
  const ordered = tier >= 1;

  let stops = puzzle.stops.map((s) => ({
    clubId: s.clubId,
    name: s.name,
    countryCode: s.countryCode,
    crestUrl: s.crestUrl,
    fromYear: showYears ? s.fromYear : null,
    toYear: showYears ? s.toYear : null,
  }));

  if (!ordered) {
    // tier 0: dağınık göster (kronolojik ipucu verme) — deterministik karıştır.
    const prng = createPRNG(`kariyer:clue:${shuffleSeed}:${puzzle.playerId}`);
    stops = prng.shuffle(stops);
  }

  return {
    stops,
    ordered,
    nationality: tier >= 2 ? puzzle.nationality : null,
    initial: tier >= 3 ? puzzle.initial : null,
    tier,
  };
}

// ===========================================================================
// Tahmin değerlendirme + puanlama
// ===========================================================================

/** Bir kademedeki tahminin puanı (doğruysa). */
export function pointsForTier(tier: number): number {
  return TIER_POINTS[tier] ?? 0;
}

/** Seçim doğru mu? (sunucuda; doğru playerId client'a sızmaz) */
export function isCorrectGuess(puzzle: CareerPuzzle, playerId: string): boolean {
  return puzzle.playerId === playerId;
}

export type CareerWinner = 'P1' | 'P2' | 'tie';

export function decideWinner(p1Score: number, p2Score: number): CareerWinner {
  if (p1Score === p2Score) return 'tie';
  return p1Score > p2Score ? 'P1' : 'P2';
}

// ===========================================================================
// Bot (Bota Karşı) — değişken kademede biler (gerçekçi, yenilebilir)
// ===========================================================================

/**
 * Bot bu kademede tahmin yapsın mı + doğru mu? Gerçekçi: bazen erken (yüksek puan)
 * bazen geç, bazen hiç bilemez. `skill` 0..1. Döndürür:
 *   { guess: true, correct: bool } → bu kademede tahmin etti
 *   { guess: false }               → bu kademede pas (sonraki kademede tekrar dener)
 *
 * Bot doğru bildiğinde doğru playerId'yi seçer (sunucu zaten doğrular). Yanlış
 * bilirse rastgele başka bir aday id döner (çağıran sağlar) — burada sadece KARAR.
 */
export function botDecision(
  tier: number,
  rng: () => number,
  skill = 0.6,
): { guess: boolean; correct: boolean } {
  // Kademe ilerledikçe botun "tahmin etme" eğilimi artar (ipucu çoğaldı).
  const guessProb = 0.25 + tier * 0.22 + skill * 0.1; // tier0 ~0.35 → tier3 ~1.0
  if (rng() > guessProb) return { guess: false, correct: false };
  // Tahmin ettiyse: doğru bilme olasılığı kademeyle + skill ile artar.
  const correctProb = 0.3 + tier * 0.15 + skill * 0.2;
  return { guess: true, correct: rng() < correctProb };
}
