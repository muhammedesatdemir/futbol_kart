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

/** Matris üretiminde ülke başına en fazla kaç kulüp (Türk-ağırlık dengesi). */
const MAX_PER_COUNTRY = 3;
/** Üretilen matrisin "iyi" sayılması için gereken en az zincir uzunluğu. */
const MIN_BEST_CHAIN = 4;
/** "Çözülebilirlik" için: en az bu kadar oyuncu ≥MIN_DECENT_CHAIN zincir kurabilmeli. */
const MIN_SOLVERS = 12;
const MIN_DECENT_CHAIN = 3;
/** Rejection sampling üst sınırı — bu kadar denemede iyi matris bulunamazsa en iyisini döndür. */
const MAX_GEN_ATTEMPTS = 60;

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
 * Havuzdan ülke-tavanlı 25 kulüp seç + ızgaraya yerleştir (seed'li tek deneme).
 * Ülke tavanı (MAX_PER_COUNTRY) Türk-kulüp ağırlığını dengeler.
 */
function buildOneGrid(pool: PoolClub[], prng: PRNG): SquaresGrid {
  const shuffled = prng.shuffle(pool);
  const chosen: PoolClub[] = [];
  const perCountry = new Map<string, number>();
  for (const club of shuffled) {
    if (chosen.length >= CELL_COUNT) break;
    const n = perCountry.get(club.country) ?? 0;
    if (n >= MAX_PER_COUNTRY) continue;
    perCountry.set(club.country, n + 1);
    chosen.push(club);
  }
  // Tavan yüzünden 25'e ulaşamazsak (küçük havuz), kalanları tavansız doldur.
  if (chosen.length < CELL_COUNT) {
    const chosenIds = new Set(chosen.map((c) => c.id));
    for (const club of shuffled) {
      if (chosen.length >= CELL_COUNT) break;
      if (!chosenIds.has(club.id)) chosen.push(club);
    }
  }
  // Izgaraya yerleştir (zaten karışık sırada).
  const grid: SquaresGrid = {
    size: GRID_SIZE,
    bestPossibleChain: 0,
    cells: chosen.slice(0, CELL_COUNT).map((c) => ({
      clubId: c.id,
      clubName: c.name,
      crestUrl: c.crestUrl,
      capturedBy: null,
    })),
  };
  return grid;
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
  let bestGrid: SquaresGrid | null = null;
  let bestScore = -1;

  for (let attempt = 0; attempt < MAX_GEN_ATTEMPTS; attempt++) {
    const prng = createPRNG(`squares:${seed}:grid:${attempt}`);
    const grid = buildOneGrid(pool, prng);
    const { solvers, bestChain } = evaluateGrid(grid, players);
    grid.bestPossibleChain = bestChain;

    // "İyi" eşiği: yeterli oyuncu çözebiliyor + en az MIN_BEST_CHAIN uzunlukta
    // bir zincir mümkün. İlk uyan matrisi hemen kullan (deterministik, hızlı).
    if (solvers >= MIN_SOLVERS && bestChain >= MIN_BEST_CHAIN) {
      return grid;
    }
    // Skor = öncelik bestChain, sonra solvers (en iyiyi sakla — fallback).
    const score = bestChain * 1000 + solvers;
    if (score > bestScore) {
      bestScore = score;
      bestGrid = grid;
    }
  }
  // Hiçbir deneme eşiği geçmedi → en iyi adayı döndür (yine de oynanabilir).
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
