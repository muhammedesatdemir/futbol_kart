/**
 * Sunucu-otoriteli "Kariyer Yolu" online motoru.
 *
 * `commonMatchEngine.ts`'in KARDEŞİ (eşzamanlı) AMA KADEMELİ: her tur 1 kariyer,
 * 4 ipucu kademesi. İki taraf her kademede eşzamanlı tahmin eder; doğru bilen
 * puanını alıp KİLİTLENİR, yanlış/boş bir sonraki kademeye düşer (ASİMETRİK
 * ilerleme — biri tier 1'de kilitliyken diğeri tier 3'te olabilir). Tur biter:
 * iki taraf da kilitli VEYA 4. kademe de bitti. 3 tur, en çok puan kazanır.
 *
 * Offline saf mantığı (`@/lib/careerMode`) AYNEN çağırır (tek kaynak).
 * STATE: `match.state` jsonb OPAK (`match.mode='kariyer'`) — şema/migration yok.
 *
 * 🔒 SPOILER KORUMASI: Doğru cevap (playerId/playerName) + açılmamış kademe
 * ipuçları client'a GİTMEZ. Client yalnız `clueForTier` görünümünü (kendi
 * kademesine kadar) + rakibin "tahmin etti mi / kilitlendi mi" sinyalini alır.
 * Doğru cevap yalnız ROUND_REVEAL/RESULT'ta açılır. Bkz PLAN.md §21.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Player } from '@futbol-kart/shared-types';
import { loadGameData } from '@/lib/data';
import {
  curateCareers,
  clueForTier,
  isCorrectGuess,
  pointsForTier,
  decideWinner,
  CAREER_ROUNDS,
  CAREER_TIERS,
  type CareerPuzzle,
  type CareerClue,
  type ClubInfo,
  type CareerSide,
  type CareerPools,
} from '@/lib/careerMode';

/** Bir tarafın bu turdaki ilerlemesi (asimetrik kademe). */
export interface SideProgress {
  /** Şu an bu tarafın bulunduğu kademe (0..CAREER_TIERS). */
  tier: number;
  /** Doğru bilip kilitlendi mi (artık oynamaz, rakibi bekler)? */
  locked: boolean;
  /** Kazandığı puan (kilitlendiğinde set; bilemezse 0). */
  points: number;
  /** Bu tarafın AKTİF kademede seçimini yaptı mı (kademe çözümü için). */
  submitted: boolean;
  /** Seçilen oyuncu id (REVEAL'a kadar rakibe maskeli). */
  guessedId: string | null;
  /** Doğru bildi mi (kilitlendiyse true; reveal'a kadar rakibe maskeli). */
  correct: boolean;
}

const FRESH_PROGRESS: SideProgress = {
  tier: 0,
  locked: false,
  points: 0,
  submitted: false,
  guessedId: null,
  correct: false,
};

/** Bir turun durumu (iki tarafın ilerlemesi). */
export interface RoundState {
  P1: SideProgress;
  P2: SideProgress;
}

/**
 * Online "Kariyer Yolu" maç durumu — `match.state` jsonb'ye yazılır (opak).
 * Kariyerlerin DOĞRU CEVABI burada tutulur ama route maskeler (clue üretip yollar).
 */
export interface CareerMatchState {
  kind: 'kariyer';
  /** Maçın 3 kariyeri (cevap+stop'lar — SUNUCU-İÇİ; client'a clue olarak gider). */
  careers: CareerPuzzle[];
  /** Şu anki tur (0..CAREER_ROUNDS). */
  round: number;
  /** Bu maçın seed'i (clue dağıtık-sıralaması için deterministik). */
  seed: string;
  /** Her turun iki tarafının ilerlemesi. rounds[round]. */
  rounds: RoundState[];
  /** Sunucu-otoriteli sahne. */
  scene: 'REVEAL_INTRO' | 'GUESS' | 'ROUND_REVEAL' | 'RESULT';
  p1Score: number;
  p2Score: number;
  winner: CareerSide | 'tie' | null;
  p1Name: string;
  p2Name: string;
}

/** Tur açılış (kariyer geliyor) ekranı süresi (sn). */
export const CAREER_INTRO_SECONDS = 4;
/** Online/bot kademe başına tahmin süresi (sn). */
export const CAREER_TIER_SECONDS = 30;
/** Tur sonucu (doğru cevap + puanlar) gösterim süresi (sn). */
export const CAREER_ROUND_REVEAL_SECONDS = 7;

export function careerSceneDeadlineSeconds(state: CareerMatchState): number | null {
  switch (state.scene) {
    case 'REVEAL_INTRO':
      return CAREER_INTRO_SECONDS;
    case 'GUESS':
      return CAREER_TIER_SECONDS;
    case 'ROUND_REVEAL':
      return CAREER_ROUND_REVEAL_SECONDS;
    default:
      return null;
  }
}

// Sunucu clubs yükleyici → ClubInfo map (ad + ülke + logo). loadGameData cache'li.
async function loadClubInfo(): Promise<Map<string, ClubInfo>> {
  const { clubs } = await loadGameData();
  return new Map(
    clubs.map((c) => [
      c.id,
      { id: c.id, name: c.name, countryCode: c.countryCode, crestUrl: c.crestUrl },
    ]),
  );
}

// Kürate edilmiş kariyer havuzu (careerPools.json) — kullanıcı ayıklaması.
let cachedPools: CareerPools | null = null;
async function loadCareerPools(): Promise<CareerPools | null> {
  if (cachedPools) return cachedPools;
  try {
    const path = join(process.cwd(), 'public', 'data', 'careerPools.json');
    const raw = JSON.parse(await readFile(path, 'utf8')) as CareerPools;
    cachedPools = raw;
    return cachedPools;
  } catch {
    return null; // dosya yoksa curateCareers fallback'e düşer
  }
}

/**
 * Online başlangıç state — 3 kariyer SEED'den DETERMİNİSTİK kürate edilir
 * (careerPools.json ağırlığıyla: 2 high + 1 low). İlk kariyerin açılışıyla başlar.
 */
export async function buildInitialCareerState(
  seed: string,
  p1Name: string,
  p2Name: string,
): Promise<CareerMatchState> {
  const { players } = await loadGameData();
  const clubsById = await loadClubInfo();
  const pools = await loadCareerPools();
  const careers = curateCareers(seed, players, clubsById, pools);

  return {
    kind: 'kariyer',
    careers,
    round: 0,
    seed,
    rounds: careers.map(() => ({ P1: { ...FRESH_PROGRESS }, P2: { ...FRESH_PROGRESS } })),
    scene: 'REVEAL_INTRO',
    p1Score: 0,
    p2Score: 0,
    winner: null,
    p1Name,
    p2Name,
  };
}

/** Açılış görüldü → GUESS'e geç. İdempotent. */
export function acknowledgeCareerIntro(state: CareerMatchState): CareerMatchState {
  if (state.scene !== 'REVEAL_INTRO') return state;
  return { ...state, scene: 'GUESS' };
}

/** Tur sonucu görüldü → sonraki tur / RESULT. İdempotent. */
export function acknowledgeCareerRoundReveal(state: CareerMatchState): CareerMatchState {
  if (state.scene !== 'ROUND_REVEAL') return state;
  return advanceRound(state);
}

function finalizeCareer(state: CareerMatchState): CareerMatchState {
  return { ...state, scene: 'RESULT', winner: decideWinner(state.p1Score, state.p2Score) };
}

function advanceRound(state: CareerMatchState): CareerMatchState {
  const next = state.round + 1;
  if (next >= state.careers.length) return finalizeCareer(state);
  return { ...state, round: next, scene: 'REVEAL_INTRO' };
}

/** Bu tur bitti mi? İki taraf da kilitli VEYA ikisi de son kademeyi geçti. */
function isRoundOver(r: RoundState): boolean {
  const done = (s: SideProgress) => s.locked || s.tier >= CAREER_TIERS;
  return done(r.P1) && done(r.P2);
}

/**
 * Aktif kademe ÇÖZÜLDÜ MÜ kontrol et + çöz. Çözüm koşulu: kilitli OLMAYAN her
 * tarafın bu kademede `submitted` olması (ya da kilitliyse zaten geçmiş).
 * Çözümde: doğru bilenleri kilitle (puan), bilemeyenleri tier++ ile sonraki
 * kademeye taşı (submitted sıfırlanır). Tur biterse ROUND_REVEAL'e geç.
 */
function resolveTierIfReady(state: CareerMatchState): CareerMatchState {
  const r = state.rounds[state.round]!;
  const sides: CareerSide[] = ['P1', 'P2'];
  // Kilitli olmayan ve henüz submit etmemiş taraf varsa → bekle.
  for (const side of sides) {
    const sp = r[side];
    if (!sp.locked && sp.tier < CAREER_TIERS && !sp.submitted) {
      return state; // henüz hazır değil
    }
  }
  // Her aktif taraf submit etti → çöz.
  let p1Score = state.p1Score;
  let p2Score = state.p2Score;
  const next: RoundState = { P1: { ...r.P1 }, P2: { ...r.P2 } };

  for (const side of sides) {
    const sp = next[side];
    if (sp.locked || sp.tier >= CAREER_TIERS) continue; // zaten bitmiş
    if (sp.correct) {
      // Doğru bildi → kilitle + puanı kademeden ver.
      sp.locked = true;
      sp.points = pointsForTier(sp.tier);
      sp.submitted = false;
      if (side === 'P1') p1Score += sp.points;
      else p2Score += sp.points;
    } else {
      // Yanlış/boş → sonraki kademeye düş.
      sp.tier += 1;
      sp.submitted = false;
      sp.guessedId = null;
    }
  }

  let nextState: CareerMatchState = { ...state, rounds: replaceRound(state, next), p1Score, p2Score };
  if (isRoundOver(next)) {
    nextState = { ...nextState, scene: 'ROUND_REVEAL' };
  }
  return nextState;
}

function replaceRound(state: CareerMatchState, r: RoundState): RoundState[] {
  return state.rounds.map((x, i) => (i === state.round ? r : x));
}

/** Bir seçim sonucu — client'a döner (kendi doğru/yanlışı; doğru cevap reveal'da). */
export interface CareerGuessOutcome {
  /** Bu kademede doğru bildin mi? */
  correct: boolean;
  /** Doğruysa kazanılan puan (kademe puanı). */
  points: number;
  /** Hangi kademede tahmin edildi. */
  tier: number;
}

/**
 * Bir tahmini SUNUCUDA değerlendir + uygula (EŞZAMANLI, kademeli).
 *  - Sahne GUESS olmalı.
 *  - Bu taraf kilitli OLMAMALI, son kademeyi geçmemiş olmalı, bu kademede
 *    henüz submit etmemiş olmalı.
 *  - Doğru cevap sunucuda kontrol edilir (client doğru id'yi bilmez).
 *  - İki aktif taraf da submit ettiyse kademe çözülür (resolveTierIfReady).
 */
export async function applyCareerGuess(
  state: CareerMatchState,
  side: CareerSide,
  playerId: string,
): Promise<{ nextState: CareerMatchState; outcome: CareerGuessOutcome }> {
  if (state.scene !== 'GUESS') {
    throw new Error(`Tahmin yapılamaz: sahne GUESS değil (${state.scene}).`);
  }
  const r = state.rounds[state.round]!;
  const sp = r[side];
  if (sp.locked) throw new Error('Zaten doğru bildin, bekliyorsun.');
  if (sp.tier >= CAREER_TIERS) throw new Error('Bu tur senin için bitti.');
  if (sp.submitted) throw new Error('Bu kademede zaten tahmin yaptın.');

  // Geçerli oyuncu mu? (güvenlik — players.json'da olmalı)
  const { players } = await loadGameData();
  if (!players.some((p: Player) => p.id === playerId)) {
    throw new Error(`Geçersiz oyuncu: ${playerId}.`);
  }

  const puzzle = state.careers[state.round]!;
  const correct = isCorrectGuess(puzzle, playerId);

  const nextSp: SideProgress = { ...sp, submitted: true, guessedId: playerId, correct };
  const nextR: RoundState = { ...r, [side]: nextSp } as RoundState;
  let nextState: CareerMatchState = { ...state, rounds: replaceRound(state, nextR) };
  nextState = resolveTierIfReady(nextState);

  return {
    nextState,
    outcome: { correct, points: correct ? pointsForTier(sp.tier) : 0, tier: sp.tier },
  };
}

/**
 * Süre dolumu (sunucu-otoriteli):
 *  - REVEAL_INTRO → GUESS
 *  - ROUND_REVEAL → sonraki tur / RESULT
 *  - GUESS → submit etmemiş aktif tarafları "boş pas" işaretle (correct:false) →
 *    resolveTierIfReady (bilemeyenler tier++ ya da tur biter).
 */
export async function applyCareerTimeout(
  state: CareerMatchState,
  deadlineMs: number | null,
  nowMs: number,
): Promise<{ state: CareerMatchState; changed: boolean }> {
  if (deadlineMs === null || nowMs < deadlineMs) {
    return { state, changed: false };
  }
  if (state.scene === 'REVEAL_INTRO') {
    return { state: { ...state, scene: 'GUESS' }, changed: true };
  }
  if (state.scene === 'ROUND_REVEAL') {
    return { state: advanceRound(state), changed: true };
  }
  if (state.scene === 'GUESS') {
    const r = state.rounds[state.round]!;
    const next: RoundState = { P1: { ...r.P1 }, P2: { ...r.P2 } };
    let changed = false;
    for (const side of ['P1', 'P2'] as CareerSide[]) {
      const sp = next[side];
      if (!sp.locked && sp.tier < CAREER_TIERS && !sp.submitted) {
        // Süre doldu, tahmin yok → boş pas (yanlış say).
        sp.submitted = true;
        sp.guessedId = null;
        sp.correct = false;
        changed = true;
      }
    }
    if (!changed) return { state, changed: false };
    const resolved = resolveTierIfReady({ ...state, rounds: replaceRound(state, next) });
    return { state: resolved, changed: true };
  }
  return { state, changed: false };
}

// ===========================================================================
// MASKELEME — client'a güvenli görünüm (doğru cevap + açılmamış kademe gizli)
// ===========================================================================

/**
 * Client'a gönderilecek tur görünümü — kendi kademe ipucu açık, rakibin seçimi
 * REVEAL'a kadar gizli. Doğru cevap yalnız RESULT/ROUND_REVEAL'de.
 */
export interface CareerView {
  kind: 'kariyer';
  round: number;
  scene: CareerMatchState['scene'];
  /** Bu turun benim için clue'su (kendi kadememe kadar açık). */
  myClue: CareerClue | null;
  /** Benim ilerlemem (tam). */
  myProgress: SideProgress | null;
  /** Rakibin SİNYALİ (sadece tier + locked + submitted; guessedId/correct gizli). */
  oppSignal: { tier: number; locked: boolean; submitted: boolean } | null;
  /** ROUND_REVEAL/RESULT'ta: doğru cevap + iki tarafın tam sonucu. */
  reveal: CareerReveal | null;
  /** Tüm turların özeti (RESULT için). */
  summaries: CareerRoundSummary[] | null;
  p1Score: number;
  p2Score: number;
  winner: CareerSide | 'tie' | null;
  p1Name: string;
  p2Name: string;
}

/** Tur sonucu reveal verisi (doğru cevap + kim kaçıncı kademede bildi). */
export interface CareerReveal {
  answerName: string;
  answerInitial: string;
  nationality: string | null;
  stops: CareerPuzzle['stops'];
  p1: { tier: number; correct: boolean; points: number };
  p2: { tier: number; correct: boolean; points: number };
}

/** Final için tur özeti. */
export interface CareerRoundSummary {
  answerName: string;
  p1: { tier: number; correct: boolean; points: number };
  p2: { tier: number; correct: boolean; points: number };
}

/**
 * Maç state'ini BİR TARAFIN perspektifinden güvenli görünüme çevir.
 * GUESS/REVEAL_INTRO: rakip sinyali maskeli, doğru cevap gizli, kendi clue açık.
 * ROUND_REVEAL: aktif turun cevabı açık. RESULT: tüm özet açık.
 */
export function viewCareerState(state: CareerMatchState, side: CareerSide): CareerView {
  const other: CareerSide = side === 'P1' ? 'P2' : 'P1';
  const r = state.rounds[state.round];
  const puzzle = state.careers[state.round];
  const myProg = r ? r[side] : null;
  const oppProg = r ? r[other] : null;

  const isReveal = state.scene === 'ROUND_REVEAL';
  const isResult = state.scene === 'RESULT';

  // Kendi clue'm: kendi kademe ilerlememe kadar açık (tier ya da locked'da kilitlenen tier).
  let myClue: CareerClue | null = null;
  if (puzzle && myProg && (state.scene === 'GUESS' || state.scene === 'REVEAL_INTRO')) {
    myClue = clueForTier(puzzle, myProg.tier, state.seed);
  }

  // Reveal (aktif tur cevabı) — yalnız ROUND_REVEAL.
  let reveal: CareerReveal | null = null;
  if (isReveal && puzzle && r) {
    reveal = {
      answerName: puzzle.playerName,
      answerInitial: puzzle.initial,
      nationality: puzzle.nationality,
      stops: puzzle.stops,
      p1: { tier: r.P1.tier, correct: r.P1.correct || r.P1.locked, points: r.P1.points },
      p2: { tier: r.P2.tier, correct: r.P2.correct || r.P2.locked, points: r.P2.points },
    };
  }

  // RESULT — tüm turların özeti.
  let summaries: CareerRoundSummary[] | null = null;
  if (isResult) {
    summaries = state.careers.map((pz, i) => {
      const rr = state.rounds[i]!;
      return {
        answerName: pz.playerName,
        p1: { tier: rr.P1.tier, correct: rr.P1.locked, points: rr.P1.points },
        p2: { tier: rr.P2.tier, correct: rr.P2.locked, points: rr.P2.points },
      };
    });
  }

  return {
    kind: 'kariyer',
    round: state.round,
    scene: state.scene,
    myClue,
    myProgress: myProg ? { ...myProg } : null,
    oppSignal: oppProg
      ? { tier: oppProg.tier, locked: oppProg.locked, submitted: oppProg.submitted }
      : null,
    reveal,
    summaries,
    p1Score: state.p1Score,
    p2Score: state.p2Score,
    winner: state.winner,
    p1Name: state.p1Name,
    p2Name: state.p2Name,
  };
}

export { CAREER_ROUNDS, CAREER_TIERS };
