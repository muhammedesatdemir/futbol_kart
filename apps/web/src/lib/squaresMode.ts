/**
 * "Kareleri Kap" modu — saf mantık (React/DOM yok, test edilebilir).
 *
 * 5×5 kulüp matrisi verilir; oyuncu bir FUTBOLCU ismi seçer (autocomplete).
 * Sistem o futbolcunun matristeki kulüp hücrelerini bulur ve BİTİŞİK (4-yön)
 * en büyük grubu otomatik "kapatır" → grup büyüklüğü kadar puan. Kapanan kare
 * kilitlenir (MVP: çalma yok). En çok kare kapatan kazanır.
 *
 * Çekirdek mühendislik = KÜRASYONLU matris üretimi: saf rastgele dizilim çoğu
 * turda çözülemez/sıkıcı olur. Üret → çözülebilirlik skoru → düşükse yeniden
 * üret (rejection sampling). Türk-kulüp ağırlığı ülke-tavanıyla dengelenir.
 *
 * Veri: clubPool.json (havuz) + players[].clubs[] (eşleştirme). Ek scrape yok.
 * listMode.ts'in kardeş şablonu; online'da liste gibi sıra-tabanlı + can sistemli.
 */
import type { Player } from '@futbol-kart/shared-types';
import { createPRNG, type PRNG } from '@futbol-kart/game-engine';

/** Matris kenar uzunluğu — 5×5 sabit (25 kare). */
export const GRID_SIZE = 5;
/** Toplam hücre sayısı. */
export const CELL_COUNT = GRID_SIZE * GRID_SIZE;
/** Taraf başına can (yanlış/pas can götürür). listMode LIST_LIVES ile aynı felsefe. */
export const SQUARES_LIVES = 3;

/**
 * ELİT (kalburüstü) kulüpler — TM id ile (isim değil → ad değişse de bozulmaz).
 * Matrise BİLİNİRLİK getirir: her tur ~15'i buradan seçilir, geri kalan ~10
 * güçlü/niş kulüplerden → "~%60 elit + %40 normal-iyi" dengesi (kullanıcı kararı).
 */
const ELITE_CLUB_IDS = new Set<string>([
  'tm_418', // Real Madrid
  'tm_131', // Barcelona
  'tm_27', // Bayern Munich
  'tm_281', // Man City
  'tm_31', // Liverpool
  'tm_985', // Man Utd
  'tm_583', // PSG
  'tm_506', // Juventus
  'tm_631', // Chelsea
  'tm_11', // Arsenal
  'tm_5', // AC Milan
  'tm_46', // Inter
  'tm_13', // Atlético
  'tm_148', // Tottenham
  'tm_16', // Dortmund
  'tm_6195', // Napoli
  'tm_610', // Ajax
  'tm_294', // Benfica
  'tm_720', // Porto
  'tm_12', // Roma
  'tm_398', // Lazio
  'tm_368', // Sevilla FC
  'tm_244', // Marseille
  'tm_1049', // Valencia
  'tm_800', // Atalanta
  'tm_15', // Leverkusen
  'tm_762', // Newcastle
  'tm_405', // Aston Villa
]);

/**
 * KÜÇÜK-LİG / NİŞ kulüpler — havuzdan ÇIKARILIR (ne elit ne diğer katmanda).
 * Tek-temsilli küçük ligler (Yunanistan/Belçika/İskoçya/Monaco) + Hollanda'nın
 * niş kulüpleri. Bunların oyuncuları çok yer değiştirse de kullanıcı tanımaz →
 * "ölü kare" olur. Eleyerek 5-büyük-lig + tanınan kulüp ağırlığı artar.
 * (Ajax/Benfica/Porto/Sporting elit/tanınan olduğu için BURADA DEĞİL.)
 */
const EXCLUDED_CLUB_IDS = new Set<string>([
  'tm_162', // Monaco (tek temsil — Ligue: Fransa'da zaten 9 kulüp var)
  'tm_683', // Olympiacos (Yunanistan, tek temsil)
  'tm_58', // RSC Anderlecht (Belçika, tek temsil)
  'tm_371', // Celtic (İskoçya, tek temsil)
  'tm_234', // Feyenoord (Hollanda niş)
  'tm_383', // PSV (Hollanda niş)
]);

/** 25 kareden kaçı elit kulüp olsun (hedef — havuz yetmezse esner). */
const TARGET_ELITE = 15;
/**
 * Ülke tavanı — KATMAN bazlı. Elit kulüplerde gevşek (Real+Barça+Atléti+Sevilla+
 * Valencia hep gelebilsin), niş kulüplerde sıkı (Türk/orta kulüp yığılmasın).
 */
const MAX_PER_COUNTRY_ELITE = 6;
const MAX_PER_COUNTRY_OTHER = 2;
/** "Yeterince iyi" eşiği — bu uzunlukta bir zincir mümkün olunca erken kabul. */
const GOOD_ENOUGH_CHAIN = 6;
/** "Çözülebilirlik" için: en az bu kadar oyuncu ≥MIN_DECENT_CHAIN zincir kurabilmeli. */
const MIN_SOLVERS = 14;
const MIN_DECENT_CHAIN = 3;
/** Rejection sampling üst sınırı — daha çok deneme → en iyi yerleşimi seçme şansı. */
const MAX_GEN_ATTEMPTS = 120;

export type SquaresSide = 'P1' | 'P2';

/** Havuzdaki bir kulüp (clubPool.json kaydı — modun ihtiyacı kadarı). */
export interface PoolClub {
  id: string;
  name: string;
  country: string;
  crestUrl?: string;
}

/** Matristeki bir hücre — bir kulüp + (kapandıysa) sahibi. */
export interface GridCell {
  clubId: string;
  clubName: string;
  crestUrl?: string;
  /** Kapatan taraf — null ise boş. MVP: bir kez kapanınca değişmez (çalma yok). */
  capturedBy: SquaresSide | null;
  /** Hangi oyuncu (id) bu kareyi kapattı — rozet/gösterim için. */
  capturedByPlayerId?: string;
}

/** Üretilmiş bir matris — 5×5 hücre + kürasyon meta. */
export interface SquaresGrid {
  /** Satır-major: cells[row * GRID_SIZE + col]. */
  cells: GridCell[];
  size: number;
  /** Bu matristen çözülebilen en uzun bitişik zincir (kürasyon kalitesi). */
  bestPossibleChain: number;
}

// ===========================================================================
// Kulüp → hücre indeksleri ve bitişiklik (BFS)
// ===========================================================================

/** Bir oyuncunun oynadığı (benzersiz) kulüp id'leri. */
export function playerClubIds(player: Player): Set<string> {
  const s = new Set<string>();
  for (const stint of player.clubs) s.add(stint.clubId);
  return s;
}

/** 4-yön komşu indeksleri (ızgara kenar kontrollü). */
function neighbors(index: number, size: number): number[] {
  const row = Math.floor(index / size);
  const col = index % size;
  const out: number[] = [];
  if (row > 0) out.push(index - size); // yukarı
  if (row < size - 1) out.push(index + size); // aşağı
  if (col > 0) out.push(index - 1); // sol
  if (col < size - 1) out.push(index + 1); // sağ
  return out;
}

/**
 * Bir oyuncunun matriste BİTİŞİK en büyük grubunu bul (4-yön flood-fill).
 *
 * Yalnızca:
 *   - oyuncunun oynadığı kulübü içeren VE
 *   - henüz kapatılmamış (capturedBy === null)
 * hücreler "uygun" sayılır. Bu uygun hücreler arasında bağlı bileşenler bulunur,
 * en büyüğü döndürülür. Birden çok ayrık grubu varsa SADECE en büyük tek grup
 * (kullanıcı kararı: "en fazla kaça denk geliyorsa").
 *
 * `capturedBy !== null` hücreler engel: kapanan kare bitişikliği kırar (çalma yok).
 *
 * @returns en büyük grubun hücre indeksleri (boşsa []).
 */
export function largestAdjacentGroup(
  grid: SquaresGrid,
  playerClubs: Set<string>,
): number[] {
  const { cells, size } = grid;
  // Uygun hücreler: oyuncunun kulübü + boş.
  const eligible = new Set<number>();
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]!;
    if (c.capturedBy === null && playerClubs.has(c.clubId)) eligible.add(i);
  }
  if (eligible.size === 0) return [];

  const visited = new Set<number>();
  let best: number[] = [];

  for (const start of eligible) {
    if (visited.has(start)) continue;
    // BFS bu bileşeni topla.
    const component: number[] = [];
    const queue: number[] = [start];
    visited.add(start);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      component.push(cur);
      for (const nb of neighbors(cur, size)) {
        if (eligible.has(nb) && !visited.has(nb)) {
          visited.add(nb);
          queue.push(nb);
        }
      }
    }
    if (component.length > best.length) best = component;
  }
  return best;
}

// ===========================================================================
// Matris üretimi (kürasyonlu rejection sampling) — modun kalbi
// ===========================================================================

/**
 * Bir kulüp dizilişinin "çözülebilirliğini" ölç: havuzdaki oyunculardan kaçı
 * bu matriste ≥MIN_DECENT_CHAIN bitişik zincir kurabiliyor, ve mümkün en uzun
 * zincir kaç? Skor yüksekse matris ilginç (yıldız zincirleri mümkün).
 *
 * NOT: tüm hücreler boş (kapanmamış) varsayılır — üretim anı değerlendirmesi.
 */
function evaluateGrid(
  grid: SquaresGrid,
  players: Player[],
): { solvers: number; bestChain: number } {
  let solvers = 0;
  let bestChain = 0;
  for (const p of players) {
    const clubs = playerClubIds(p);
    // Hızlı eleme: oyuncunun matriste en az 2 kulübü yoksa zincir kuramaz.
    let hits = 0;
    for (const c of grid.cells) if (clubs.has(c.clubId)) hits++;
    if (hits < MIN_DECENT_CHAIN) continue;
    const group = largestAdjacentGroup(grid, clubs);
    if (group.length >= MIN_DECENT_CHAIN) solvers++;
    if (group.length > bestChain) bestChain = group.length;
  }
  return { solvers, bestChain };
}

/**
 * Bir kulüp listesinden ülke-tavanlı seçim yap (chosen'a EKLE). Zaten seçilmiş
 * id'leri ve ülke sayaçlarını paylaşır (katmanlar arası tutarlı tavan).
 */
function pickWithCap(
  source: PoolClub[],
  limit: number,
  maxPerCountry: number,
  chosen: PoolClub[],
  chosenIds: Set<string>,
  perCountry: Map<string, number>,
): void {
  let added = 0;
  for (const club of source) {
    if (added >= limit || chosen.length >= CELL_COUNT) break;
    if (chosenIds.has(club.id)) continue;
    const n = perCountry.get(club.country) ?? 0;
    if (n >= maxPerCountry) continue;
    perCountry.set(club.country, n + 1);
    chosen.push(club);
    chosenIds.add(club.id);
    added++;
  }
}

/**
 * Havuzdan KATMANLI 25 kulüp seç + ızgaraya yerleştir (seed'li tek deneme).
 *
 * Strateji (kullanıcı kararı — bilinirlik + çeşitlilik):
 *   1. ELİT katman: ~TARGET_ELITE kulüp, elit havuzundan, GEVŞEK ülke tavanı.
 *      → Real/Barça/Bayern/Liverpool gibi kalburüstüler hep gelir; her tur
 *        FARKLI elit kombinasyonu (shuffle) → çeşitlilik korunur.
 *   2. DİĞER katman: kalan ~10 kare, niş/güçlü havuzundan, SIKI ülke tavanı.
 *      → Türk/orta kulüp yığılmaz; tanınan ama niş kulüpler (Genoa, Betis…).
 *   3. Eksik kalırsa (küçük havuz) tavansız doldur.
 */
function buildOneGrid(
  pool: PoolClub[],
  prng: PRNG,
  pairWeight: Map<string, number>,
): SquaresGrid {
  // Küçük-lig/niş kulüpleri tamamen ÇIKAR (havuz filtresi).
  const usable = pool.filter((c) => !EXCLUDED_CLUB_IDS.has(c.id));
  const elitePool = prng.shuffle(usable.filter((c) => ELITE_CLUB_IDS.has(c.id)));
  const otherPool = prng.shuffle(usable.filter((c) => !ELITE_CLUB_IDS.has(c.id)));

  const chosen: PoolClub[] = [];
  const chosenIds = new Set<string>();
  const perCountry = new Map<string, number>();

  // 1) Elit katman — gevşek tavan (5 büyük ligden bol kulüp gelebilir).
  pickWithCap(elitePool, TARGET_ELITE, MAX_PER_COUNTRY_ELITE, chosen, chosenIds, perCountry);
  // 2) Diğer katman — sıkı tavan, kalan kareleri doldur.
  pickWithCap(otherPool, CELL_COUNT - chosen.length, MAX_PER_COUNTRY_OTHER, chosen, chosenIds, perCountry);
  // 3) Hâlâ eksikse (tavanlar tıkadı) → önce kalan elit, sonra diğer, tavansız.
  if (chosen.length < CELL_COUNT) {
    pickWithCap(elitePool, CELL_COUNT, Infinity, chosen, chosenIds, perCountry);
    pickWithCap(otherPool, CELL_COUNT, Infinity, chosen, chosenIds, perCountry);
  }

  // AKILLI YERLEŞTİRME: rastgele değil — ortak oyuncusu çok olan kulüpleri yan
  // yana koy → uzun bitişik zincirler mümkün olur ("hep 2'li" sorununu çözer).
  const placed = placeAdjacent(chosen.slice(0, CELL_COUNT), prng, pairWeight);

  return {
    size: GRID_SIZE,
    bestPossibleChain: 0,
    cells: placed.map((c) => ({
      clubId: c.id,
      clubName: c.name,
      crestUrl: c.crestUrl,
      capturedBy: null,
    })),
  };
}

/**
 * Kulüp-çifti ortak-oyuncu ağırlıkları: havuzdaki her kulüp ÇİFTİ için, kaç
 * oyuncu İKİSİNDE de oynamış? Akıllı yerleştirme bunu kullanır (çok ortaklı
 * kulüpler yan yana). Anahtar: `idA|idB` (id'ler sıralı). Tek geçiş, ucuz.
 */
function buildPairWeights(
  pool: PoolClub[],
  players: Player[],
): Map<string, number> {
  const poolIds = new Set(pool.map((c) => c.id));
  const weights = new Map<string, number>();
  for (const p of players) {
    // Oyuncunun HAVUZDAKİ benzersiz kulüpleri (sıralı — kararlı anahtar).
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

/**
 * AÇGÖZLÜ AKILLI YERLEŞTİRME — kulüpleri ızgaraya, BİRBİRİYLE ÇOK ORTAK OYUNCUSU
 * olanları bitişik (komşu) gelecek şekilde diz. Böylece bir oyuncunun kulüpleri
 * ızgarada kümelenir → uzun bitişik zincir (4-5'li) mümkün olur.
 *
 * Yöntem (deterministik, seed'li):
 *   - İlk kulübü rastgele bir hücreye koy.
 *   - Sırayla: boş hücrelerden, ŞİMDİYE DEK YERLEŞTİRİLMİŞ komşularıyla en yüksek
 *     toplam `pairWeight`'i (ortak oyuncu sayısı) veren (kulüp, hücre) çiftini seç.
 *   - Bağ yoksa (ilk kulüpler) rastgele hücre.
 */
function placeAdjacent(
  clubs: PoolClub[],
  prng: PRNG,
  pairWeight: Map<string, number>,
): PoolClub[] {
  const size = GRID_SIZE;
  const grid: (PoolClub | null)[] = new Array(CELL_COUNT).fill(null);
  const order = prng.shuffle(clubs); // hangi sırayla yerleştireceğimiz (çeşitlilik)

  const pw = (a: string, b: string): number =>
    pairWeight.get(a < b ? `${a}|${b}` : `${b}|${a}`) ?? 0;

  // İlk kulüp: rastgele hücre.
  const firstCell = Math.floor(prng.next() * CELL_COUNT);
  grid[firstCell] = order[0]!;

  for (let k = 1; k < order.length; k++) {
    const club = order[k]!;
    // Boş hücreler arasında, dolu komşularıyla en yüksek ağırlığı verenleri bul.
    let bestCells: number[] = [];
    let bestW = -1;
    for (let i = 0; i < CELL_COUNT; i++) {
      if (grid[i] !== null) continue;
      let w = 0;
      for (const nb of neighbors(i, size)) {
        const occ = grid[nb];
        if (occ) w += pw(club.id, occ.id);
      }
      if (w > bestW) {
        bestW = w;
        bestCells = [i];
      } else if (w === bestW) {
        bestCells.push(i);
      }
    }
    // Eşit ağırlıklılar arasından seed'li rastgele seç (çeşitlilik + determinizm).
    const cell = bestCells[Math.floor(prng.next() * bestCells.length)]!;
    grid[cell] = club;
  }

  // Tüm hücreler dolu (clubs.length === CELL_COUNT varsayımı). Güvenlik: boş
  // kalan olursa kalan kulüplerle doldur (clubs < 25 olmamalı ama garanti).
  return grid.map((c, i) => c ?? clubs[i] ?? clubs[0]!);
}

/**
 * KÜRASYONLU matris üretimi (rejection sampling).
 *
 * Aynı seed → aynı matris (online'da iki oyuncu aynı matrisi görür = adalet).
 * Üret → değerlendir → "iyi" değilse (yeterli solver + uzun zincir yok) farklı
 * alt-seed'le yeniden üret. MAX_GEN_ATTEMPTS sonunda en iyiyi döndür (asla
 * başarısız olmaz — her zaman bir matris üretir).
 */
export function generateGrid(
  seed: string,
  pool: PoolClub[],
  players: Player[],
): SquaresGrid {
  // Kulüp-çifti ortak-oyuncu ağırlıkları (akıllı yerleştirme için) — bir kez.
  const pairWeight = buildPairWeights(pool, players);

  let bestGrid: SquaresGrid | null = null;
  let bestScore = -1;

  for (let attempt = 0; attempt < MAX_GEN_ATTEMPTS; attempt++) {
    const prng = createPRNG(`squares:${seed}:grid:${attempt}`);
    const grid = buildOneGrid(pool, prng, pairWeight);
    const { solvers, bestChain } = evaluateGrid(grid, players);
    grid.bestPossibleChain = bestChain;

    // Skor: önce en uzun zincir (asıl kalite — uzun zincir = "vay be" anı),
    // sonra solver sayısı (oynanabilirlik). En iyiyi sakla.
    const score = bestChain * 1000 + solvers;
    if (score > bestScore) {
      bestScore = score;
      bestGrid = grid;
    }

    // ERKEN KABUL: yeterince güçlü bir matris (uzun zincir + bol solver) bulunca
    // dur — daha fazla denemeye gerek yok (deterministik: aynı seed → aynı sonuç).
    if (bestChain >= GOOD_ENOUGH_CHAIN && solvers >= MIN_SOLVERS) {
      return grid;
    }
  }
  // Eşiğe ulaşılamadı → TÜM denemeler arasından en iyi yerleşimi döndür.
  return bestGrid!;
}

// ===========================================================================
// Tahmin değerlendirme + puanlama + bitiş
// ===========================================================================

/** Bir tahminin sonucu (client'a dönülür — matris zaten açık, sızıntı yok). */
export type SquaresGuessResult =
  | { hit: false }
  | { hit: true; cells: number[]; gained: number };

/**
 * Bir oyuncu tahminini değerlendir: matriste bitişik en büyük grubu bul.
 * Boş grup → miss (oyuncunun matriste boş/uygun kulübü yok). Aksi halde hit +
 * kapatılacak hücreler + kazanılan puan (grup boyutu).
 *
 * Bu fonksiyon SADECE hesaplar; state'i `applyGuess` günceller.
 */
export function evaluateGuess(
  grid: SquaresGrid,
  player: Player,
): SquaresGuessResult {
  const group = largestAdjacentGroup(grid, playerClubIds(player));
  if (group.length === 0) return { hit: false };
  return { hit: true, cells: group, gained: group.length };
}

/** Bir tarafın kapattığı toplam kare sayısı (= puanı). */
export function sideScore(grid: SquaresGrid, side: SquaresSide): number {
  let n = 0;
  for (const c of grid.cells) if (c.capturedBy === side) n++;
  return n;
}

/** Boş (kapatılmamış) kare sayısı. */
export function emptyCount(grid: SquaresGrid): number {
  let n = 0;
  for (const c of grid.cells) if (c.capturedBy === null) n++;
  return n;
}

export type SquaresWinner = 'P1' | 'P2' | 'tie';

/** Kazananı kare sayısına göre belirle. */
export function decideWinner(grid: SquaresGrid): SquaresWinner {
  const p1 = sideScore(grid, 'P1');
  const p2 = sideScore(grid, 'P2');
  if (p1 === p2) return 'tie';
  return p1 > p2 ? 'P1' : 'P2';
}

/**
 * Hücreleri bir taraf adına kapat (state'i mutasyonsuz — yeni grid döner).
 * `cells` = `evaluateGuess`'ten gelen grup. capturedBy null olanlar kapanır.
 */
export function captureCells(
  grid: SquaresGrid,
  cells: number[],
  side: SquaresSide,
  playerId: string,
): SquaresGrid {
  const next = grid.cells.map((c, i) =>
    cells.includes(i) && c.capturedBy === null
      ? { ...c, capturedBy: side, capturedByPlayerId: playerId }
      : c,
  );
  return { ...grid, cells: next };
}

// ===========================================================================
// Snake sıra (Arkadaşa Karşı) — listMode.listSnakeOrder ile aynı desen
// ===========================================================================

/** Snake sırası (A,B / B,A / …) — `steps` adım. listSnakeOrder ile aynı. */
export function squaresSnakeOrder(
  steps: number,
  first: SquaresSide = 'P1',
): SquaresSide[] {
  const other: SquaresSide = first === 'P1' ? 'P2' : 'P1';
  const order: SquaresSide[] = [];
  for (let round = 0; round < Math.ceil(steps / 2); round++) {
    const [a, b] = round % 2 === 0 ? [first, other] : [other, first];
    order.push(a, b);
  }
  return order.slice(0, steps);
}

// ===========================================================================
// Bot (Bota Karşı) — listMode.botKnownRanks felsefesi: kasıtlı kusurlu
// ===========================================================================

/**
 * Botun bir turdaki tahmini: matriste en büyük grubu kapatabilecek oyunculardan
 * birini bulur ama HER ZAMAN en iyisini seçmez (kasıtlı kusur — yenilebilir).
 *
 * `skill` 0..1: 1 = hep en büyük grup, 0.5 = orta, 0 = rastgele uygun oyuncu.
 * Bulamazsa null (bot pas geçer → can −1).
 *
 * @returns seçtiği oyuncu + kapatacağı grup, ya da null (uygun hamle yok).
 */
export function botPickGuess(
  grid: SquaresGrid,
  pool: Player[],
  rng: () => number,
  skill = 0.6,
): { player: Player; result: SquaresGuessResult } | null {
  // Tüm uygun oyuncuları (grup ≥1) grup boyutuna göre topla.
  const candidates: Array<{ player: Player; size: number; cells: number[] }> = [];
  for (const p of pool) {
    const group = largestAdjacentGroup(grid, playerClubIds(p));
    if (group.length >= 1) {
      candidates.push({ player: p, size: group.length, cells: group });
    }
  }
  if (candidates.length === 0) return null;

  // Grup boyutuna göre azalan sırala.
  candidates.sort((a, b) => b.size - a.size);

  // skill ile bir aday seç: yüksek skill → baştan (en büyük), düşük → rastgele.
  // index = floor((1 - skill) * rastgele * (n-1)) → skill düştükçe daha geriden.
  const span = Math.max(1, Math.floor((1 - skill) * candidates.length));
  const idx = Math.floor(rng() * span);
  const choice = candidates[Math.min(idx, candidates.length - 1)]!;

  return {
    player: choice.player,
    result: { hit: true, cells: choice.cells, gained: choice.size },
  };
}
