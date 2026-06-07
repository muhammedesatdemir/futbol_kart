'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Ably from 'ably';
import type { SessionState } from '@futbol-kart/game-engine';

/**
 * Online maç köprüsü (client).
 *
 * - Maçı sunucudan yükler (GET /api/match/[id]) → kaynak-doğru state.
 * - Ably ile maç kanalını dinler; key yoksa kısa-aralıklı polling'e düşer.
 * - Kullanıcı aksiyonlarını sunucuya gönderir (POST .../move) — state'i
 *   client hesaplamaz, sunucudan gelen state'i gösterir (sunucu-otoriteli).
 *
 * Dönen `state` sunucudaki SessionState; oyna sayfası bunu mevcut sahnelerle
 * render eder. `yourSide` client'ın hangi oyuncu olduğunu söyler.
 */
export interface OnlineMatch {
  state: SessionState | null;
  yourSide: 'P1' | 'P2' | null;
  status: string | null;
  /** Son tur reveal'i (sunucudan) — RoundScene için. */
  lastReveal: RoundReveal | null;
  loading: boolean;
  error: string | null;
  submitHand: (cards: string[]) => Promise<void>;
  playCard: (cardId: string) => Promise<void>;
  /** Çarpan jokeri (×2/÷2) — kart oynamadan önce. */
  useMultiplier: () => Promise<void>;
  /** İstatistik-gör jokeri — kendi elinin değerlerini getirir (revealValues'a yazar). */
  useReveal: () => Promise<void>;
  /** İstatistik jokeri sonucu: kendi elimin bu sorudaki değerleri (gizli, sadece bana). */
  revealValues: RevealedValue[] | null;
  /** Transfer seçenekleri: kendi + rakibin transfer-edilebilir kartları (açma anında). */
  fetchTransferOptions: () => Promise<TransferOptions>;
  /** Transfer takası: kendi `give` kartını ver, rakipten `take` kartını al. */
  transfer: (give: string, take: string) => Promise<void>;
  /** Son transfer tabelası (her iki tarafa açık) — gösterildikten sonra temizlenir. */
  lastTransfer: TransferInfo | null;
  /** Transfer tabelasını kapat (gösterim bitince). */
  clearTransfer: () => void;
  /** Tur sonucu görüldü → sonraki tura ilerle (sunucu-otoriteli, idempotent). */
  ack: () => Promise<void>;
  /** Faz-geçiş duyurusu görüldü → yeni fazın el seçimine geç. */
  phaseAck: () => Promise<void>;
  /** Bonus: bir kartı bir slota ata (henüz onaylamadan). */
  assignBonus: (slot: number, cardId: string | null) => Promise<void>;
  /** Bonus atamasını onayla → iki taraf onaylayınca tur başlar. */
  confirmBonus: () => Promise<void>;
  /** Bu aşamanın sunucu-otoriteli bitiş anı (ISO) — client geri sayım gösterir. */
  turnDeadline: string | null;
  /** Parametrelerle dolu soru başlığı (sunucudan; {targetApps} → 500). */
  questionTitle: string | null;
  /** Sunucudan en güncel state'i yeniden çek. */
  refresh: () => Promise<void>;
}

export interface TransferInfo {
  side: 'P1' | 'P2';
  give: string;
  take: string;
}

export interface TransferOptions {
  /** Verebileceğim kartlar (kendi elimden). */
  ownCards: string[];
  /** Alabileceğim kartlar (rakipten — yalnızca transfer-edilebilir). */
  oppCards: string[];
}

export interface RoundReveal {
  questionTitle: string;
  p1Value: number | boolean | null;
  p2Value: number | boolean | null;
  winner: 'P1' | 'P2' | 'tie';
  tiebreakerUsed?: string;
  multiplier?: { side: 'P1' | 'P2'; dir: 'x2' | 'half' };
}

export interface RevealedValue {
  cardId: string;
  value: number | boolean | null;
}

// Polling nabzı. Süre dolumunu yeterince çabuk yakalamak için sık (1.5sn).
// Ably bağlıyken anlık güncellemeler zaten gelir; bu nabız deadline kontrolü
// + "ekrandan bağımsız ilerleme" için. Ably ücretsiz katmanı bu yükü kaldırır.
const POLL_MS = 1500;

export function useOnlineMatch(matchId: string | null): OnlineMatch {
  const [state, setState] = useState<SessionState | null>(null);
  const [yourSide, setYourSide] = useState<'P1' | 'P2' | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [lastReveal, setLastReveal] = useState<RoundReveal | null>(null);
  const [revealValues, setRevealValues] = useState<RevealedValue[] | null>(null);
  const [lastTransfer, setLastTransfer] = useState<TransferInfo | null>(null);
  const [turnDeadline, setTurnDeadline] = useState<string | null>(null);
  const [questionTitle, setQuestionTitle] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const ablyRef = useRef<Ably.Realtime | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Son uygulanan state'in serileştirilmiş hali. Polling her 1.5sn GET çağırır
  // ama state çoğu zaman AYNIDIR (kimse hamle yapmadı). Aynıysa setState'i
  // ATLA → yeni obje referansı üretilmez → tüm sahne ağacı boşuna re-render
  // olmaz → framer-motion animasyonları araya giren render'la kasmaz.
  const lastStateJsonRef = useRef<string | null>(null);
  // Son görülen maç sürümü. GET'e ?v= ile yollanır; sunucu sürüm değişmemiş
  // VE timeout tetiklenmemişse minik "unchanged" döner → ağır iş (loadGameData,
  // şablon tarama, tam serileştirme) sunucuda hiç yapılmaz. Değişmeyen
  // poll'lerin maliyetini kökten düşürür.
  const versionRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (!matchId) return;
    try {
      const v = versionRef.current;
      const url =
        v !== null ? `/api/match/${matchId}?v=${v}` : `/api/match/${matchId}`;
      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Maç yüklenemedi.');
      }
      const data = await res.json();
      // SÜRÜM DEĞİŞMEDİ: sunucu tam state yollamadı. Sadece deadline'ı tazele
      // (geri sayım senkronu) ve çık — state/title/side aynı kalır.
      if (data.unchanged) {
        if (typeof data.version === 'number') versionRef.current = data.version;
        setTurnDeadline(data.turnDeadline ?? null);
        setError(null);
        return;
      }
      if (typeof data.version === 'number') versionRef.current = data.version;
      // state DEĞİŞTİYSE yeni referans ver; değişmediyse aynı referansı koru.
      // (yourSide/status/deadline/title primitive → aynı değerde React zaten
      //  bail-out yapar, re-render tetiklemez; asıl maliyet `state` objesinde.)
      const nextStateJson = JSON.stringify(data.state ?? null);
      if (nextStateJson !== lastStateJsonRef.current) {
        lastStateJsonRef.current = nextStateJson;
        setState(data.state as SessionState);
      }
      setYourSide(data.yourSide);
      setStatus(data.status);
      setTurnDeadline(data.turnDeadline ?? null);
      setQuestionTitle(data.currentQuestionTitle ?? null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Maç yüklenemedi.');
    }
  }, [matchId]);

  // İlk yükleme + Ably bağlantısı (yoksa polling).
  useEffect(() => {
    if (!matchId) return;
    let disposed = false;

    (async () => {
      setLoading(true);
      await refresh();
      if (disposed) return;
      setLoading(false);

      // Ably (varsa): anlık güncellemeler için. Hamle olunca rakip ANINDA görür.
      try {
        const res = await fetch(`/api/match/${matchId}/ably-token`);
        const data = await res.json();
        if (disposed) return;
        if (data.enabled && data.tokenRequest) {
          const client = new Ably.Realtime({
            authCallback: (_params, cb) => cb(null, data.tokenRequest),
          });
          ablyRef.current = client;
          const channel = client.channels.get(`match:${matchId}`);
          channel.subscribe('state-changed', (msg) => {
            const payload = msg.data as
              | { reveal?: RoundReveal; transfer?: TransferInfo }
              | undefined;
            if (payload?.reveal) setLastReveal(payload.reveal);
            if (payload?.transfer) setLastTransfer(payload.transfer);
            void refresh();
          });
        }
      } catch {
        // token alınamadı — yalnızca polling ile devam
      }

      // POLLING HER ZAMAN çalışır (Ably olsa da). KRİTİK: bu, "ekrandan bağımsız
      // süreç" mantığının kalbi. Her tick GET çağırır; sunucu lazy timeout
      // uygular → bir taraf hamle yapmasa/sayfadan çıksa bile DİĞERİNİN
      // yoklaması deadline'ı geçirir ve maçı ilerletir. Ably sadece "değişti"
      // diye yayar; süre dolumu için bağımsız nabız şart. Bkz ONLINE-YOL-HARITASI.
      pollRef.current = setInterval(() => void refresh(), POLL_MS);
    })();

    return () => {
      disposed = true;
      // Maç değişti → state + sürüm ref'lerini sıfırla (yeni maçın ilk GET'i
      // ?v= olmadan gider, tam state alır).
      lastStateJsonRef.current = null;
      versionRef.current = null;
      if (pollRef.current) clearInterval(pollRef.current);
      if (ablyRef.current) {
        ablyRef.current.close();
        ablyRef.current = null;
      }
    };
  }, [matchId, refresh]);

  const sendMove = useCallback(
    async (bodyObj: Record<string, unknown>): Promise<Record<string, unknown>> => {
      if (!matchId) return {};
      // OPTIMISTIC LOCKING: sunucu 409 (conflict) dönerse başka bir hamle araya
      // girmiş demektir. Kısa, artan beklemeyle birkaç kez retry et — yoğun
      // ortamda eşzamanlı hamlelerde kaybolan hamle olmaz. Bkz ONLINE-YOL-HARITASI.
      const MAX_RETRY = 4;
      for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
        const res = await fetch(`/api/match/${matchId}/move`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyObj),
        });
        if (res.status === 409 && attempt < MAX_RETRY) {
          // Çakışma: kısa bekle (artan + küçük jitter), tekrar dene.
          await new Promise((r) =>
            setTimeout(r, 80 * (attempt + 1) + Math.floor((attempt * 37) % 50)),
          );
          continue;
        }
        if (res.status === 422) {
          // GEÇERSİZ/GEÇ HAMLE (örn. sahne artık ROUND_PLAY değil çünkü tur
          // çözüldü). Bu İYİ HUYLU bir yarış: sunucu otoriter, durum zaten
          // ilerlemiş. THROW ETME — yoksa `void playCard()` yakalanmamış promise
          // reddi olur ve dev overlay "Unhandled Runtime Error" basar. Sessizce
          // güncel state'i çek ve çık (UI sunucudaki doğru sahneye oturur).
          void refresh();
          return {};
        }
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? 'Hamle reddedildi.');
        }
        const data = await res.json();
        if (data.reveal) setLastReveal(data.reveal as RoundReveal);
        // Hamle sonrası state'i tazele AMA BEKLEME (ateşle-unut). Eskiden
        // `await refresh()` vardı → her aksiyon fazladan bir tam GET gidiş-
        // dönüşü (~200-300ms) kadar BLOKLANIYORDU; "Hazırım"/kategori sonrası
        // ekran geç açılıyordu. Artık POST döner dönmez UI ilerler; refresh
        // arka planda kaynak-doğru state'i getirir (Ably + 1.5sn poll de yedek).
        void refresh();
        return data;
      }
      throw new Error('Hamle çok kez çakıştı, tekrar dene.');
    },
    [matchId, refresh],
  );

  const submitHand = useCallback(
    async (cards: string[]) => {
      setRevealValues(null); // yeni el → eski reveal değerleri geçersiz
      await sendMove({ action: 'submit-hand', cards });
    },
    [sendMove],
  );
  const playCard = useCallback(
    async (cardId: string) => {
      setRevealValues(null); // kart oynandı → reveal rozetleri kalkar
      await sendMove({ action: 'play-card', cardId });
    },
    [sendMove],
  );
  const useMultiplier = useCallback(async () => {
    await sendMove({ action: 'use-multiplier' });
  }, [sendMove]);
  const useReveal = useCallback(async () => {
    const data = await sendMove({ action: 'use-reveal' });
    if (Array.isArray(data.revealValues)) {
      setRevealValues(data.revealValues as RevealedValue[]);
    }
  }, [sendMove]);
  const fetchTransferOptions =
    useCallback(async (): Promise<TransferOptions> => {
      if (!matchId) return { ownCards: [], oppCards: [] };
      const res = await fetch(`/api/match/${matchId}/transfer-options`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Transfer açılamadı.');
      }
      return (await res.json()) as TransferOptions;
    }, [matchId]);
  const transfer = useCallback(
    async (give: string, take: string) => {
      const data = await sendMove({ action: 'transfer', give, take });
      if (data.transfer) setLastTransfer(data.transfer as TransferInfo);
    },
    [sendMove],
  );
  const clearTransfer = useCallback(() => setLastTransfer(null), []);
  const ack = useCallback(async () => {
    await sendMove({ action: 'ack' });
  }, [sendMove]);
  const phaseAck = useCallback(async () => {
    await sendMove({ action: 'phase-ack' });
  }, [sendMove]);
  const assignBonus = useCallback(
    async (slot: number, cardId: string | null) => {
      await sendMove({ action: 'assign-bonus', slot, cardId });
    },
    [sendMove],
  );
  const confirmBonus = useCallback(async () => {
    await sendMove({ action: 'confirm-bonus' });
  }, [sendMove]);

  return {
    state,
    yourSide,
    status,
    lastReveal,
    revealValues,
    loading,
    error,
    submitHand,
    playCard,
    useMultiplier,
    useReveal,
    fetchTransferOptions,
    transfer,
    lastTransfer,
    clearTransfer,
    ack,
    phaseAck,
    assignBonus,
    confirmBonus,
    turnDeadline,
    questionTitle,
    refresh,
  };
}
