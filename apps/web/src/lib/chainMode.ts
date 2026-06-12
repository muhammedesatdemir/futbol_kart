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

/**
 * KÜRASYON KATEGORİLERİ (kullanıcı kararı — çeşitlilik dengesi).
 *
 * 7 kulüp = 3 (top-elit) + 3 (diğer-elit) + 1 (Türk). Her kategoriden KATEGORİ
 * İÇİ TAM RASTGELE seçim → eski greedy bias'ı (Milan/Barça hep gelir) kırılır,
 * 28 elit arasında adil dağılım + her oyunda 1 Türk kulübü.
 */

/** TOP-10 elit (en bilinen/çok-bağlantılı) — 7 kulüpten 3'ü buradan rastgele. */
const TOP_ELITE_IDS = [
  'tm_5', // AC Milan
  'tm_131', // Barcelona
  'tm_506', // Juventus
  'tm_631', // Chelsea
  'tm_46', // Inter
  'tm_244', // Marseille
  'tm_418', // Real Madrid
  'tm_1041', // Lyon
  'tm_583', // PSG
  'tm_13', // Atlético
];

/** DİĞER elit (Türk hariç kalan elitler) — 7 kulüpten 3'ü buradan rastgele. */
const OTHER_ELITE_IDS = [
  'tm_368', // Sevilla FC
  'tm_610', // Ajax
  'tm_294', // Benfica
  'tm_6195', // Napoli
  'tm_12', // Roma
  'tm_985', // Man Utd
  'tm_16', // Dortmund
  'tm_720', // Porto
  'tm_33', // FC Schalke 04
  'tm_11', // Arsenal
  'tm_281', // Man City
  'tm_148', // Tottenham
  'tm_31', // Liverpool
  'tm_15', // Leverkusen
  'tm_27', // Bayern Munich
];

/** TÜRK büyük üçlü — Türk slotu geldiğinde %70 bu kategori (içinde eşit rastgele). */
const TURKISH_BIG_IDS = [
  'tm_36', // Fenerbahçe
  'tm_141', // Galatasaray
  'tm_114', // Besiktas
];

/** TÜRK küçükler — Türk slotu geldiğinde %30 bu kategori (içinde eşit rastgele). */
const TURKISH_SMALL_IDS = [
  'tm_449', // Trabzonspor
  'tm_6890', // Basaksehir
  'tm_2293', // Konyaspor
  'tm_589', // Antalyaspor
];

/** Türk slotunda büyük-üçlü gelme olasılığı (kalanı küçükler). */
const TURKISH_BIG_PROB = 0.7;

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

/** Bir futbolcunun ekrandaki 7 kulüpten oynadıklarının id listesi (keşişim). */
export function matchedClubs(player: Player, clubIds: Set<string>): string[] {
  const out = new Set<string>();
  for (const stint of player.clubs) {
    if (clubIds.has(stint.clubId)) out.add(stint.clubId);
  }
  return [...out];
}

// ===========================================================================
// KATEGORİK KÜRASYON — modun kalbi (adil dağılım + Türk garantisi)
// ===========================================================================

/** Bir id listesinden N tanesini KATEGORİ İÇİ tam rastgele seç (tekrarsız). */
function pickRandomIds(ids: string[], n: number, prng: PRNG): string[] {
  return prng.shuffle(ids).slice(0, n);
}

/**
 * 7 kulüp seç (kullanıcı kararı — kategorik adil dağılım):
 *   • 3 kulüp ← TOP_ELITE (10) tam rastgele
 *   • 3 kulüp ← OTHER_ELITE (15) tam rastgele
 *   • 1 kulüp ← TÜRK: %TURKISH_BIG_PROB büyük-üçlü (3, eşit rastgele),
 *                     kalan olasılıkla küçükler (4, eşit rastgele)
 *
 * Greedy/pairWeight YOK → eski bias (Milan/Barça hep gelir) kırıldı; her oyunda
 * 1 Türk kulübü garanti. Aynı seed → aynı 7 kulüp (online adaleti).
 * Havuzda olmayan/eksik id güvenle atlanır (byId map).
 */
export function curateClubs(
  seed: string,
  pool: PoolClub[],
  _players: Player[],
): ChainClub[] {
  const prng = createPRNG(`chain:${seed}:clubs`);
  const byId = new Map(pool.map((c) => [c.id, c]));
  const exists = (id: string) => byId.has(id);

  const chosenIds: string[] = [
    ...pickRandomIds(TOP_ELITE_IDS.filter(exists), 3, prng),
    ...pickRandomIds(OTHER_ELITE_IDS.filter(exists), 3, prng),
  ];

  // Türk slotu — kategori seç (%70 büyük / %30 küçük), sonra içinden 1 rastgele.
  const turkishBig = TURKISH_BIG_IDS.filter(exists);
  const turkishSmall = TURKISH_SMALL_IDS.filter(exists);
  const useBig = prng.next() < TURKISH_BIG_PROB && turkishBig.length > 0;
  const turkPool = useBig ? turkishBig : turkishSmall.length > 0 ? turkishSmall : turkishBig;
  const turkId = pickRandomIds(turkPool, 1, prng)[0];
  if (turkId) chosenIds.push(turkId);

  // Güvenlik: bir şekilde 7'ye ulaşılamadıysa (eksik kategori) elitlerden tamamla.
  if (chosenIds.length < CHAIN_CLUB_COUNT) {
    const fill = prng.shuffle(
      [...TOP_ELITE_IDS, ...OTHER_ELITE_IDS].filter(
        (id) => exists(id) && !chosenIds.includes(id),
      ),
    );
    for (const id of fill) {
      if (chosenIds.length >= CHAIN_CLUB_COUNT) break;
      chosenIds.push(id);
    }
  }

  // Ekran sırasını karıştır (kategori sırası belli olmasın) → 4+3 düzene serpilir.
  return prng
    .shuffle(chosenIds.slice(0, CHAIN_CLUB_COUNT))
    .map((id) => {
      const c = byId.get(id)!;
      return { id: c.id, name: c.name, crestUrl: c.crestUrl };
    });
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

// ===========================================================================
// Öneri jokeri — "iyi bir futbolcu öner" (Kadro suggestForDraft felsefesi)
// ===========================================================================

/**
 * Öneri jokeri: ekrandaki 7 kulüpten ÇOK tutan, ÜST DİLİMDEN (en iyi ~%15) bir
 * futbolcu önerir — mutlak en iyiyi DEĞİL (oyunu bitirmesin, yardımcı olsun).
 * Kadro `suggestForDraft` ile aynı denge. `excludeIds` zaten girilmiş oyuncular.
 *
 * @returns önerilen oyuncu + tuttuğu kulüpler, ya da null (uygun aday yok).
 */
export function suggestPick(
  clubIds: Set<string>,
  pool: Player[],
  excludeIds: Set<string>,
  rng: () => number,
): { player: Player; matched: string[] } | null {
  const candidates: Array<{ player: Player; matched: string[]; n: number }> = [];
  for (const p of pool) {
    if (excludeIds.has(p.id)) continue;
    const m = matchedClubs(p, clubIds);
    if (m.length >= 2) candidates.push({ player: p, matched: m, n: m.length });
  }
  // En az 2 kulüp tutan yoksa, 1 tutanlara düş (yine de bir öneri verelim).
  if (candidates.length === 0) {
    for (const p of pool) {
      if (excludeIds.has(p.id)) continue;
      const m = matchedClubs(p, clubIds);
      if (m.length >= 1) candidates.push({ player: p, matched: m, n: m.length });
    }
  }
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.n - a.n);
  // ÜST DİLİM: en iyi 1..4 aday içinden rastgele (mükemmel değil, iyi).
  const topK = Math.min(4, Math.max(1, Math.ceil(candidates.length * 0.15)));
  const choice = candidates[Math.floor(rng() * topK)]!;
  return { player: choice.player, matched: choice.matched };
}
