'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { Player } from '@futbol-kart/shared-types';
import {
  templateById,
  type Template,
} from '@futbol-kart/question-templates';
import { canUseMultiplier, multiplierDirection } from '@futbol-kart/game-engine';
import { PitchBackground } from '@/components/PitchBackground';
import { Scoreboard } from '@/components/Scoreboard';
import { CardPickScene } from '@/components/scenes/CardPickScene';
import { HomeIcon } from '@/components/icons';
import { fetchGameData } from '@/lib/playersClient';
import {
  useOnlineMatch,
  type RevealedValue,
  type TransferInfo,
  type TransferOptions,
} from '@/lib/useOnlineMatch';

/**
 * Online maç sayfası (temel dilim).
 *
 * Mevcut dev oyna sayfasına dokunmadan, sunucu-otoriteli online akışını izole
 * çalıştırır: el seçimi → kart oynama → tur sonucu. State sunucudan gelir
 * (useOnlineMatch); kullanıcı aksiyonları sunucuya gider. Joker/bonus/faz
 * sonraki fazlarda eklenecek (bkz ONLINE-YOL-HARITASI.md).
 */
export default function OnlineMatchPage() {
  const params = useParams<{ matchId: string }>();
  const matchId = params.matchId;
  const online = useOnlineMatch(matchId);
  const [players, setPlayers] = useState<Player[]>([]);

  // Oyuncu verisini bir kez yükle (kart adı/görseli için).
  useEffect(() => {
    let cancelled = false;
    void fetchGameData().then((d) => {
      if (!cancelled) setPlayers(d.players);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const {
    state,
    yourSide,
    loading,
    error,
    submitHand,
    playCard,
    lastReveal,
    revealValues,
    useMultiplier,
    useReveal,
    fetchTransferOptions,
    transfer,
    lastTransfer,
    clearTransfer,
  } = online;

  const playersById = useMemo(
    () => new Map(players.map((p) => [p.id, p])),
    [players],
  );

  if (loading || !state || !yourSide) {
    return (
      <Shell>
        <div className="flex min-h-[50vh] items-center justify-center text-white/70">
          {error ? (
            <div className="text-center">
              <p className="text-side-red">{error}</p>
              <Link href="/" className="btn-ghost mt-4">
                Ana sayfa
              </Link>
            </div>
          ) : (
            'Maç yükleniyor…'
          )}
        </div>
      </Shell>
    );
  }

  const myHand = yourSide === 'P1' ? state.p1Hand : state.p2Hand;
  const myCardPlayed =
    yourSide === 'P1' ? state.currentP1Card : state.currentP2Card;
  const oppCardPlayed =
    yourSide === 'P1' ? state.currentP2Card : state.currentP1Card;

  return (
    <Shell>
      <header className="mb-6 flex items-center justify-between">
        <Link href="/" className="btn-ghost">
          <HomeIcon size={16} /> Ana sayfa
        </Link>
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-goldHi">
          🌐 Online · {yourSide === 'P1' ? state.p1Name : state.p2Name}
        </span>
      </header>

      <Scoreboard
        p1Name={state.p1Name}
        p2Name={state.p2Name}
        p1Score={state.p1Score}
        p2Score={state.p2Score}
        round={state.roundIndex + 1}
        totalRounds={state.totalRounds}
      />

      <div className="mt-8">
        {/* EL SEÇİMİ — kendi elimi henüz seçmediysem */}
        {(state.scene === 'CARD_PICK_P1' || state.scene === 'CARD_PICK_P2') &&
          myHand.length === 0 && (
            <CardPickScene
              side={yourSide}
              players={players}
              handSize={state.handSize}
              ctaLabel="Elini onayla"
              onSubmit={(cards) => void submitHand(cards)}
            />
          )}

        {/* Elimi seçtim ama rakip seçmedi → bekle */}
        {(state.scene === 'CARD_PICK_P1' || state.scene === 'CARD_PICK_P2') &&
          myHand.length > 0 && (
            <Waiting text="Elini seçtin. Rakibin el seçmesi bekleniyor…" />
          )}

        {/* TUR OYNAMA */}
        {state.scene === 'ROUND_PLAY' && (
          <RoundPlay
            template={templateOf(state.currentQuestionId)}
            hand={myHand}
            playersById={playersById}
            myCardPlayed={myCardPlayed}
            oppCardPlayed={oppCardPlayed}
            onPlay={(cardId) => void playCard(cardId)}
            multiplierUsed={
              yourSide === 'P1'
                ? state.p1Jokers.multiplierUsed
                : state.p2Jokers.multiplierUsed
            }
            multiplierActive={state.pendingMultiplier === yourSide}
            revealUsed={
              yourSide === 'P1'
                ? state.p1Jokers.revealUsed
                : state.p2Jokers.revealUsed
            }
            revealValues={revealValues}
            onUseMultiplier={() => void useMultiplier()}
            onUseReveal={() => void useReveal()}
            transferUsed={
              yourSide === 'P1'
                ? state.p1Jokers.transferUsed
                : state.p2Jokers.transferUsed
            }
            transferAvailable={
              !state.transferThisRound &&
              state.roundIndex < state.totalRounds - 1
            }
            fetchTransferOptions={fetchTransferOptions}
            onTransfer={(give, take) => void transfer(give, take)}
          />
        )}

        {/* TRANSFER TABELASI (her iki tarafa açık) */}
        {lastTransfer && (
          <TransferBoard
            transfer={lastTransfer}
            yourSide={yourSide}
            playersById={playersById}
            onClose={clearTransfer}
          />
        )}

        {/* TUR SONUCU (reveal) */}
        {(state.scene === 'ROUND_REVEAL' || state.scene === 'ROUND_RESULT') &&
          lastReveal && (
            <RoundResult reveal={lastReveal} yourSide={yourSide} />
          )}

        {/* FİNAL */}
        {state.scene === 'FINAL' && (
          <div className="glass-panel-strong p-8 text-center">
            <h2 className="text-3xl font-black">Maç bitti</h2>
            <p className="mt-3 text-white/70">
              {state.cumulativeP1} – {state.cumulativeP2}
            </p>
            <Link href="/" className="btn-primary mt-6">
              Ana sayfa
            </Link>
          </div>
        )}
      </div>
    </Shell>
  );
}

function templateOf(questionId: string | null): Template | null {
  if (!questionId) return null;
  return templateById(questionId) ?? null;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PitchBackground />
      <main className="relative z-10 mx-auto flex min-h-screen max-w-2xl flex-col px-5 py-8">
        {children}
      </main>
    </>
  );
}

function Waiting({ text }: { text: string }) {
  return (
    <div className="glass-panel flex min-h-[40vh] items-center justify-center p-8 text-center text-white/70">
      {text}
    </div>
  );
}

function RoundPlay({
  template,
  hand,
  playersById,
  myCardPlayed,
  oppCardPlayed,
  onPlay,
  multiplierUsed,
  multiplierActive,
  revealUsed,
  revealValues,
  onUseMultiplier,
  onUseReveal,
  transferUsed,
  transferAvailable,
  fetchTransferOptions,
  onTransfer,
}: {
  template: Template | null;
  hand: string[];
  playersById: Map<string, Player>;
  myCardPlayed: string | null;
  oppCardPlayed: string | null;
  onPlay: (cardId: string) => void;
  multiplierUsed: boolean;
  multiplierActive: boolean;
  revealUsed: boolean;
  revealValues: RevealedValue[] | null;
  onUseMultiplier: () => void;
  onUseReveal: () => void;
  transferUsed: boolean;
  transferAvailable: boolean;
  fetchTransferOptions: () => Promise<TransferOptions>;
  onTransfer: (give: string, take: string) => void;
}) {
  const [transferPanel, setTransferPanel] = useState<TransferOptions | null>(
    null,
  );
  const [transferError, setTransferError] = useState<string | null>(null);

  const openTransfer = async () => {
    setTransferError(null);
    try {
      const opts = await fetchTransferOptions();
      setTransferPanel(opts);
    } catch (e) {
      setTransferError(e instanceof Error ? e.message : 'Transfer açılamadı.');
    }
  };

  if (myCardPlayed) {
    return (
      <Waiting
        text={
          oppCardPlayed
            ? 'Tur çözülüyor…'
            : 'Kartını oynadın. Rakibin kart oynaması bekleniyor…'
        }
      />
    );
  }

  const questionTitle = template?.title.tr ?? '';
  const multiplierEligible = canUseMultiplier(template);
  const dir = template && multiplierEligible ? multiplierDirection(template) : null;
  // Kart başına reveal değeri (istatistik-gör kullanıldıysa).
  const valueByCard = new Map(
    (revealValues ?? []).map((r) => [r.cardId, r.value]),
  );

  return (
    <div>
      <h2 className="mb-1 text-center text-sm font-semibold uppercase tracking-[0.18em] text-accent-goldHi">
        Soru
      </h2>
      <p className="mb-4 text-center text-xl font-bold">{questionTitle}</p>

      {/* JOKER BARI */}
      <div className="mb-5 flex items-center justify-center gap-3">
        <button
          type="button"
          disabled={!multiplierEligible || multiplierUsed || multiplierActive}
          onClick={onUseMultiplier}
          className="glass-panel px-4 py-2 text-sm font-semibold transition enabled:hover:border-accent-gold/50 enabled:hover:bg-white/10 disabled:opacity-40"
          title={
            !multiplierEligible
              ? 'Bu soruda çarpan kullanılamaz'
              : multiplierUsed
                ? 'Çarpan zaten kullanıldı'
                : 'Kendi değerini avantajlı yöne çarp'
          }
        >
          {multiplierActive
            ? `Çarpan aktif (${dir === 'half' ? '÷2' : '×2'})`
            : `Çarpan ${dir === 'half' ? '÷2' : '×2'}`}
        </button>
        <button
          type="button"
          disabled={revealUsed}
          onClick={onUseReveal}
          className="glass-panel px-4 py-2 text-sm font-semibold transition enabled:hover:border-accent-gold/50 enabled:hover:bg-white/10 disabled:opacity-40"
          title={
            revealUsed
              ? 'İstatistik jokeri zaten kullanıldı'
              : 'Kendi elindeki kartların bu sorudaki değerini gör'
          }
        >
          📊 İstatistiği gör
        </button>
        <button
          type="button"
          disabled={transferUsed || !transferAvailable}
          onClick={() => void openTransfer()}
          className="glass-panel px-4 py-2 text-sm font-semibold transition enabled:hover:border-accent-gold/50 enabled:hover:bg-white/10 disabled:opacity-40"
          title={
            transferUsed
              ? 'Transfer jokeri zaten kullanıldı'
              : !transferAvailable
                ? 'Bu turda transfer yapılamaz'
                : 'Bir kartını ver, rakipten bir kart al'
          }
        >
          🔄 Transfer
        </button>
      </div>

      {transferError && (
        <p className="mb-4 text-center text-xs text-side-red">{transferError}</p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {hand.map((id) => {
          const p = playersById.get(id);
          const revealed = valueByCard.has(id) ? valueByCard.get(id)! : undefined;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onPlay(id)}
              className="glass-panel flex flex-col items-center gap-2 p-4 text-center transition hover:border-accent-gold/50 hover:bg-white/10"
            >
              <span className="text-sm font-bold">{p?.displayName ?? id}</span>
              <span className="text-xs text-white/55">{p?.position}</span>
              {revealed !== undefined && (
                <span className="mt-1 rounded-full bg-accent-gold/20 px-2 py-0.5 text-xs font-bold text-accent-goldHi ring-1 ring-accent-gold/40">
                  {fmt(revealed)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* TRANSFER PANELİ — kendi kartını ver + rakipten al seç */}
      {transferPanel && (
        <TransferPanel
          options={transferPanel}
          playersById={playersById}
          onCancel={() => setTransferPanel(null)}
          onConfirm={(give, take) => {
            setTransferPanel(null);
            onTransfer(give, take);
          }}
        />
      )}
    </div>
  );
}

/** Transfer seçim modalı: 1 kendi kart (ver) + 1 rakip kart (al). */
function TransferPanel({
  options,
  playersById,
  onCancel,
  onConfirm,
}: {
  options: TransferOptions;
  playersById: Map<string, Player>;
  onCancel: () => void;
  onConfirm: (give: string, take: string) => void;
}) {
  const [give, setGive] = useState<string | null>(null);
  const [take, setTake] = useState<string | null>(null);
  const name = (id: string) => playersById.get(id)?.displayName ?? id;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="glass-panel-strong w-full max-w-lg p-6">
        <h3 className="text-center text-lg font-black">🔄 Transfer</h3>
        <p className="mt-1 text-center text-xs text-white/55">
          Bir kartını ver, rakipten bir kart al. Hak bir kez — değişim kalıcı.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-side-red">
              Vereceğin
            </p>
            <div className="flex flex-col gap-2">
              {options.ownCards.map((id) => (
                <PickRow
                  key={id}
                  label={name(id)}
                  active={give === id}
                  onClick={() => setGive(id)}
                />
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-accent-goldHi">
              Alacağın (rakip)
            </p>
            <div className="flex flex-col gap-2">
              {options.oppCards.map((id) => (
                <PickRow
                  key={id}
                  label={name(id)}
                  active={take === id}
                  onClick={() => setTake(id)}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-center gap-3">
          <button type="button" onClick={onCancel} className="btn-ghost">
            Vazgeç
          </button>
          <button
            type="button"
            disabled={!give || !take}
            onClick={() => give && take && onConfirm(give, take)}
            className="btn-primary disabled:opacity-40"
          >
            Takası yap
          </button>
        </div>
      </div>
    </div>
  );
}

function PickRow({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'rounded-lg border px-3 py-2 text-sm font-semibold transition ' +
        (active
          ? 'border-accent-gold bg-accent-gold/20 text-accent-goldHi'
          : 'border-white/10 bg-black/20 hover:border-white/30')
      }
    >
      {label}
    </button>
  );
}

/** Transfer tabelası — kim ne verdi/aldı (her iki tarafa açık). */
function TransferBoard({
  transfer,
  yourSide,
  playersById,
  onClose,
}: {
  transfer: TransferInfo;
  yourSide: 'P1' | 'P2';
  playersById: Map<string, Player>;
  onClose: () => void;
}) {
  const name = (id: string) => playersById.get(id)?.displayName ?? id;
  const byMe = transfer.side === yourSide;
  // Tabela perspektifi: "ben" mi yaptım yoksa rakip mi?
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="glass-panel-strong w-full max-w-md p-6 text-center">
        <h3 className="text-lg font-black text-accent-goldHi">🔄 Transfer</h3>
        <p className="mt-1 text-xs text-white/55">
          {byMe ? 'Transferini yaptın' : 'Rakip transfer yaptı'}
        </p>
        <div className="mt-5 flex items-center justify-center gap-4">
          <div className="rounded-xl bg-side-red/15 px-4 py-3 ring-1 ring-side-red/40">
            <p className="text-[10px] uppercase tracking-wide text-side-red">
              {byMe ? 'Verdin' : 'Sana geldi'}
            </p>
            <p className="mt-1 text-sm font-bold">{name(transfer.give)}</p>
          </div>
          <span className="text-2xl">⇄</span>
          <div className="rounded-xl bg-accent-gold/15 px-4 py-3 ring-1 ring-accent-gold/40">
            <p className="text-[10px] uppercase tracking-wide text-accent-goldHi">
              {byMe ? 'Aldın' : 'Senden gitti'}
            </p>
            <p className="mt-1 text-sm font-bold">{name(transfer.take)}</p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="btn-primary mt-6">
          Tamam
        </button>
      </div>
    </div>
  );
}

function RoundResult({
  reveal,
  yourSide,
}: {
  reveal: import('@/lib/useOnlineMatch').RoundReveal;
  yourSide: 'P1' | 'P2';
}) {
  const youWon = reveal.winner === yourSide;
  const tie = reveal.winner === 'tie';
  return (
    <div className="glass-panel-strong p-8 text-center">
      <p className="text-sm uppercase tracking-[0.18em] text-white/55">
        {reveal.questionTitle}
      </p>
      <div className="mt-4 flex items-center justify-center gap-8 text-2xl font-black">
        <span>{fmt(reveal.p1Value)}</span>
        <span className="text-white/30">·</span>
        <span>{fmt(reveal.p2Value)}</span>
      </div>
      <p
        className={
          'mt-4 text-lg font-bold ' +
          (tie
            ? 'text-white/70'
            : youWon
              ? 'text-accent-goldHi'
              : 'text-side-red')
        }
      >
        {tie ? 'Berabere' : youWon ? 'Bu turu kazandın! 🎯' : 'Bu turu kaybettin'}
      </p>
    </div>
  );
}

function fmt(v: number | boolean | null): string {
  if (v === null) return '—';
  if (typeof v === 'boolean') return v ? '✓' : '✗';
  return String(v);
}
