/**
 * "İmposter" modu — saf mantık (React/DOM yok, test edilebilir).
 *
 * Among Us tarzı sosyal dedüksiyon (5 kişi: 1 imposter + 4 masum). Online eşleşir.
 *   • Gizli bir KALBURÜSTÜ futbolcu seçilir.
 *   • Masumlara futbolcunun ADI verilir; imposter'a verilMEZ — onun yerine TEK
 *     bir BULANIK İPUCU kelimesi verilir (kimlik vermez, blöfe yeter).
 *   • 3 tur: sırayla herkes oyuncuyla ilgili kısa kelime yazar (anlık görünür).
 *   • Oylama: en çok oyu alan elenir. İmposter NET en çok oyu almazsa (berabere
 *     dahil) → imposter kazanır (Among Us kuralı).
 *
 * İPUCU TASARIMI (kullanıcı kararı 2026-06-14): imposter'a TEK kelime, her oyun
 * FARKLI bir EKSENDEN (deterministik). Eksenler: pozisyon · dönem · kupa/fiziksel ·
 * ülke (yalnız büyük milliyetlerde — dar milliyette ifşa eder → başka eksene düşer).
 * İfşa koruması: seçilen eksen o futbolcuda yeterince GENEL olmalı.
 *
 * Veri: players.json (marquee havuz + bulanık ipucu alanları). Bkz PLAN.md §16, §23.
 */
import type { Player } from '@futbol-kart/shared-types';
import { createPRNG } from '@futbol-kart/game-engine';

/** Bir maçtaki tur (kelime turu) sayısı. */
export const IMPOSTER_ROUNDS = 3;
/** Lobi: en az / en çok oyuncu (kullanıcı kararı: 3-5 esnek). */
export const IMPOSTER_MIN_PLAYERS = 3;
export const IMPOSTER_MAX_PLAYERS = 5;

// Sahne süreleri (sn) — client-safe (sahne + sunucu motoru ortak kullanır).
/**
 * Rol açılış ekranı (sen imposter'sın/değilsin) — herkes "Hazırım"a basınca geçer.
 * Ekranda GERİ SAYIM GÖSTERİLMEZ (kullanıcı kararı — baskı/tik-tak kötü deneyim);
 * bu yalnız SESSİZ güvenlik timeout'u (AFK biri lobiyi kilitlemesin). Rahat süre.
 */
export const IMPOSTER_ROLE_SECONDS = 35;
/** Bir oyuncunun kelime yazma süresi. */
export const IMPOSTER_WORD_SECONDS = 30;
/** Oylama süresi. */
export const IMPOSTER_VOTE_SECONDS = 90;

export type ImposterRole = 'imposter' | 'crew';

// ===========================================================================
// Gizli futbolcu havuzu — yeterince TANINIR (masumlar bilmeli)
// ===========================================================================

/**
 * "Süper tanınır" oyuncu mu? Normal marquee'den biraz daha sıkı — caps≥30
 * kuyruğundaki tanınmayan isimleri (örn. eski/küçük-ülke) eler. (Veri analizi:
 * havuz ~2800-3000 → 5'erli partilere fazlasıyla yeter.) Fotoğraf + şu sinyaller:
 *   transfer ≥25M · bireysel ödül ≥1 · UCL/Dünya Kupası şampiyonu · caps ≥60.
 */
export function isFamousPlayer(p: Player): boolean {
  if (!p.imageUrl) return false;
  const s = p.stats;
  const tr = p.achievements.trophies;
  return (
    (s?.maxTransferFeeEUR ?? 0) >= 25_000_000 ||
    (tr?.individual?.totalIndividual ?? 0) >= 1 ||
    (tr?.uclTitles ?? 0) >= 1 ||
    (tr?.worldCupTitles ?? 0) >= 1 ||
    (s?.nationalCaps ?? 0) >= 60
  );
}

/**
 * Gizli futbolcuyu KÜRATE havuzdan seç (kariyer-havuz.txt rank 1-585 →
 * `imposterPool.json`). İki bant: tierA = rank 1-300 (%60), tierB = 301-585 (%40).
 * Seed deterministik (iki istek aynı maçta aynı oyuncuyu üretir). Önce bant
 * seçilir (60/40), sonra o banttan rastgele oyuncu. Bant boşsa diğerine düşer.
 *
 * `tierA`/`tierB` = player id dizileri (sunucu motoru imposterPool.json'dan yükler).
 * playersById = id → Player (var olmayan id'ler atlanır → güvenli).
 */
export function pickSecretFromPool(
  seed: string,
  tierA: string[],
  tierB: string[],
  playersById: Map<string, Player>,
): Player | null {
  const a = tierA.map((id) => playersById.get(id)).filter((p): p is Player => !!p);
  const b = tierB.map((id) => playersById.get(id)).filter((p): p is Player => !!p);
  const prng = createPRNG(`imposter:${seed}:secret`);
  // Bant: %60 A, %40 B (boşsa diğerine düş).
  const useA = a.length > 0 && (b.length === 0 || prng.next() < 0.6);
  const band = useA ? a : b;
  if (band.length === 0) return null;
  return band[Math.floor(prng.next() * band.length)] ?? null;
}

/** Havuzdan gizli futbolcu seç (seed deterministik) — KÜRATE havuz yoksa YEDEK. */
export function pickSecretPlayer(seed: string, players: Player[]): Player | null {
  const pool = players.filter(isFamousPlayer);
  if (pool.length === 0) return null;
  const prng = createPRNG(`imposter:${seed}:secret`);
  return pool[Math.floor(prng.next() * pool.length)] ?? null;
}

// ===========================================================================
// Bulanık ipucu — TEK kelime, eksen-tabanlı, ifşa-korumalı
// ===========================================================================

/** Bir ipucu: imposter'a gösterilen tek kelime/öbek + hangi eksenden. */
export interface ImposterClue {
  /** Eksen anahtarı (debug/analiz). */
  axis: string;
  /** İmposter'a gösterilen kelime (örn. "Forvet", "Brezilyalı", "Solak"). */
  word: string;
}

/**
 * İpucu havuzunu yeterince geniş bırakan BÜYÜK milliyetler (her biri yüzlerce
 * famous). Yalnız bunlarda "ülke" ipucu verilir (dar milliyet → ifşa eder).
 * Veri analizi: ülke ipucu yalnız bu setteki kodlarda güvenli.
 */
const BIG_NATIONALITY: Record<string, string> = {
  BR: 'Brezilyalı',
  AR: 'Arjantinli',
  DE: 'Alman',
  FR: 'Fransız',
  ES: 'İspanyol',
  IT: 'İtalyan',
  EN: 'İngiliz',
};

const POSITION_WORD: Record<string, string> = {
  GK: 'Kaleci',
  DEF: 'Defans oyuncusu',
  MID: 'Orta saha oyuncusu',
  FWD: 'Forvet',
};

/**
 * Bir futbolcu için OLASI ipucu adaylarını üret (her biri tek kelime + eksen).
 * Yalnız "kimlik vermeyen + yeterince genel" olanlar listeye girer → ifşa koruması.
 * buildClue bunlardan seed ile birini seçer (her oyun farklı eksen → çeşitlilik).
 */
function clueCandidates(p: Player): ImposterClue[] {
  const out: ImposterClue[] = [];
  const s = p.stats;
  const tr = p.achievements.trophies;

  // 1) Pozisyon — her zaman güvenli (yüzlerce oyuncu her pozisyonda).
  const posWord = POSITION_WORD[p.position];
  if (posWord) out.push({ axis: 'position', word: posWord });

  // 2) Dönem — aktif / efsane (emekli). Güvenli (%100 dolu).
  out.push({ axis: 'era', word: p.isActive ? 'Hâlâ aktif' : 'Emekli efsane' });

  // 3) Ülke — YALNIZ büyük milliyetlerde (dar milliyet ifşa eder → eklenmez).
  const natWord = BIG_NATIONALITY[p.nationalityCode];
  if (natWord) out.push({ axis: 'nationality', word: natWord });

  // 4) Kupa sinyali — yalnız POZİTİFse (havuz yine geniş: ~446 UCL şampiyonu).
  if ((tr?.uclTitles ?? 0) >= 1) out.push({ axis: 'ucl', word: 'Şampiyonlar Ligi şampiyonu' });
  if ((tr?.worldCupTitles ?? 0) >= 1) out.push({ axis: 'wc', word: 'Dünya Kupası şampiyonu' });

  // 5) Fiziksel — boy (uzun/kısa) + ayak. Güvenli (%90 dolu), kimlik vermez.
  if (typeof p.heightCm === 'number' && p.heightCm >= 190) out.push({ axis: 'tall', word: 'Uzun boylu' });
  if (typeof p.heightCm === 'number' && p.heightCm > 0 && p.heightCm <= 172) out.push({ axis: 'short', word: 'Kısa boylu' });
  if (p.preferredFoot === 'L') out.push({ axis: 'lefty', word: 'Solak' });

  return out;
}

/**
 * İmposter'a verilecek TEK ipucu kelimesini seç (seed deterministik → tekrar
 * üretilebilir). Adaylardan biri rastgele seçilir; aday yoksa pozisyona düşer
 * (her zaman vardır). Her oyun farklı eksen → çeşitlilik.
 */
export function buildClue(seed: string, secret: Player): ImposterClue {
  const candidates = clueCandidates(secret);
  if (candidates.length === 0) {
    // Teorik fallback (pozisyon her zaman olur ama güvenlik için).
    return { axis: 'position', word: POSITION_WORD[secret.position] ?? 'Futbolcu' };
  }
  const prng = createPRNG(`imposter:${seed}:clue`);
  return candidates[Math.floor(prng.next() * candidates.length)]!;
}

// ===========================================================================
// Yasak kelime — futbolcu adı + kulüp adları yazılamaz
// ===========================================================================

/** Türkçe-duyarlı normalize (karşılaştırma için): küçült + aksan/boşluk sadeleştir. */
function norm(s: string): string {
  return s
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıöşü]/g, (c) => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' })[c] ?? c)
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Yazılan kelime yasak mı? (Gizli futbolcunun adı VEYA kulüp adları — yoksa ilk
 * oyuncu adı yazıp oyunu bozar.) `bannedTokens` normalize edilmiş yasak köklerdir
 * (gizli oyuncunun ad token'ları + kulüp ad token'ları). Kelime bir yasak token'a
 * eşitse veya onu içeriyorsa reddedilir.
 */
export function isWordBanned(word: string, bannedTokens: Set<string>): boolean {
  const n = norm(word);
  if (!n) return true; // boş/anlamsız
  if (bannedTokens.has(n)) return true;
  // Kelime, çok-kelimeli ise her token'ını da kontrol et.
  for (const tok of word.split(/\s+/)) {
    const tn = norm(tok);
    if (tn.length >= 3 && bannedTokens.has(tn)) return true;
  }
  return false;
}

/**
 * Gizli futbolcu için yasak token seti üret (adının kelimeleri + soyadı).
 * Kulüp adları sunucu motorunda eklenir (clubs verisi orada). 3+ harf token'lar.
 */
export function secretNameTokens(secret: Player): string[] {
  const names = [secret.displayName, secret.name].join(' ');
  return names
    .split(/\s+/)
    .map(norm)
    .filter((t) => t.length >= 3);
}

/** Bir kelime geçerli mi (uzunluk + yasak değil)? Maks ~24 karakter, 1-3 kelime. */
export function isValidWord(word: string, bannedTokens: Set<string>): { ok: boolean; reason?: string } {
  const trimmed = word.trim();
  if (trimmed.length === 0) return { ok: false, reason: 'Boş kelime.' };
  if (trimmed.length > 24) return { ok: false, reason: 'Çok uzun (en fazla 24 karakter).' };
  if (trimmed.split(/\s+/).length > 3) return { ok: false, reason: 'En fazla 3 kelime.' };
  if (isWordBanned(trimmed, bannedTokens)) {
    return { ok: false, reason: 'Futbolcu veya kulüp adı yazamazsın!' };
  }
  return { ok: true };
}

// ===========================================================================
// Oylama çözümü (Among Us kuralı)
// ===========================================================================

export type ImposterWinner = 'imposter' | 'crew';

/**
 * Oyları çöz: votes[oyVeren] = oyVerilenIndex (null = çekimser). İmposter
 * NET (tek başına) en çok oyu alırsa → masumlar (crew) kazanır; aksi halde
 * (berabere, başka biri en çok, herkes çekimser) → imposter kazanır.
 *
 * Döndürür: kazanan + elenen oyuncu index (en çok oy; berabere → elenen yok/-1).
 */
export function resolveVotes(
  votes: Record<number, number | null>,
  imposterIndex: number,
  playerCount: number,
): { winner: ImposterWinner; eliminatedIndex: number; tally: number[] } {
  const tally = new Array<number>(playerCount).fill(0);
  for (const v of Object.values(votes)) {
    if (v !== null && v >= 0 && v < playerCount) tally[v]!++;
  }
  // En çok oyu alan(lar)ı bul.
  let max = 0;
  for (const t of tally) if (t > max) max = t;
  const topIdxs = tally.map((t, i) => ({ t, i })).filter((x) => x.t === max && max > 0).map((x) => x.i);

  // NET tek elenen var mı?
  const eliminatedIndex = topIdxs.length === 1 ? topIdxs[0]! : -1;
  // Crew yalnız imposter TEK başına en çok oyu aldıysa kazanır.
  const winner: ImposterWinner = eliminatedIndex === imposterIndex ? 'crew' : 'imposter';
  return { winner, eliminatedIndex, tally };
}
