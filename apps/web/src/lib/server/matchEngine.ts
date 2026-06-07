/**
 * Sunucu-otoriteli maç motoru (online mod çekirdeği).
 *
 * Online'da kuralları SUNUCU işletir. Client yalnızca "niyet" gönderir
 * (örn. "şu kartı oynadım"); doğru cevabı / kazananı sunucu hesaplar ve
 * client'a yalnızca SONUCU döner. Doğru cevap havuzu hiçbir zaman client'a
 * sızmaz → F12'den kopya çekilemez (bkz ONLINE-YOL-HARITASI.md, hile modeli).
 *
 * Soru seçimi deterministik: FlowContext'in tur-akışı durumu (PRNG +
 * usedQuestionIds + params) `match.flowState`'e kaydedilir. Sunucu durduğu
 * için her istekte seed'den taze FlowContext kurar ve flowState'i geri yükler
 * (restoreFlowState) → kaldığı yerden devam, replay'e gerek yok.
 *
 * Bu modül auth/HTTP'den BAĞIMSIZDIR — saf girdi/çıktı, test edilebilir.
 * `game-engine` paketindeki AYNI reducer/flow'u kullanır (web ile tek kaynak).
 */
import {
  reduceSession,
  resolveCards,
  resolvedTitle,
  createFlowContext,
  pickQuestion,
  serializeFlowState,
  restoreFlowState,
  revealHand,
  canUseMultiplier,
  transferableCards,
  pickBonus,
  autoAssignBonus,
  completeBonus,
  CARD_PLAY_SECONDS,
  handPickSeconds,
  type SessionState,
  type FlowContext,
  type FlowState,
  type RevealedHandValue,
} from '@futbol-kart/game-engine';
import { templateById } from '@futbol-kart/question-templates';
import { loadGameData } from '@/lib/data';

/**
 * Mevcut sorunun PARAMETRELERLE DOLU başlığını üretir ({targetApps} → 500 gibi).
 *
 * Online'da soruyu sunucu seçtiği için parametreler sunucunun flowState'inde
 * üretilir; client'ın kendi flow'u bunları bilmez → client `resolvedTitle`
 * çağırırsa {targetApps} ham kalır. Bu yüzden dolu başlığı SUNUCU hesaplayıp
 * client'a gönderir. Soru yoksa null.
 */
export async function computeQuestionTitle(
  state: SessionState,
  flowState: FlowState | null,
): Promise<string | null> {
  if (!state.currentQuestionId) return null;
  const template = templateById(state.currentQuestionId);
  if (!template) return null;
  const flow = await loadFlow(state.seed, flowState);
  return resolvedTitle(flow, template) || template.id;
}

/**
 * Bir sahnenin SÜRE LİMİTİ (saniye). Sunucu-otoriteli geri sayım bu süreyle
 * başlar; süre dolunca sunucu otomatik işlem yapar (rastgele kart). Offline'la
 * aynı değerler (gameConstants). Süresiz sahneler için null.
 */
/** Online bonus (3 zorunlu kategori) atama süresi (sn). Offline 50; online 30. */
export const ONLINE_BONUS_SECONDS = 30;

export function sceneDeadlineSeconds(state: SessionState): number | null {
  switch (state.scene) {
    case 'CARD_PICK_P1':
    case 'CARD_PICK_P2':
      return handPickSeconds(state.handSize); // el seçimi (8 kart → 104sn)
    case 'BONUS_ASSIGN':
      return ONLINE_BONUS_SECONDS; // bonus atama (30sn)
    case 'ROUND_PLAY':
      return CARD_PLAY_SECONDS; // kart oynama (34sn)
    default:
      return null; // reveal/result/intro/final — süresiz (kısa, otomatik akar)
  }
}

/**
 * Maçın seed'iyle taze FlowContext kurar; kaydedilmiş flowState varsa geri
 * yükler (PRNG + seçim geçmişi kaldığı yerden devam). Veri cache'li.
 */
async function loadFlow(
  seed: string,
  flowState: FlowState | null,
): Promise<FlowContext> {
  const { players, clubsLite } = await loadGameData();
  const flow = createFlowContext(seed, players, clubsLite);
  if (flowState) restoreFlowState(flow, flowState);
  return flow;
}

/** Bir turu sunucuda çözmenin sonucu — client'a dönülebilecek GÜVENLİ veri. */
export interface ResolvedRound {
  /** Güncellenmiş, kaynak-doğru maç durumu (DB'ye yazılacak). */
  nextState: SessionState;
  /** Güncellenmiş flow durumu (DB'ye yazılacak). */
  flowState: FlowState;
  /** Client'a gösterilecek reveal verisi (yalnızca bu turun sonucu). */
  reveal: {
    questionTitle: string;
    p1Value: number | boolean | null;
    p2Value: number | boolean | null;
    winner: 'P1' | 'P2' | 'tie';
    tiebreakerUsed?: string;
    multiplier?: { side: 'P1' | 'P2'; dir: 'x2' | 'half' };
  };
}

/**
 * Bir tarafın el seçimini (HAND_SUBMITTED) SUNUCUDA doğrular ve uygular.
 * Online'da el seçimi eşzamanlı; reducer her eli bağımsız set eder (sahne
 * değiştirmez). İki el de geldiğinde çağıran `maybeStartRound`'u kullanır.
 */
export function applyHandSubmit(
  state: SessionState,
  side: 'P1' | 'P2',
  cards: string[],
): SessionState {
  // El seçimi yalnızca kart-seçim sahnelerinde geçerli (CARD_PICK_P1/P2).
  if (state.scene !== 'CARD_PICK_P1' && state.scene !== 'CARD_PICK_P2') {
    throw new Error(`El seçilemez: sahne kart-seçim değil (${state.scene}).`);
  }
  const existing = side === 'P1' ? state.p1Hand : state.p2Hand;
  if (existing.length > 0) {
    throw new Error(`${side} elini zaten seçti.`);
  }
  if (cards.length !== state.handSize) {
    throw new Error(
      `Geçersiz el: ${state.handSize} kart bekleniyor, ${cards.length} geldi.`,
    );
  }
  return reduceSession(state, { type: 'HAND_SUBMITTED', side, cards });
}

/**
 * Bonus aşamasında bir kartı bir slota atar (BONUS_CARD_ASSIGNED). Online'da
 * her oyuncu kendi 3 slotunu doldurur. Yalnızca BONUS_ASSIGN sahnesinde + henüz
 * onaylamamış tarafça geçerli.
 */
export function applyBonusAssign(
  state: SessionState,
  side: 'P1' | 'P2',
  slot: number,
  cardId: string | null,
): SessionState {
  if (state.scene !== 'BONUS_ASSIGN') {
    throw new Error('Bonus ataması yalnızca bonus aşamasında yapılır.');
  }
  const confirmed = side === 'P1' ? state.p1BonusConfirmed : state.p2BonusConfirmed;
  if (confirmed) {
    throw new Error('Bonus atamanı zaten onayladın.');
  }
  if (slot < 0 || slot > 2) {
    throw new Error('Geçersiz bonus slotu.');
  }
  // cardId verildiyse oyuncunun elinde olmalı.
  if (cardId !== null) {
    const hand = side === 'P1' ? state.p1Hand : state.p2Hand;
    if (!hand.includes(cardId)) {
      throw new Error('Atanan kart elinde değil.');
    }
  }
  return reduceSession(state, {
    type: 'BONUS_CARD_ASSIGNED',
    side,
    slot,
    cardId,
  });
}

/**
 * Bonus atamasını onaylar (BONUS_CONFIRMED). Eksik slotlar varsa süre dolmadan
 * da onaylanabilir mi? Hayır — UI tam 3 atama yapmadan onay göndermez; yine de
 * sunucu eksikse fizibil tamamlar (completeBonus). İki taraf da onaylayınca
 * maybeStartRound tura geçer.
 */
export async function applyBonusConfirm(
  state: SessionState,
  side: 'P1' | 'P2',
  flowState: FlowState | null,
): Promise<{
  state: SessionState;
  flowState: FlowState | null;
  questionId: string | null;
}> {
  if (state.scene !== 'BONUS_ASSIGN') {
    // Zaten geçilmiş — idempotent.
    return { state, flowState, questionId: state.currentQuestionId };
  }
  const already = side === 'P1' ? state.p1BonusConfirmed : state.p2BonusConfirmed;
  if (already) {
    return maybeStartRound(state, flowState);
  }

  // Eksik atamaları fizibil tamamla (oyuncu 3'ten az atadıysa).
  let s = state;
  const assigned = side === 'P1' ? state.p1BonusCards : state.p2BonusCards;
  if (assigned.some((c) => c === null)) {
    const flow = await loadFlow(state.seed, flowState);
    const hand = side === 'P1' ? state.p1Hand : state.p2Hand;
    const completed = completeBonus(
      flow,
      state.bonusConditions.map((c) => c.id),
      hand,
      assigned,
    );
    // Tamamlanan atamaları slot slot uygula.
    for (let slot = 0; slot < 3; slot++) {
      if (completed[slot] !== assigned[slot]) {
        s = reduceSession(s, {
          type: 'BONUS_CARD_ASSIGNED',
          side,
          slot,
          cardId: completed[slot] ?? null,
        });
      }
    }
  }

  s = reduceSession(s, { type: 'BONUS_CONFIRMED', side });
  // İki taraf da onayladıysa tura geç.
  return maybeStartRound(s, flowState);
}

/**
 * İki el de seçildiyse turu başlatır: soruyu SUNUCUDA deterministik seçer
 * (flowState'ten yüklenen PRNG ile) ve ROUND_STARTED uygular → ROUND_PLAY.
 * Henüz iki el seçilmediyse state'i değiştirmeden döner (null question).
 *
 * Dönüşteki flowState DB'ye yazılmalı (soru seçimi PRNG'yi ilerletti).
 */
export async function maybeStartRound(
  state: SessionState,
  flowState: FlowState | null,
): Promise<{
  state: SessionState;
  flowState: FlowState | null;
  questionId: string | null;
}> {
  if (state.p1Hand.length === 0 || state.p2Hand.length === 0) {
    return { state, flowState, questionId: null };
  }
  if (state.scene === 'ROUND_PLAY' || state.currentQuestionId) {
    return { state, flowState, questionId: state.currentQuestionId };
  }

  // BONUS AŞAMASI (yalnızca ANA MAÇ ilk turu, henüz çözülmedi). İki el geldikten
  // sonra, sorular başlamadan ÖNCE: 3 zorunlu kategori belirlenir, her oyuncu
  // 3 kartını atar. Uzatma/sudden'da bonus yok.
  if (
    state.phase === 'main' &&
    state.roundIndex === 0 &&
    !state.bonusResolved
  ) {
    const flow = await loadFlow(state.seed, flowState);
    const conditions = pickBonus(flow, state.p1Hand, state.p2Hand);
    const next = reduceSession(state, {
      type: 'BONUS_CONDITIONS_SET',
      conditions,
    });
    // Fizibil 3 koşul yoksa reducer ROUND_INTRO'da bıraktı → soru seçimine devam.
    // 3 koşul varsa BONUS_ASSIGN'e geçti → bekle (oyuncular atayacak).
    if (next.scene === 'BONUS_ASSIGN') {
      return {
        state: next,
        flowState: serializeFlowState(flow),
        questionId: null,
      };
    }
    // Bonus atlandı (fizibil değil) — soru seçimine düş.
    return maybeStartRoundCore(next, serializeFlowState(flow));
  }

  // BONUS_ASSIGN'deyiz: iki taraf da onaylamadıysa bekle.
  if (state.scene === 'BONUS_ASSIGN') {
    if (!state.p1BonusConfirmed || !state.p2BonusConfirmed) {
      return { state, flowState, questionId: null };
    }
    // İki taraf da onayladı → ROUND_INTRO'ya geç, soru seç.
    const toIntro = { ...state, scene: 'ROUND_INTRO' as const };
    return maybeStartRoundCore(toIntro, flowState);
  }

  return maybeStartRoundCore(state, flowState);
}

/** Soru seçip ROUND_PLAY'e geçen çekirdek (bonus aşamasından sonra). */
async function maybeStartRoundCore(
  state: SessionState,
  flowState: FlowState | null,
): Promise<{
  state: SessionState;
  flowState: FlowState | null;
  questionId: string | null;
}> {
  const flow = await loadFlow(state.seed, flowState);
  const q = pickQuestion(flow, state.p1Hand, state.p2Hand);
  if (!q) {
    throw new Error('Uygun soru bulunamadı.');
  }
  const next = reduceSession(state, { type: 'ROUND_STARTED', questionId: q.id });
  return {
    state: next,
    flowState: serializeFlowState(flow),
    questionId: q.id,
  };
}

/**
 * Çarpan jokerini (×2/÷2) SUNUCUDA aktive eder. Kart oynamadan ÖNCE çağrılır;
 * pendingMultiplier'ı set eder, çözümde uygulanır (resolveRoundOnServer zaten
 * pendingMultiplier'ı geçirir). Tek kullanım/taraf; reducer idempotent korur.
 */
export function applyMultiplierJoker(
  state: SessionState,
  side: 'P1' | 'P2',
): SessionState {
  if (state.scene !== 'ROUND_PLAY') {
    throw new Error(`Çarpan kullanılamaz: sahne ROUND_PLAY değil (${state.scene}).`);
  }
  const myCard = side === 'P1' ? state.currentP1Card : state.currentP2Card;
  if (myCard) {
    throw new Error('Çarpan kart oynamadan önce kullanılmalı.');
  }
  const used =
    side === 'P1' ? state.p1Jokers.multiplierUsed : state.p2Jokers.multiplierUsed;
  if (used) {
    throw new Error('Çarpan jokerini bu maçta zaten kullandın.');
  }
  // Soru çarpana uygun mu? (bool/proximity/yıl gibi sorularda anlamsız)
  const template = state.currentQuestionId
    ? templateById(state.currentQuestionId)
    : null;
  if (!canUseMultiplier(template ?? null)) {
    throw new Error('Çarpan bu soruda kullanılamaz.');
  }
  return reduceSession(state, { type: 'JOKER_MULTIPLIER', side });
}

/**
 * "İstatistiği Gör" jokerini SUNUCUDA uygular ve YALNIZCA bu tarafın kendi
 * elinin değerlerini hesaplayıp döner. Rakibin değerleri ASLA dönmez (hile
 * koruması). State'te joker "kullanıldı" işaretlenir (tek kullanım/taraf).
 *
 * Dönüş: güncellenmiş state + bu tarafın eli için { cardId, value } listesi.
 */
export async function applyRevealJoker(
  state: SessionState,
  side: 'P1' | 'P2',
  flowState: FlowState | null,
): Promise<{ nextState: SessionState; values: RevealedHandValue[] }> {
  if (state.scene !== 'ROUND_PLAY') {
    throw new Error(`İstatistik görülemez: sahne ROUND_PLAY değil (${state.scene}).`);
  }
  const used =
    side === 'P1' ? state.p1Jokers.revealUsed : state.p2Jokers.revealUsed;
  if (used) {
    throw new Error('İstatistik jokerini bu maçta zaten kullandın.');
  }
  if (!state.currentQuestionId) {
    throw new Error('Aktif soru yok.');
  }
  const template = templateById(state.currentQuestionId);
  if (!template) {
    throw new Error('Soru bulunamadı.');
  }

  const flow = await loadFlow(state.seed, flowState);
  const myHand = side === 'P1' ? state.p1Hand : state.p2Hand;
  const values = revealHand(flow, template, myHand);

  const nextState = reduceSession(state, { type: 'JOKER_REVEAL', side });
  return { nextState, values };
}

/** Transfer (takas) sonucu — her iki oyuncuya gösterilecek tabela verisi. */
export interface TransferResult {
  nextState: SessionState;
  /** Takası yapan taraf. */
  side: 'P1' | 'P2';
  /** Bu tarafın verdiği kart (rakibe gitti). */
  give: string;
  /** Bu tarafın aldığı kart (rakipten geldi). */
  take: string;
}

/**
 * Transfer (takas) jokerini SUNUCUDA doğrular ve TEK ATIMLIK uygular.
 * Online'da ara sahne yok: client give+take'i birlikte gönderir.
 *
 * Kurallar (bkz ONLINE-YOL-HARITASI.md):
 *  - Kart oynamadan önce (ROUND_PLAY, kendi kartı oynanmamış).
 *  - Joker tek kullanım/taraf.
 *  - Fazın SON turunda kapalı.
 *  - give kendi elinde + transfer-edilebilir; take rakipte + transfer-edilebilir.
 *  - İLK GELEN KAZANIR: bu turda zaten transfer olduysa (transferThisRound)
 *    ikinci giriş reddedilir.
 */
export function applyTransferJoker(
  state: SessionState,
  side: 'P1' | 'P2',
  give: string,
  take: string,
): TransferResult {
  if (state.scene !== 'ROUND_PLAY') {
    throw new Error(`Transfer yapılamaz: sahne ROUND_PLAY değil (${state.scene}).`);
  }
  const myCard = side === 'P1' ? state.currentP1Card : state.currentP2Card;
  if (myCard) {
    throw new Error('Transfer kart oynamadan önce yapılmalı.');
  }
  const used =
    side === 'P1' ? state.p1Jokers.transferUsed : state.p2Jokers.transferUsed;
  if (used) {
    throw new Error('Transfer jokerini bu maçta zaten kullandın.');
  }
  // İlk gelen kazanır: bu turda zaten bir transfer yapıldıysa reddet.
  if (state.transferThisRound) {
    throw new Error('Bu turda bir transfer zaten yapıldı.');
  }
  // Fazın son turunda transfer kapalı.
  if (state.roundIndex >= state.totalRounds - 1) {
    throw new Error('Fazın son turunda transfer yapılamaz.');
  }

  const ownHand = side === 'P1' ? state.p1Hand : state.p2Hand;
  const ownBonus = side === 'P1' ? state.p1BonusCards : state.p2BonusCards;
  const oppHand = side === 'P1' ? state.p2Hand : state.p1Hand;
  const oppBonus = side === 'P1' ? state.p2BonusCards : state.p1BonusCards;
  const ownPool = transferableCards(ownHand, ownBonus, state.transferLockedIds);
  const oppPool = transferableCards(oppHand, oppBonus, state.transferLockedIds);

  if (!ownPool.includes(give)) {
    throw new Error('Verilecek kart kendi elinde / transfer-edilebilir değil.');
  }
  if (!oppPool.includes(take)) {
    throw new Error('Alınacak kart rakipte / transfer-edilebilir değil.');
  }
  // DUPLICATE-ID KORUMASI (online'a özgü): offline'da iki el daima ayrıktır ama
  // online'da çapraz-dışlama yoktur → iki oyuncunun elinde AYNI kart id'si
  // olabilir. `take` zaten kendi elimizdeyse, TRANSFER_EXECUTE'un el'e concat'i
  // INTRA-HAND DUPLICATE yaratır → el bir kart "küçülür" gibi görünür (7 kart) +
  // React'te çift `key={id}` → render artefaktı (kayıp kart). Bunu engelle.
  if (ownHand.includes(take) || ownBonus.includes(take)) {
    throw new Error('Bu kart zaten elinde — transfer ile alınamaz.');
  }

  // Önce jokeri "açıldı" işaretle (hak yanar — kaos kuralı), sonra swap uygula.
  let next = reduceSession(state, { type: 'JOKER_TRANSFER_OPEN', side });
  next = reduceSession(next, { type: 'TRANSFER_EXECUTE', side, give, take });

  return { nextState: next, side, give, take };
}

/**
 * Bir tarafın kart oynama hamlesini SUNUCUDA doğrular ve uygular.
 * Geçersiz hamle (sırası değil, kart elinde değil, vb.) Error fırlatır.
 */
export function applyCardPlay(
  state: SessionState,
  side: 'P1' | 'P2',
  cardId: string,
): SessionState {
  if (state.scene !== 'ROUND_PLAY') {
    throw new Error(`Kart oynanamaz: sahne ROUND_PLAY değil (${state.scene}).`);
  }
  const hand = side === 'P1' ? state.p1Hand : state.p2Hand;
  if (!hand.includes(cardId)) {
    throw new Error(`Geçersiz hamle: ${cardId} kartı ${side} elinde değil.`);
  }
  const already = side === 'P1' ? state.currentP1Card : state.currentP2Card;
  if (already) {
    throw new Error(`${side} bu turda zaten kart oynadı.`);
  }
  return reduceSession(state, { type: 'CARD_PLAYED', side, cardId });
}

/**
 * Süre dolumunu uygular (sunucu-otoriteli). `nowMs` >= deadline ise süre
 * dolmuştur: eksik aksiyonları OTOMATİK tamamlar (offline'daki gibi rastgele).
 *
 *  - CARD_PICK: elini seçmemiş taraf(lar) için rastgele el seç → tur başlar.
 *  - ROUND_PLAY: kart oynamamış taraf(lar) için rastgele kart oyna → tur çözülür.
 *
 * Auto-fill için tüm oyuncu havuzu gerekir (el seçimi). `nowMs` ve deadline ms.
 * Değişiklik olduysa changed=true döner (DB'ye yazılmalı + Ably publish).
 *
 * NOT: rastgelelik PRNG'den BAĞIMSIZ (deadline'a bağlı basit index) — soru
 * seçimi flowState PRNG'sini bozmamalı.
 */
export async function applyTimeout(
  state: SessionState,
  flowState: FlowState | null,
  deadlineMs: number | null,
  nowMs: number,
): Promise<{
  state: SessionState;
  flowState: FlowState | null;
  changed: boolean;
}> {
  if (deadlineMs === null || nowMs < deadlineMs) {
    return { state, flowState, changed: false };
  }

  // Deadline'a bağlı sözde-rastgele seçici (PRNG'yi tüketmez).
  let pickSeed = Math.floor(deadlineMs / 1000);
  const pick = <T>(arr: T[]): T => {
    pickSeed = (pickSeed * 1103515245 + 12345) & 0x7fffffff;
    return arr[pickSeed % arr.length]!;
  };

  if (state.scene === 'CARD_PICK_P1' || state.scene === 'CARD_PICK_P2') {
    const { players } = await loadGameData();
    const allIds = players.map((p) => p.id);
    let s = state;
    for (const side of ['P1', 'P2'] as const) {
      const hand = side === 'P1' ? s.p1Hand : s.p2Hand;
      if (hand.length === 0) {
        // Rastgele benzersiz handSize kart seç.
        const chosen = new Set<string>();
        while (chosen.size < s.handSize) chosen.add(pick(allIds));
        s = reduceSession(s, {
          type: 'HAND_SUBMITTED',
          side,
          cards: [...chosen],
        });
      }
    }
    const started = await maybeStartRound(s, flowState);
    return { state: started.state, flowState: started.flowState, changed: true };
  }

  // BONUS_ASSIGN süresi doldu: onaylamamış tarafları otomatik tamamla + onayla.
  if (state.scene === 'BONUS_ASSIGN') {
    let s = state;
    let fs = flowState;
    for (const side of ['P1', 'P2'] as const) {
      const confirmed =
        side === 'P1' ? s.p1BonusConfirmed : s.p2BonusConfirmed;
      if (!confirmed) {
        const r = await applyBonusConfirm(s, side, fs);
        s = r.state;
        fs = r.flowState;
      }
    }
    return { state: s, flowState: fs, changed: true };
  }

  if (state.scene === 'ROUND_PLAY') {
    let s = state;
    for (const side of ['P1', 'P2'] as const) {
      const played = side === 'P1' ? s.currentP1Card : s.currentP2Card;
      if (!played) {
        const hand = side === 'P1' ? s.p1Hand : s.p2Hand;
        if (hand.length > 0) {
          s = reduceSession(s, {
            type: 'CARD_PLAYED',
            side,
            cardId: pick(hand),
          });
        }
      }
    }
    // İki kart da oynandıysa turu çöz.
    if (s.currentP1Card && s.currentP2Card) {
      const resolved = await resolveRoundOnServer(s, flowState);
      return {
        state: resolved.nextState,
        flowState: resolved.flowState,
        changed: true,
      };
    }
    return { state: s, flowState, changed: true };
  }

  return { state, flowState, changed: false };
}

/**
 * Tur sonucu gösterildikten sonra SONRAKİ tura ilerletir (sunucu-otoriteli).
 *
 * Akış: ROUND_REVEAL/ROUND_RESULT → ROUND_ACK → (faz kontrolü) → yeni tur için
 * ROUND_INTRO → otomatik soru seç → ROUND_PLAY. Faz bitmişse PHASE_TRANSITION
 * veya FINAL'e gider (o durumda soru seçilmez).
 *
 * İDEMPOTENT: iki oyuncu da "devam" gönderebilir; zaten ilerlemişse (artık
 * REVEAL/RESULT sahnesinde değilse) state'i değiştirmeden döner. Böylece çift
 * ack güvenli.
 */
export async function acknowledgeRound(
  state: SessionState,
  flowState: FlowState | null,
): Promise<{
  state: SessionState;
  flowState: FlowState | null;
  questionId: string | null;
}> {
  // Yalnızca tur-sonucu sahnelerinden ilerlenir; aksi halde idempotent no-op.
  if (state.scene !== 'ROUND_REVEAL' && state.scene !== 'ROUND_RESULT') {
    return { state, flowState, questionId: state.currentQuestionId };
  }

  // ROUND_ACK: roundIndex++ + ROUND_INTRO (veya faz geçişi / FINAL).
  const next = reduceSession(state, { type: 'ROUND_ACK' });

  // Yeni tur ROUND_INTRO'ya geçtiyse soruyu otomatik seç → ROUND_PLAY.
  if (next.scene === 'ROUND_INTRO') {
    return maybeStartRound(next, flowState);
  }

  // FAZ GEÇİŞİ (berabere → uzatma/sudden) ya da FINAL: PHASE_TRANSITION'da KAL.
  // Client "Uzatma!/Penaltılar!" duyurusunu gösterip ~5sn sonra phase-ack
  // gönderir → yeni fazın el seçimine geçilir. Böylece kullanıcı ne olduğunu
  // anlar (otomatik atlanmaz). FINAL ise zaten maç biter.
  return { state: next, flowState, questionId: null };
}

/**
 * Faz-geçiş duyurusu görüldü → yeni fazın el seçimine ilerlet (PHASE_TRANSITION
 * → CARD_PICK_P1). İdempotent: PHASE_TRANSITION'da değilse no-op (çift güvenli).
 */
export function acknowledgePhaseTransition(state: SessionState): SessionState {
  if (state.scene !== 'PHASE_TRANSITION') return state;
  return reduceSession(state, { type: 'PHASE_TRANSITION_ACK' });
}

/**
 * İki tarafın da kartı oynandıktan sonra turu SUNUCUDA çözer.
 * Doğru cevabı sunucuda hesaplar; state'i ROUND_RESOLVED ile ilerletir.
 * flowState'ten yüklenen FlowContext kullanılır (params/proximity hedefi için).
 */
export async function resolveRoundOnServer(
  state: SessionState,
  flowState: FlowState | null,
): Promise<ResolvedRound> {
  if (!state.currentP1Card || !state.currentP2Card) {
    throw new Error('Tur çözülemez: iki taraf da kart oynamadı.');
  }
  if (!state.currentQuestionId) {
    throw new Error('Tur çözülemez: aktif soru yok.');
  }
  const template = templateById(state.currentQuestionId);
  if (!template) {
    throw new Error(`Soru bulunamadı: ${state.currentQuestionId}.`);
  }

  const flow = await loadFlow(state.seed, flowState);

  const outcome = resolveCards(
    template,
    state.currentP1Card,
    state.currentP2Card,
    flow,
    state.pendingMultiplier,
  );

  const multiplier = 'multiplier' in outcome ? outcome.multiplier : undefined;
  const title = resolvedTitle(flow, template) || template.id;
  const nextState = reduceSession(state, {
    type: 'ROUND_RESOLVED',
    questionTitle: title,
    p1Value: outcome.p1Value,
    p2Value: outcome.p2Value,
    winner: outcome.winner,
    tiebreakerUsed: outcome.tiebreakerUsed,
    multiplier,
  });

  return {
    nextState,
    flowState: serializeFlowState(flow),
    reveal: {
      questionTitle: title,
      p1Value: outcome.p1Value,
      p2Value: outcome.p2Value,
      winner: outcome.winner,
      tiebreakerUsed: outcome.tiebreakerUsed,
      multiplier,
    },
  };
}
