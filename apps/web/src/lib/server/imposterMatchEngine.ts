/**
 * Sunucu-otoriteli "İmposter" online motoru (N-kişilik — 3-5 oyuncu).
 *
 * Diğer mod motorlarının KARDEŞİ ama ÇOK-OYUNCULU + GİZLİ ROL:
 *   • Gizli futbolcu + imposter seed'den deterministik seçilir.
 *   • SAHNE ZİNCİRİ: ROLE_REVEAL → WORDS (3 tur, sıra-tabanlı) → VOTE → RESULT.
 *   • `viewImposterState(side)`: TARAF-ÖZEL maskeli görünüm — kim imposter GİZLİ,
 *     imposter'a ipucu/masuma futbolcu adı, oylar VOTE bitene kadar gizli.
 *
 * STATE: `match.state` jsonb OPAK (`match.mode='imposter'`). Oyuncu kimlikleri
 * `match_player` tablosunda (state'te yalnız İSİM + index tutulur, userId değil).
 *
 * Bkz PLAN.md §16, §23.
 */
import type { Player } from '@futbol-kart/shared-types';
import { loadGameData } from '@/lib/data';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomInt, randomUUID } from 'node:crypto';
import {
  pickSecretFromPool,
  pickSecretPlayer,
  buildClue,
  secretNameTokens,
  isValidWord,
  resolveVotes,
  IMPOSTER_ROUNDS,
  IMPOSTER_ROLE_SECONDS,
  IMPOSTER_WORD_SECONDS,
  IMPOSTER_VOTE_SECONDS,
  type ImposterClue,
  type ImposterWinner,
} from '@/lib/imposterMode';

/** Bir oyuncunun bir turdaki yazdığı kelime (null = henüz yazmadı / pas). */
export type ImposterWord = string | null;

/** Online "İmposter" maç durumu — `match.state` jsonb (opak). */
export interface ImposterMatchState {
  kind: 'imposter';
  /** Oyuncu isimleri (index sırası = match_player.playerIndex; userId DEĞİL). */
  playerNames: string[];
  /** Gizli futbolcu — sunucu-içi tam veri (route maskeler: imposter görmez). */
  secretPlayerId: string;
  secretPlayerName: string;
  /** İmposter'ın oyuncu index'i (route maskeler: kimse görmez, RESULT'ta açılır). */
  imposterIndex: number;
  /** İmposter'a verilen bulanık ipucu (route: yalnız imposter'a gösterir). */
  clue: ImposterClue;
  /** Yasak token'lar (gizli futbolcu adı kökleri — kulüpler runtime eklenir). */
  bannedNameTokens: string[];
  /** Sunucu-otoriteli sahne. */
  scene: 'ROLE_REVEAL' | 'WORDS' | 'VOTE' | 'RESULT';
  /** Şu anki kelime turu (0..IMPOSTER_ROUNDS). */
  round: number;
  /** Aktif yazan oyuncu index'i (sıra-tabanlı; WORDS sahnesinde). */
  activeIndex: number;
  /** words[round][playerIndex] = yazılan kelime (null = sırası gelmedi). */
  words: ImposterWord[][];
  /** ROLE_REVEAL'i kim onayladı (herkes onaylayınca WORDS başlar). */
  roleAcks: boolean[];
  /** Oylar: votes[oyVerenIndex] = oyVerilenIndex (null = çekimser VEYA henüz vermedi). */
  votes: Array<number | null>;
  /** voted[oyVerenIndex] = oy AKSİYONU gönderildi mi (çekimser dahil). votes null'u
   *  "çekimser" ile "henüz vermedi"yi ayırır → "herkes oy verdi" tespiti doğru olur. */
  voted: boolean[];
  winner: ImposterWinner | null;
  /** Oy dökümü (RESULT'ta açılır). */
  tally: number[];
  /** Elenen oyuncu index (RESULT; -1 = berabere, kimse elenmedi). */
  eliminatedIndex: number;
}

export function imposterSceneDeadlineSeconds(state: ImposterMatchState): number | null {
  switch (state.scene) {
    case 'ROLE_REVEAL':
      return IMPOSTER_ROLE_SECONDS;
    case 'WORDS':
      return IMPOSTER_WORD_SECONDS;
    case 'VOTE':
      return IMPOSTER_VOTE_SECONDS;
    default:
      return null;
  }
}

// Yasak kulüp adı token'ları — bir kez hesaplanır (cache). loadGameData cache'li.
let cachedClubTokens: Set<string> | null = null;
async function loadBannedClubTokens(): Promise<Set<string>> {
  if (cachedClubTokens) return cachedClubTokens;
  const { clubs } = await loadGameData();
  const set = new Set<string>();
  for (const c of clubs) {
    for (const tok of c.name.split(/\s+/)) {
      const n = tok
        .toLocaleLowerCase('tr-TR')
        .replace(/[çğıöşü]/g, (ch) => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' })[ch] ?? ch)
        .replace(/[^a-z0-9]/g, '');
      if (n.length >= 4) set.add(n); // 4+ harf kulüp token'ları (FC/SC gibi kısa ekler hariç)
    }
  }
  cachedClubTokens = set;
  return set;
}

/** Kürate gizli-futbolcu havuzu (kariyer-havuz.txt rank 1-585 → imposterPool.json). */
interface ImposterPool { tierA: string[]; tierB: string[] }
let cachedPool: ImposterPool | null = null;
async function loadImposterPool(): Promise<ImposterPool | null> {
  if (cachedPool) return cachedPool;
  try {
    const path = join(process.cwd(), 'public', 'data', 'imposterPool.json');
    const raw = JSON.parse(await readFile(path, 'utf8')) as ImposterPool;
    if (Array.isArray(raw.tierA) && Array.isArray(raw.tierB)) {
      cachedPool = raw;
      return raw;
    }
  } catch {
    // havuz yoksa → marquee fallback (pickSecretPlayer)
  }
  return null;
}

/**
 * Online başlangıç state. `names` = oyuncuların görünen adları (match_player
 * index sırası). İmposter + gizli futbolcu + ipucu SUNUCU-GİZLİ rastgeleden
 * seçilir (public `seed`'den DEĞİL — güvenlik). ROLE_REVEAL sahnesiyle başlar.
 *
 * NOT: `seed` parametresi imza-tutarlılığı için korunur (matchmaking maç seed'ini
 * geçer) ama İMPOSTER'da KULLANILMAZ — rol/cevap seed'den türetilirse client
 * konsoldan hesaplar. crypto rastgele kullanılır.
 */
export async function buildInitialImposterState(
  _seed: string,
  names: string[],
): Promise<ImposterMatchState> {
  const { players } = await loadGameData();
  // 🔒 GİZLİ SEED — gizli futbolcu + ipucu bundan türetilir (public `seed`'den DEĞİL).
  // Public seed client'a açık olsaydı, kürate havuz + algoritma public olduğundan
  // gizli futbolcu konsoldan hesaplanabilirdi. crypto rastgele → türetilemez.
  const privateSeed = randomUUID();
  // Gizli futbolcu: önce KÜRATE havuz (kariyer-havuz.txt rank 1-585, %60/%40 bant);
  // havuz yüklenemezse marquee fallback.
  const pool = await loadImposterPool();
  let secret: Player | null = null;
  if (pool) {
    const playersById = new Map((players as Player[]).map((p) => [p.id, p]));
    secret = pickSecretFromPool(privateSeed, pool.tierA, pool.tierB, playersById);
  }
  if (!secret) secret = pickSecretPlayer(privateSeed, players as Player[]);
  if (!secret) throw new Error('Gizli futbolcu havuzu boş.');

  const clue = buildClue(privateSeed, secret);
  // 🔒 İMPOSTER INDEX — SUNUCU-GİZLİ RASTGELE (seed'den DEĞİL!).
  // KRİTİK: seed client'a açık (GET yanıtı + hash algoritması public bundle'da).
  // Eğer imposterIndex seed'den deterministik türetilseydi, bir oyuncu konsoldan
  // hesaplayıp imposter'ın kim olduğunu reveal'dan ÖNCE bulurdu (modun amacı çöker).
  // crypto.randomInt → tahmin edilemez, yalnız state'te (maskeli) saklanır.
  const n = names.length;
  const imposterIndex = randomInt(n);

  return {
    kind: 'imposter',
    playerNames: names,
    secretPlayerId: secret.id,
    secretPlayerName: secret.displayName,
    imposterIndex,
    clue,
    bannedNameTokens: secretNameTokens(secret),
    scene: 'ROLE_REVEAL',
    round: 0,
    activeIndex: 0,
    words: Array.from({ length: IMPOSTER_ROUNDS }, () => new Array<ImposterWord>(n).fill(null)),
    roleAcks: new Array<boolean>(n).fill(false),
    votes: new Array<number | null>(n).fill(null),
    voted: new Array<boolean>(n).fill(false),
    winner: null,
    tally: new Array<number>(n).fill(0),
    eliminatedIndex: -1,
  };
}

/** Rol açılışını onayla → herkes onaylayınca WORDS'e geç. İdempotent. */
export function acknowledgeRole(state: ImposterMatchState, side: number): ImposterMatchState {
  if (state.scene !== 'ROLE_REVEAL') return state;
  const roleAcks = state.roleAcks.slice();
  roleAcks[side] = true;
  const next = { ...state, roleAcks };
  if (roleAcks.every(Boolean)) {
    return { ...next, scene: 'WORDS', round: 0, activeIndex: 0 };
  }
  return next;
}

/** Tur sonucu — client'a dönülür (kendi kelimemin kabul edildiği onayı). */
export interface ImposterWordOutcome {
  accepted: boolean;
  reason?: string;
}

/**
 * Aktif oyuncu kelimesini yazar (SIRA-TABANLI). Doğrulama SUNUCUDA (yasak kelime).
 * Kabul edilirse sıradaki oyuncuya geçer; tur biterse sonraki tur / VOTE.
 */
export async function applyImposterWord(
  state: ImposterMatchState,
  side: number,
  word: string,
): Promise<{ nextState: ImposterMatchState; outcome: ImposterWordOutcome }> {
  if (state.scene !== 'WORDS') {
    throw new Error(`Kelime yazılamaz: sahne WORDS değil (${state.scene}).`);
  }
  if (side !== state.activeIndex) {
    throw new Error('Sıra sende değil.');
  }
  // Yasak kelime doğrulama (gizli ad token'ları + kulüp token'ları).
  const clubTokens = await loadBannedClubTokens();
  const banned = new Set<string>([...state.bannedNameTokens, ...clubTokens]);
  const check = isValidWord(word, banned);
  if (!check.ok) {
    return { nextState: state, outcome: { accepted: false, reason: check.reason } };
  }

  const words = state.words.map((r) => r.slice());
  words[state.round]![side] = word.trim();
  let next: ImposterMatchState = { ...state, words };
  next = advanceWordTurn(next);
  return { nextState: next, outcome: { accepted: true } };
}

/** Sıradaki yazmamış oyuncuya geç; tur dolarsa sonraki tur / VOTE'a. */
function advanceWordTurn(state: ImposterMatchState): ImposterMatchState {
  const n = state.playerNames.length;
  // Bu turda sıradaki yazmamış oyuncu (activeIndex'ten sonra).
  for (let step = 1; step <= n; step++) {
    const idx = (state.activeIndex + step) % n;
    if (idx === 0 && state.activeIndex === n - 1) break; // tur sonuna geldik
    if (state.words[state.round]![idx] === null) {
      return { ...state, activeIndex: idx };
    }
  }
  // Tur doldu → sonraki tur veya VOTE.
  const nextRound = state.round + 1;
  if (nextRound >= IMPOSTER_ROUNDS) {
    return { ...state, scene: 'VOTE', activeIndex: 0 };
  }
  return { ...state, round: nextRound, activeIndex: 0 };
}

/** Bir oyuncu oy verir (VOTE sahnesi). target = oyVerilen index veya null (çekimser). */
export function applyImposterVote(
  state: ImposterMatchState,
  side: number,
  target: number | null,
): ImposterMatchState {
  if (state.scene !== 'VOTE') {
    throw new Error(`Oy verilemez: sahne VOTE değil (${state.scene}).`);
  }
  if (target !== null && (target < 0 || target >= state.playerNames.length)) {
    throw new Error('Geçersiz oy.');
  }
  if (target === side) {
    throw new Error('Kendine oy veremezsin.');
  }
  const votes = state.votes.slice();
  const voted = state.voted.slice();
  votes[side] = target; // null = çekimser
  voted[side] = true;
  const next: ImposterMatchState = { ...state, votes, voted };
  // Herkes oy aksiyonu gönderdiyse (çekimser dahil) → sonucu hesapla.
  if (voted.every(Boolean)) {
    return finalizeImposter(next);
  }
  return next;
}

/** Oylamayı bitir + sonucu hesapla (herkes oy verince VEYA süre dolunca). */
export function finalizeImposter(state: ImposterMatchState): ImposterMatchState {
  const n = state.playerNames.length;
  const votesMap: Record<number, number | null> = {};
  for (let i = 0; i < n; i++) votesMap[i] = state.votes[i] ?? null;
  const { winner, eliminatedIndex, tally } = resolveVotes(votesMap, state.imposterIndex, n);
  return { ...state, scene: 'RESULT', winner, eliminatedIndex, tally };
}

/**
 * Süre dolumu (sunucu-otoriteli):
 *  - ROLE_REVEAL → WORDS (herkes onaylamasa da süre dolunca başla)
 *  - WORDS → aktif oyuncu yazmadıysa "—" pas + sıradakine; tur dolarsa ilerle
 *  - VOTE → finalize (oy vermeyenler çekimser sayılır)
 */
export async function applyImposterTimeout(
  state: ImposterMatchState,
  deadlineMs: number | null,
  nowMs: number,
): Promise<{ state: ImposterMatchState; changed: boolean }> {
  if (deadlineMs === null || nowMs < deadlineMs) {
    return { state, changed: false };
  }
  if (state.scene === 'ROLE_REVEAL') {
    return { state: { ...state, scene: 'WORDS', round: 0, activeIndex: 0 }, changed: true };
  }
  if (state.scene === 'WORDS') {
    // Aktif oyuncu süreyi kaçırdı → pas ("—") yaz + ilerle.
    const words = state.words.map((r) => r.slice());
    if (words[state.round]![state.activeIndex] === null) {
      words[state.round]![state.activeIndex] = '—';
    }
    const next = advanceWordTurn({ ...state, words });
    return { state: next, changed: true };
  }
  if (state.scene === 'VOTE') {
    return { state: finalizeImposter(state), changed: true };
  }
  return { state, changed: false };
}

// ===========================================================================
// Maskeleme (route'ta uygulanır — rol gizliliği)
// ===========================================================================

/** Taraf-özel GÖRÜNÜM: bir oyuncunun (side) gördüğü güvenli state. */
export interface ImposterView {
  kind: 'imposter';
  playerNames: string[];
  /** Bu oyuncunun index'i. */
  yourIndex: number;
  /** Bu oyuncu imposter mı? (kendi rolünü bilir; başkasınınkini BİLMEZ) */
  youAreImposter: boolean;
  /** İmposter İSE ipucu; DEĞİLSE gizli futbolcu adı (asla ikisi birden değil). */
  clueWord: string | null;
  secretPlayerName: string | null;
  scene: ImposterMatchState['scene'];
  round: number;
  activeIndex: number;
  /** Yazılan kelimeler — herkese açık (sıra-tabanlı, anlık görünür). */
  words: ImposterWord[][];
  roleAcks: boolean[];
  /** Kendi oyum (başkalarınınki VOTE'ta gizli). */
  yourVote: number | null;
  /** Kaç kişi oy verdi (gizli kime — sadece sayaç; VOTE ilerleme göstergesi). */
  votedCount: number;
  /** RESULT'ta: tam açılım. */
  winner: ImposterWinner | null;
  imposterIndex: number | null;
  secretPlayerNameReveal: string | null;
  clueWordReveal: string | null;
  tally: number[] | null;
  eliminatedIndex: number | null;
  votesReveal: Array<number | null> | null;
}

/**
 * Ham state DÖNMEZ — her oyuncuya kendi güvenli görünümü. Rol gizliliği:
 *  - youAreImposter yalnız KENDİ rolün; imposterIndex RESULT'a kadar null.
 *  - imposter → clueWord dolu, secretPlayerName null; crew → tersi.
 *  - Oylar VOTE'ta gizli (yalnız votedCount + kendi oyun); RESULT'ta tam açılır.
 *
 * ⚠️ GÜVENLİK — `state.bannedNameTokens` BU VIEW'A ASLA EKLENMEMELİ. O token'lar
 * gizli futbolcunun adının köklerini (ör. ["lionel","messi"]) düz metin taşır;
 * view'a girerse imposter F12'den okuyup futbolcuyu çözer = modun amacı çöker.
 * Yasak-kelime doğrulaması ZATEN sunucuda (`applyImposterWord` → `isValidWord`),
 * client'a göndermeye GEREK YOK. "Client önizleme/uyarı" isteği gelirse bile token
 * client'a değil, doğrulama sunucu yanıtı (`wordOutcome.reason`) üzerinden gösterilmeli.
 */
export function viewImposterState(state: ImposterMatchState, side: number): ImposterView {
  const isResult = state.scene === 'RESULT';
  const youAreImposter = side === state.imposterIndex;

  return {
    kind: 'imposter',
    playerNames: state.playerNames,
    yourIndex: side,
    youAreImposter,
    clueWord: youAreImposter ? state.clue.word : null,
    secretPlayerName: youAreImposter ? null : state.secretPlayerName,
    scene: state.scene,
    round: state.round,
    activeIndex: state.activeIndex,
    words: state.words,
    roleAcks: state.roleAcks,
    yourVote: state.voted[side] ? (state.votes[side] ?? null) : null,
    votedCount: state.voted.filter(Boolean).length,
    // RESULT açılımı:
    winner: isResult ? state.winner : null,
    imposterIndex: isResult ? state.imposterIndex : null,
    secretPlayerNameReveal: isResult ? state.secretPlayerName : null,
    clueWordReveal: isResult ? state.clue.word : null,
    tally: isResult ? state.tally : null,
    eliminatedIndex: isResult ? state.eliminatedIndex : null,
    votesReveal: isResult ? state.votes : null,
  };
}

export { IMPOSTER_ROUNDS };
