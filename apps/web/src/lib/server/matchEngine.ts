/**
 * Sunucu-otoriteli maç motoru (online mod çekirdeği).
 *
 * Online'da kuralları SUNUCU işletir. Client yalnızca "niyet" gönderir
 * (örn. "şu kartı oynadım"); doğru cevabı / kazananı sunucu hesaplar ve
 * client'a yalnızca SONUCU döner. Doğru cevap havuzu hiçbir zaman client'a
 * sızmaz → F12'den kopya çekilemez (bkz ONLINE-YOL-HARITASI.md, hile modeli).
 *
 * Bu modül auth/HTTP'den BAĞIMSIZDIR — saf girdi/çıktı, test edilebilir.
 * `game-engine` paketindeki AYNI reducer/flow'u kullanır (web ile tek kaynak).
 */
import {
  reduceSession,
  resolveCards,
  resolvedTitle,
  createFlowContext,
  type SessionState,
} from '@futbol-kart/game-engine';
import { templateById } from '@futbol-kart/question-templates';
import { loadGameData } from '@/lib/data';

/** Bir turu sunucuda çözmenin sonucu — client'a dönülebilecek GÜVENLİ veri. */
export interface ResolvedRound {
  /** Güncellenmiş, kaynak-doğru maç durumu (DB'ye yazılacak). */
  nextState: SessionState;
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
 * Bir tarafın kart oynama hamlesini SUNUCUDA doğrular ve uygular.
 * Geçersiz hamle (sırası değil, kart elinde değil, vb.) Error fırlatır.
 *
 * Not: Bu fonksiyon yalnızca CARD_PLAYED'i uygular ve state'i döndürür.
 * İki tarafın da kartı oynandığında çağıran `resolveRoundOnServer`'ı kullanır.
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
 * İki tarafın da kartı oynandıktan sonra turu SUNUCUDA çözer.
 * Doğru cevabı sunucuda hesaplar; state'i ROUND_RESOLVED ile ilerletir.
 *
 * `seed` maçın seed'i — `createFlowContext` aynı seed'le aynı soru sırasını
 * deterministik üretir, böylece sunucu client ile birebir aynı maçı görür.
 */
export async function resolveRoundOnServer(
  state: SessionState,
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

  // Sunucu motorunu maçın seed'iyle kur — client ile birebir aynı flow.
  const { players, clubsLite } = await loadGameData();
  const flow = createFlowContext(state.seed, players, clubsLite);

  const outcome = resolveCards(
    template,
    state.currentP1Card,
    state.currentP2Card,
    flow,
    state.pendingMultiplier,
  );

  const multiplier = 'multiplier' in outcome ? outcome.multiplier : undefined;
  const nextState = reduceSession(state, {
    type: 'ROUND_RESOLVED',
    questionTitle: resolvedTitle(flow, template) || template.id,
    p1Value: outcome.p1Value,
    p2Value: outcome.p2Value,
    winner: outcome.winner,
    tiebreakerUsed: outcome.tiebreakerUsed,
    multiplier,
  });

  return {
    nextState,
    reveal: {
      questionTitle: resolvedTitle(flow, template) || template.id,
      p1Value: outcome.p1Value,
      p2Value: outcome.p2Value,
      winner: outcome.winner,
      tiebreakerUsed: outcome.tiebreakerUsed,
      multiplier,
    },
  };
}
