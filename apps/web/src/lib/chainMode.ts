/**
 * "Zincir Kur" modu — saf mantık (React/DOM yok, test edilebilir).
 *
 * 7 kulüp gösterilir (BİTİŞİKLİK YOK — Kareleri Kap'tan farkı bu). Her oyuncu
 * sırayla 5'er futbolcu girer; bir futbolcu bu 7 kulüpten KAÇINDA oynadıysa o
 * kadar puan (keşişim sayısı). 5 futbolcunun toplamı = tarafın skoru. En çok
 * puan kazanan kazanır.
 *
 * Çekirdek: ÇOK-LİGLİ KÜRASYON — 7 kulüp, birbiriyle bol ortak oyuncusu olacak
 * (çözülebilirlik) AMA tek lige sıkışmadan (ülke tavanı → 3-4 ülke/tur). Saf
 * rastgele 7 kulüp sönük olur (analiz: çoğu seçim 1 puan, berabere meyilli).
 *
 * Veri: clubPool.json (havuz) + players[].clubs[]. Ek scrape yok.
 * squaresMode.ts'in kardeşi ama daha basit (BFS yok, sadece kesişim sayma).
 */
import type { Player } from '@futbol-kart/shared-types';
import { createPRNG, type PRNG } from '@futbol-kart/game-engine';

/** Ekrandaki kulüp sayısı (4 üst + 3 alt). */
export const CHAIN_CLUB_COUNT = 7;
/** Her oyuncunun gireceği futbolcu sayısı. */
export const CHAIN_PICKS_PER_SIDE = 5;
/** Toplam draft adımı (iki taraf × 5). */
export const CHAIN_TOTAL_STEPS = CHAIN_PICKS_PER_SIDE * 2;

/** ELİT kulüpler (squaresMode ile AYNI liste — tek kaynak olması için kopya). */
const ELITE_CLUB_IDS = new Set<string>([
  'tm_5', 'tm_46', 'tm_506', 'tm_6195', 'tm_12', // İtalya elit
  'tm_36', 'tm_141', 'tm_114', // Türk elit
  'tm_148', 'tm_11', 'tm_281', 'tm_31', 'tm_985', 'tm_631', // İngiltere elit
  'tm_27', 'tm_16', 'tm_15', 'tm_33', // Almanya elit
  'tm_244', 'tm_583', 'tm_1041', // Fransa elit
  'tm_131', 'tm_418', 'tm_13', 'tm_368', // İspanya elit
  'tm_610', 'tm_294', 'tm_720', // Ajax/Benfica/Porto
]);

/** 7 kulüp seçilirken tek ülkeden en fazla kaç (lig kümelenmesini önler). */
const MAX_PER_COUNTRY = 3;

export type ChainSide = 'P1' | 'P2';

/** Havuzdaki bir kulüp (clubPool.json kaydı). */
export interface PoolClub {
  id: string;
  name: string;
  country: string;
  crestUrl?: string;
}

/** Ekrandaki bir kulüp + (girilen futbolcular tarafından) kim kapattı bilgisi. */
export interface ChainClub {
  id: string;
  name: string;
  crestUrl?: string;
}

/** Bir tarafın girdiği bir futbolcu + hangi kulüpleri tuttuğu (puan kaynağı). */
export interface ChainPick {
  playerId: string;
  /** Bu futbolcunun ekrandaki 7 kulüpten tuttuğu kulüp id'leri (puan = uzunluk). */
  matchedClubIds: string[];
}

// ===========================================================================
// Kulüp-çifti ortak-oyuncu ağırlıkları (kürasyon için) + keşişim
// ===========================================================================

/** Kulüp çiftleri arası ortak oyuncu sayısı (kürasyon greedy'si kullanır). */
function buildPairWeights(
  pool: PoolClub[],
  players: Player[],
): Map<string, number> {
  const poolIds = new Set(pool.map((c) => c.id));
  const weights = new Map<string, number>();
  for (const p of players) {
    const ids = [...new Set(p.clubs.map((s) => s.clubId))]
      .filter((id) => poolIds.has(id))
      .sort();
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const key = `${ids[i]}|${ids[j]}`;
        weights.set(key, (weights.get(key) ?? 0) + 1);
      }
    }
  }
  return weights;
}

/** Bir futbolcunun ekrandaki 7 kulüpten oynadıklarının id listesi (keşişim). */
export function matchedClubs(player: Player, clubIds: Set<string>): string[] {
  const out = new Set<string>();
  for (const stint of player.clubs) {
    if (clubIds.has(stint.clubId)) out.add(stint.clubId);
  }
  return [...out];
}

// ===========================================================================
// ÇOK-LİGLİ KÜRASYON — modun kalbi (çözülebilir + çok-ligli 7 kulüp)
// ===========================================================================

/**
 * 7 kulüp seç: birbiriyle BOL ortak oyuncusu olan (çözülebilirlik) ama tek lige
 * sıkışmayan (ülke tavanı → 3-4 ülke). Greedy: elit bir tohumdan başla, sırayla
 * seçilenlere TOPLAM ortak-oyuncu ağırlığı en yüksek kulübü ekle (hafif jitter
 * ile çeşitlilik). Aynı seed → aynı 7 kulüp (online'da iki oyuncu aynısını görür).
 */
export function curateClubs(
  seed: string,
  pool: PoolClub[],
  players: Player[],
): ChainClub[] {
  const pairWeight = buildPairWeights(pool, players);
  const pw = (a: string, b: string): number =>
    pairWeight.get(a < b ? `${a}|${b}` : `${b}|${a}`) ?? 0;

  const prng = createPRNG(`chain:${seed}:clubs`);
  const elitePool = prng.shuffle(pool.filter((c) => ELITE_CLUB_IDS.has(c.id)));

  // Tohum: rastgele bir elit kulüp.
  const chosen: PoolClub[] = [elitePool[0]!];
  const chosenIds = new Set<string>([chosen[0]!.id]);
  const perCountry = new Map<string, number>([[chosen[0]!.country, 1]]);

  while (chosen.length < CHAIN_CLUB_COUNT) {
    let best: PoolClub | null = null;
    let bestScore = -1;
    for (const c of pool) {
      if (chosenIds.has(c.id)) continue;
      if ((perCountry.get(c.country) ?? 0) >= MAX_PER_COUNTRY) continue;
      let w = 0;
      for (const ch of chosen) w += pw(c.id, ch.id);
      // Jitter (×0.8–1.2): eşit-güçlü adaylar arasında çeşitlilik, determinizm korunur.
      const score = w * (0.8 + prng.next() * 0.4);
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    // Ülke tavanı tüm adayları tıkadıysa → tavansız en iyi (havuz küçükse güvenlik).
    if (!best) {
      for (const c of pool) {
        if (chosenIds.has(c.id)) continue;
        let w = 0;
        for (const ch of chosen) w += pw(c.id, ch.id);
        if (w > bestScore) {
          bestScore = w;
          best = c;
        }
      }
    }
    if (!best) break;
    chosen.push(best);
    chosenIds.add(best.id);
    perCountry.set(best.country, (perCountry.get(best.country) ?? 0) + 1);
  }

  // Ekran sırasını karıştır (tohum hep başta görünmesin) → 4+3 düzene serpilir.
  return prng.shuffle(chosen).map((c) => ({
    id: c.id,
    name: c.name,
    crestUrl: c.crestUrl,
  }));
}

// ===========================================================================
// Tahmin değerlendirme + puanlama + bitiş
// ===========================================================================

/** Bir futbolcunun puanı = ekrandaki 7 kulüpten oynadığı kulüp sayısı. */
export function scorePick(player: Player, clubIds: Set<string>): number {
  return matchedClubs(player, clubIds).length;
}

/** Bir tarafın toplam puanı (girdiği tüm pick'lerin matchedClubIds toplamı). */
export function sideScore(picks: ChainPick[]): number {
  let n = 0;
  for (const p of picks) n += p.matchedClubIds.length;
  return n;
}

export type ChainWinner = 'P1' | 'P2' | 'tie';

export function decideWinner(p1: ChainPick[], p2: ChainPick[]): ChainWinner {
  const a = sideScore(p1);
  const b = sideScore(p2);
  if (a === b) return 'tie';
  return a > b ? 'P1' : 'P2';
}

// ===========================================================================
// Snake sırası (Arkadaşa Karşı + online) — A-B-B-A-A-B-B-A-A-B
// ===========================================================================

/**
 * Snake sırası — kullanıcı tarifi: A-B-B-A-A-B-B-A-A-B (10 adım, 5+5 dengeli).
 * İlk başlayan avantajı dengelenir (ardışık tekrarlarla simetri).
 * `first` ile P1 mi P2 mi başlar belirlenir.
 */
export function chainSnakeOrder(first: ChainSide = 'P1'): ChainSide[] {
  const a = first;
  const b: ChainSide = first === 'P1' ? 'P2' : 'P1';
  // A B B A A B B A A B
  return [a, b, b, a, a, b, b, a, a, b];
}

// ===========================================================================
// Bot (Bota Karşı) — kasıtlı kusurlu (squaresMode bot felsefesi)
// ===========================================================================

/**
 * Botun bir turdaki tahmini: ekrandaki 7 kulüpten en çok tutan oyunculardan
 * birini bulur ama HER ZAMAN en iyisini seçmez (kasıtlı kusur — yenilebilir).
 * `excludeIds` zaten girilmiş oyuncular (iki taraf da tekrar giremez).
 *
 * `skill` 0..1: 1 = hep en yüksek puanlı, 0 = rastgele tutan. Bulamazsa null.
 */
export function botPick(
  clubIds: Set<string>,
  pool: Player[],
  excludeIds: Set<string>,
  rng: () => number,
  skill = 0.6,
): { player: Player; matched: string[] } | null {
  const candidates: Array<{ player: Player; matched: string[]; n: number }> = [];
  for (const p of pool) {
    if (excludeIds.has(p.id)) continue;
    const m = matchedClubs(p, clubIds);
    if (m.length >= 1) candidates.push({ player: p, matched: m, n: m.length });
  }
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.n - a.n);
  // skill düştükçe daha geriden seç (kasıtlı kusur).
  const span = Math.max(1, Math.floor((1 - skill) * candidates.length));
  const idx = Math.floor(rng() * span);
  const choice = candidates[Math.min(idx, candidates.length - 1)]!;
  return { player: choice.player, matched: choice.matched };
}

export { ELITE_CLUB_IDS };
