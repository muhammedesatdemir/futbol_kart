/**
 * Sunucu-otoriteli "4'lü Kıyas" online motoru.
 *
 * `commonMatchEngine.ts`'in KARDEŞİ; aynı iskelet + EŞZAMANLI akış (Ortak Bul gibi):
 * her tur 4 oyuncu + 1 metrik gelir; İKİ taraf AYNI ANDA bir kart seçer; ikisi de
 * seçince (veya süre dolunca) ROUND_REVEAL'de 4 gerçek değer + doğru cevap +
 * puanlar birlikte açılır. 7 tur, en çok puan kazanır.
 *
 * Offline saf mantığı (`@/lib/quizMode`) AYNEN çağırır (tek kaynak), değiştirmez.
 * STATE: `match.state` jsonb OPAK (`match.mode='kiyas'` ile yorumlanır) — şema/migration yok.
 *
 * 🔒 SPOILER KORUMASI: tur değerleri + doğru cevap + rakibin SELECT'teki seçimi
 * REVEAL'a kadar MASKELENİR (route'ta `maskQuizState`). F12'den okunamaz.
 *
 * 2 JOKER (maçta 1×, aynı turda birlikte kullanılabilir = garanti doğru):
 *   - fifty (%50): 2 şık elenir → kalan = doğru + en yakın çeldirici (sunucuda
 *     `fiftyKeepIndexes` önceden hesaplı; client'a yalnız kalan index'ler döner).
 *   - double (x2): o turda 2 seçim hakkı (select 1-2 index taşır).
 *
 * Bkz PLAN.md §14.3, §22.
 */
import type { Player } from '@futbol-kart/shared-types';
import { loadGameData } from '@/lib/data';
import {
  buildQuizRounds,
  evaluateQuizPick,
  decideQuizWinner,
  metricByKey,
  QUIZ_ROUNDS,
  type QuizRound,
  type QuizSide,
  type QuizJoker,
} from '@/lib/quizMode';

/** Bir tarafın bir turdaki seçimi (REVEAL'a kadar rakibe maskelenir). */
export interface QuizSelection {
  /** Seçilen choiceIds index'leri (1-2; x2 → 2). null/boş = henüz seçmedi. */
  indexes: number[] | null;
  /** Doğru mu? (sunucu hesabı) */
  correct: boolean;
  /** Kazanılan puan (doğru → 1, değilse 0). */
  points: number;
}

const EMPTY_SELECTION: QuizSelection = { indexes: null, correct: false, points: 0 };

/** Online "4'lü Kıyas" maç durumu — `match.state` jsonb (opak). */
export interface QuizMatchState {
  kind: 'kiyas';
  /** Maçın turları (değerler + doğru cevap DAHİL — sunucu-içi; route maskeler). */
  rounds: QuizRound[];
  /** Şu anki tur (0..QUIZ_ROUNDS). */
  round: number;
  /** Her turun iki tarafının seçimi. selections[round] = {P1, P2}. */
  selections: Array<{ P1: QuizSelection; P2: QuizSelection }>;
  /** Sunucu-otoriteli sahne. */
  scene: 'REVEAL_METRIC' | 'SELECT' | 'ROUND_REVEAL' | 'RESULT';
  /** Toplam skorlar (her ROUND_REVEAL'de güncellenir). */
  p1Score: number;
  p2Score: number;
  winner: QuizSide | 'tie' | null;
  /** Jokerler kullanıldı mı (taraf × joker; her biri 1×/maç). */
  jokers: { P1: { fifty: boolean; double: boolean }; P2: { fifty: boolean; double: boolean } };
  p1Name: string;
  p2Name: string;
}

/** Metrik açılış ekranı (sahne başlığı: "Hangisinin TOPLAM GOLÜ fazla?") süresi (sn). */
export const QUIZ_METRIC_REVEAL_SECONDS = 5;
/** Eşzamanlı seçim süresi (sn) — online + bota karşı ortak. */
export const QUIZ_SELECT_SECONDS = 30;
/** Tur sonucu (4 değer + puanlar) gösterim süresi (sn) — sonra otomatik ilerler. */
export const QUIZ_ROUND_REVEAL_SECONDS = 7;

export function quizSceneDeadlineSeconds(state: QuizMatchState): number | null {
  switch (state.scene) {
    case 'REVEAL_METRIC':
      return QUIZ_METRIC_REVEAL_SECONDS;
    case 'SELECT':
      return QUIZ_SELECT_SECONDS;
    case 'ROUND_REVEAL':
      return QUIZ_ROUND_REVEAL_SECONDS;
    default:
      return null;
  }
}

/**
 * Online başlangıç state — turlar SEED'den DETERMİNİSTİK kurulur (sunucu, iki
 * tarafa aynı → adalet). İlk turun metrik açılışıyla başlar.
 */
export async function buildInitialQuizState(
  seed: string,
  p1Name: string,
  p2Name: string,
): Promise<QuizMatchState> {
  const { players } = await loadGameData();
  const rounds = buildQuizRounds(seed, players as Player[]);

  return {
    kind: 'kiyas',
    rounds,
    round: 0,
    selections: rounds.map(() => ({ P1: { ...EMPTY_SELECTION }, P2: { ...EMPTY_SELECTION } })),
    scene: 'REVEAL_METRIC',
    p1Score: 0,
    p2Score: 0,
    winner: null,
    jokers: {
      P1: { fifty: false, double: false },
      P2: { fifty: false, double: false },
    },
    p1Name,
    p2Name,
  };
}

/** Metrik açılış görüldü → SELECT'e geç. İdempotent. */
export function acknowledgeQuizReveal(state: QuizMatchState): QuizMatchState {
  if (state.scene !== 'REVEAL_METRIC') return state;
  return { ...state, scene: 'SELECT' };
}

/** Tur sonucu görüldü → sonraki tur (REVEAL_METRIC) veya RESULT. İdempotent. */
export function acknowledgeQuizRoundReveal(state: QuizMatchState): QuizMatchState {
  if (state.scene !== 'ROUND_REVEAL') return state;
  return advanceRound(state);
}

function finalizeQuiz(state: QuizMatchState): QuizMatchState {
  return {
    ...state,
    scene: 'RESULT',
    winner: decideQuizWinner(state.p1Score, state.p2Score),
  };
}

/** ROUND_REVEAL'den sonraki adım: bir sonraki tur açılışı veya maç sonu. */
function advanceRound(state: QuizMatchState): QuizMatchState {
  const nextRound = state.round + 1;
  if (nextRound >= state.rounds.length) {
    return finalizeQuiz(state);
  }
  return { ...state, round: nextRound, scene: 'REVEAL_METRIC' };
}

/** Tur sonucu — client'a dönülür (kendi seçiminin doğru/yanlışı; değerler reveal'da). */
export interface QuizSelectOutcome {
  correct: boolean;
  /** Seçilen index'ler (kendi onayım için). */
  indexes: number[];
}

/**
 * Bir seçimi SUNUCUDA değerlendir + uygula (EŞZAMANLI — sıra yok).
 *  - Sahne SELECT olmalı.
 *  - Bu taraf bu turda HENÜZ seçmemiş olmalı (tek seçim/tur).
 *  - 1 index normal; 2 index ANCAK x2 jokeri o turda kullanılmışsa geçerli.
 *  - Index'ler geçerli (0..3, farklı) olmalı.
 *  - İki taraf da seçtiyse → ROUND_REVEAL'e geç + skorları işle.
 */
export async function applyQuizSelect(
  state: QuizMatchState,
  side: QuizSide,
  indexes: number[],
): Promise<{ nextState: QuizMatchState; outcome: QuizSelectOutcome }> {
  if (state.scene !== 'SELECT') {
    throw new Error(`Seçim yapılamaz: sahne SELECT değil (${state.scene}).`);
  }
  const sel = state.selections[state.round]!;
  if (sel[side].indexes !== null) {
    throw new Error('Bu turda zaten seçim yaptın.');
  }
  const round = state.rounds[state.round]!;
  // Index doğrulama: 1-2 farklı, sınır içinde.
  const clean = [...new Set(indexes)].filter(
    (i) => Number.isInteger(i) && i >= 0 && i < round.choiceIds.length,
  );
  if (clean.length === 0) throw new Error('Geçersiz seçim.');
  const doubleUsed = state.jokers[side].double;
  const maxPicks = doubleUsed ? 2 : 1;
  if (clean.length > maxPicks) {
    throw new Error(
      doubleUsed ? 'En fazla 2 kart seçebilirsin.' : 'Tek kart seç (x2 jokeri kullanılmadı).',
    );
  }

  const result = evaluateQuizPick(round, clean);
  const nextSel = {
    ...sel,
    [side]: { indexes: clean, correct: result.correct, points: result.points },
  } as { P1: QuizSelection; P2: QuizSelection };
  const selections = state.selections.map((s, i) => (i === state.round ? nextSel : s));

  let next: QuizMatchState = { ...state, selections };
  if (nextSel.P1.indexes !== null && nextSel.P2.indexes !== null) {
    next = resolveRound(next);
  }
  return { nextState: next, outcome: { correct: result.correct, indexes: clean } };
}

/** Bir turu çöz: skorları topla, ROUND_REVEAL'e geç. */
function resolveRound(state: QuizMatchState): QuizMatchState {
  const sel = state.selections[state.round]!;
  return {
    ...state,
    p1Score: state.p1Score + sel.P1.points,
    p2Score: state.p2Score + sel.P2.points,
    scene: 'ROUND_REVEAL',
  };
}

/** Joker sonucu — YALNIZCA isteyene döner (kişisel; %50 → kalan index'ler). */
export interface QuizJokerResult {
  joker: QuizJoker;
  /** %50 → eleme sonrası KALAN choiceIds index'leri (doğru + en yakın çeldirici). */
  keepIndexes?: number[];
}

/**
 * Joker kullan (online) — taraf başına joker türü 1×/maç. SELECT sahnesinde +
 * bu turda henüz seçim yapılmamışken (joker seçimden önce). Sonuç yalnız isteyene
 * döner (rakibe sızmaz); state'te yalnız `jokers[side][joker]` işaretlenir.
 *  - fifty: kalan 2 index döner (doğru + en yakın çeldirici).
 *  - double: bir şey döndürmez (client artık 2 kart seçebilir); state işaretlenir.
 */
export function applyQuizJoker(
  state: QuizMatchState,
  side: QuizSide,
  joker: QuizJoker,
): { nextState: QuizMatchState; result: QuizJokerResult } {
  if (state.scene !== 'SELECT') {
    throw new Error(`Joker kullanılamaz: sahne SELECT değil (${state.scene}).`);
  }
  if (state.jokers[side][joker]) {
    throw new Error('Bu jokeri bu maçta zaten kullandın.');
  }
  const sel = state.selections[state.round]!;
  if (sel[side].indexes !== null) {
    throw new Error('Seçimini yaptıktan sonra joker kullanamazsın.');
  }
  const round = state.rounds[state.round]!;
  const nextState: QuizMatchState = {
    ...state,
    jokers: {
      ...state.jokers,
      [side]: { ...state.jokers[side], [joker]: true },
    },
  };
  if (joker === 'fifty') {
    return {
      nextState,
      result: { joker, keepIndexes: [...round.fiftyKeepIndexes] },
    };
  }
  return { nextState, result: { joker } };
}

/**
 * Süre dolumu (sunucu-otoriteli):
 *  - REVEAL_METRIC → SELECT
 *  - SELECT → henüz seçmeyen tarafa boş/yanlış PAS; iki taraf bittiyse REVEAL
 *  - ROUND_REVEAL → sonraki tur / RESULT
 */
export async function applyQuizTimeout(
  state: QuizMatchState,
  deadlineMs: number | null,
  nowMs: number,
): Promise<{ state: QuizMatchState; changed: boolean }> {
  if (deadlineMs === null || nowMs < deadlineMs) {
    return { state, changed: false };
  }
  if (state.scene === 'REVEAL_METRIC') {
    return { state: { ...state, scene: 'SELECT' }, changed: true };
  }
  if (state.scene === 'ROUND_REVEAL') {
    return { state: advanceRound(state), changed: true };
  }
  if (state.scene === 'SELECT') {
    const sel = state.selections[state.round]!;
    // Henüz seçmeyen tarafa "pas" (indexes [-1] sentinel → tekrar seçemez, points 0).
    const pass: QuizSelection = { indexes: [-1], correct: false, points: 0 };
    const passed = {
      P1: sel.P1.indexes !== null ? sel.P1 : pass,
      P2: sel.P2.indexes !== null ? sel.P2 : pass,
    };
    const selections = state.selections.map((s, i) => (i === state.round ? passed : s));
    const next = resolveRound({ ...state, selections });
    return { state: next, changed: true };
  }
  return { state, changed: false };
}

// ===========================================================================
// Maskeleme (route'ta uygulanır — spoiler koruması)
// ===========================================================================

/** Skorlar/değerler bu sahnede açık mı? (ROUND_REVEAL ve RESULT → açık) */
function revealOpen(state: QuizMatchState): boolean {
  return state.scene === 'ROUND_REVEAL' || state.scene === 'RESULT';
}

/**
 * SELECT/REVEAL_METRIC sırasında MASKELE (spoiler koruması):
 *  - `rounds[].values` + `correctIndex` + `fiftyKeepIndexes` HER ZAMAN boşaltılır
 *    (client değerleri/doğru cevabı asla görmez). ROUND_REVEAL/RESULT'ta açık.
 *  - Rakibin aktif-tur seçimi gizli (yalnız "seçti mi" sinyali → indexes ['__hidden']
 *    yerine boş-değil bir sentinel: -2 dizisi → "hazır" ama içerik yok).
 *  - Kendi puanım SELECT'te gizli (correct açık → "✓ doğru kart"; puan reveal'da).
 *  - Skorlar SELECT/REVEAL'da gizli.
 */
export function maskQuizState(state: QuizMatchState, side: QuizSide): QuizMatchState {
  const other: QuizSide = side === 'P1' ? 'P2' : 'P1';
  const open = revealOpen(state);

  // Turları maskele: açık değilse değer/doğru cevap çıkar.
  const rounds = state.rounds.map((r, i) => {
    const roundOpen = i < state.round || open;
    if (roundOpen) return r;
    return {
      ...r,
      values: [],
      correctIndex: -1,
      fiftyKeepIndexes: [-1, -1] as [number, number],
    };
  });

  return {
    ...state,
    rounds,
    p1Score: open ? state.p1Score : 0,
    p2Score: open ? state.p2Score : 0,
    selections: state.selections.map((s, i) => maskSelectionRow(s, i, state, side, other)),
  };
}

function maskSelectionRow(
  s: { P1: QuizSelection; P2: QuizSelection },
  i: number,
  state: QuizMatchState,
  side: QuizSide,
  other: QuizSide,
): { P1: QuizSelection; P2: QuizSelection } {
  const open = i < state.round || revealOpen(state);
  if (open) return s;
  const out = { P1: { ...s.P1 }, P2: { ...s.P2 } } as { P1: QuizSelection; P2: QuizSelection };
  // Rakip: yalnız "seçti mi" sinyali ([-2] = hazır ama içerik gizli).
  out[other] = s[other].indexes !== null
    ? { indexes: [-2], correct: false, points: 0 }
    : { indexes: null, correct: false, points: 0 };
  // Kendi seçimimde puanı gizle (index + correct açık → "✓ doğru kart").
  out[side] = { ...s[side], points: 0 };
  return out;
}

/**
 * Bir turun ekran görünümü (metrik etiketi + birim çözülür). Maskeli state'ten
 * üretilir → values/correctIndex sahnede ROUND_REVEAL'da dolu, SELECT'te boş.
 */
export function quizMetricInfo(metricKey: string): { label: string; unit: string } {
  const f = metricByKey(metricKey);
  return { label: f?.shortLabel ?? metricKey, unit: f?.unit ?? '' };
}

export { QUIZ_ROUNDS };
