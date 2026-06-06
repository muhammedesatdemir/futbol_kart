'use client';

import { useCallback, useMemo } from 'react';
import type { SessionEvent, SessionState } from '@futbol-kart/game-engine';
import { useSessionStore } from '@/lib/sessionStore';
import {
  useOnlineMatch,
  type OnlineMatch,
  type RevealedValue,
  type TransferInfo,
} from '@/lib/useOnlineMatch';

/**
 * Oyun denetleyicisi — oyna sayfasına TEK arayüz sunar; altta ister yerel
 * (bot/hotseat, Zustand store) ister ONLINE (sunucu-otoriteli, useOnlineMatch)
 * olsun. Sayfa `dispatch(event)` çağırır; online'da bu doğru sunucu metoduna
 * yönlendirilir, offline'da yerel reducer'a gider.
 *
 * Böylece 1200 satırlık oyna sayfası YENİDEN YAZILMADAN online destekler:
 * state kaynağı + dispatch hedefi buradan değişir, sahneler/sesler/efektler
 * aynı kalır (state değişimine tepki verdikleri için). Bkz ONLINE-YOL-HARITASI.md.
 *
 * @param matchId online maç id'si (varsa online mod). null → yerel mod.
 */
export interface GameController {
  /** Mevcut oyun durumu (online: sunucudan, offline: yerel store). */
  state: SessionState;
  /** Olay gönder. Online'da sunucuya, offline'da yerel reducer'a gider. */
  dispatch: (event: SessionEvent) => void;
  /** Online mod mu? */
  isOnline: boolean;
  /** Online'da bu client'ın tarafı; offline'da null. */
  yourSide: 'P1' | 'P2' | null;
  /** Online: bu istemci için yüklenme/hata + tur sonucu/joker verileri. */
  online: {
    loading: boolean;
    error: string | null;
    lastReveal: OnlineMatch['lastReveal'];
    revealValues: RevealedValue[] | null;
    lastTransfer: TransferInfo | null;
    turnDeadline: string | null;
    questionTitle: string | null;
    clearTransfer: () => void;
    fetchTransferOptions: OnlineMatch['fetchTransferOptions'];
  } | null;
}

export function useGameController(matchId: string | null): GameController {
  // Her iki kaynağı da KOŞULSUZ çağır (React hook kuralı). matchId null ise
  // useOnlineMatch erkenden boş döner (fetch yapmaz).
  const onlineMatch = useOnlineMatch(matchId);
  const localState = useSessionStore((s) => s.state);
  const localDispatch = useSessionStore((s) => s.dispatch);

  const isOnline = matchId !== null;

  // Online dispatch: event tipini doğru sunucu metoduna yönlendir.
  const onlineDispatch = useCallback(
    (event: SessionEvent) => {
      switch (event.type) {
        case 'HAND_SUBMITTED':
          void onlineMatch.submitHand(event.cards);
          break;
        case 'CARD_PLAYED':
          void onlineMatch.playCard(event.cardId);
          break;
        case 'JOKER_MULTIPLIER':
          void onlineMatch.useMultiplier();
          break;
        case 'JOKER_REVEAL':
          void onlineMatch.useReveal();
          break;
        case 'TRANSFER_EXECUTE':
          void onlineMatch.transfer(event.give, event.take);
          break;
        case 'ROUND_ACK':
          void onlineMatch.ack();
          break;
        case 'PHASE_TRANSITION_ACK':
          void onlineMatch.phaseAck();
          break;
        // Aşağıdakiler online'da SUNUCU tarafından yönetilir → no-op:
        // MODE_CHOSEN, NAMES_SET, HANDOFF_CONTINUED, ROUND_STARTED,
        // ROUND_RESOLVED, PHASE_TRANSITION_ACK, BONUS_*, JOKER_TRANSFER_OPEN,
        // TRANSFER_SKIP, GAME_RESET.
        default:
          break;
      }
    },
    [onlineMatch],
  );

  return useMemo<GameController>(() => {
    if (isOnline && onlineMatch.state) {
      return {
        state: onlineMatch.state,
        dispatch: onlineDispatch,
        isOnline: true,
        yourSide: onlineMatch.yourSide,
        online: {
          loading: onlineMatch.loading,
          error: onlineMatch.error,
          lastReveal: onlineMatch.lastReveal,
          revealValues: onlineMatch.revealValues,
          lastTransfer: onlineMatch.lastTransfer,
          turnDeadline: onlineMatch.turnDeadline ?? null,
          questionTitle: onlineMatch.questionTitle ?? null,
          clearTransfer: onlineMatch.clearTransfer,
          fetchTransferOptions: onlineMatch.fetchTransferOptions,
        },
      };
    }
    // Yerel mod (bot/hotseat).
    return {
      state: localState,
      dispatch: localDispatch,
      isOnline: false,
      yourSide: null,
      online: null,
    };
  }, [isOnline, onlineMatch, onlineDispatch, localState, localDispatch]);
}
