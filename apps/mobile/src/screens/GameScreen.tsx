import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '../components/Buttons';
import { resolvedTitle, bonusConditionContext } from '@futbol-kart/game-engine';
import { templateById } from '@futbol-kart/question-templates';
import { SceneBackground } from '../components/SceneBackground';
import { SceneShell } from '../components/SceneShell';
import { BallLoader, RoundStinger } from '../fx';
import { ModeSelectScene } from '../scenes/ModeSelectScene';
import { CardPickScene } from '../scenes/CardPickScene';
import { HandoffScene } from '../scenes/HandoffScene';
import { RoundScene } from '../scenes/RoundScene';
import { BonusAssignScene } from '../scenes/BonusAssignScene';
import { TransferScene } from '../scenes/TransferScene';
import { FinalScene } from '../scenes/FinalScene';
import { useOfflineGame } from '../lib/useOfflineGame';
import { useGameSession } from '../lib/GameSessionProvider';
import { useProfileStore } from '../lib/stores';
import type { BackgroundKey } from '../theme/backgrounds';
import { colors } from '../theme';

/** state.scene → arka plan görseli. */
function bgForScene(scene: string): BackgroundKey {
  switch (scene) {
    case 'MODE_SELECT':
      return 'mode';
    case 'CARD_PICK_P1':
    case 'CARD_PICK_P2':
      return 'pick';
    case 'HANDOFF':
      return 'handoff';
    case 'FINAL':
      return 'result';
    default:
      return 'duel';
  }
}

/**
 * Offline VS Düello ekran orkestratörü. Web karşılığı: oyna/[gameId]/page.tsx
 * useOfflineGame hook'u state + otomatik geçişleri yönetir; bu bileşen
 * state.scene'e göre doğru sahneyi render eder.
 */
export function GameScreen({ onExit }: { onExit: () => void }) {
  const { state, flow, actions, ready } = useOfflineGame();
  const session = useGameSession();
  const p1Name = useProfileStore((s) => s.p1Name) || 'Sen';
  const p2NameStored = useProfileStore((s) => s.p2Name);
  const oppName = state.mode === 'vs-bot' ? 'Bot' : p2NameStored || 'Oyuncu 2';

  // Oyuncu id → Player haritası (kart render için).
  const playersById = useMemo(() => {
    const m = new Map(session.players.map((p) => [p.id, p]));
    return m;
  }, [session.players]);

  // exclude Set'leri — render gövdesinde her seferinde yeni Set yaratmak yerine
  // memoize (yoksa CardPick'in pool useMemo'su her render'da 8912 elemanı tarar).
  const excludeP1 = useMemo(() => new Set(state.usedCardIds), [state.usedCardIds]);
  const excludeP2 = useMemo(
    () => new Set([...state.usedCardIds, ...state.p1Hand]),
    [state.usedCardIds, state.p1Hand],
  );

  // Mevcut sorunun başlığı (reveal/play'de gösterilir).
  const questionTitle = useMemo(() => {
    if (!flow || !state.currentQuestionId) return '';
    const t = templateById(state.currentQuestionId);
    if (!t) return '';
    return resolvedTitle(flow, t) || t.id;
  }, [flow, state.currentQuestionId]);

  const bg = bgForScene(state.scene);

  // Veri yüklenmediyse yükleyici (ilk açılış internet indirme).
  if (!ready) {
    return (
      <View style={styles.root}>
        <SceneBackground backgroundKey="home" overlay="dark" />
        <View style={styles.loaderWrap}>
          {session.error ? (
            <ErrorView message={session.error} onRetry={session.retry} />
          ) : (
            <BallLoader label="Oyuncular yükleniyor" sub="İlk açılış birkaç saniye sürebilir" />
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <SceneBackground backgroundKey={bg} overlay={state.scene === 'FINAL' ? 'final' : 'balanced'} />

      {/* MODE_SELECT: rakip seçimi */}
      {state.scene === 'MODE_SELECT' && (
        <SceneShell>
          <ModeSelectScene onChoose={(m) => actions.chooseMode(m)} onBack={onExit} />
        </SceneShell>
      )}

      {/* CARD_PICK_P1 */}
      {state.scene === 'CARD_PICK_P1' && (
        <SceneShell>
          <CardPickScene
            players={session.players}
            handSize={state.handSize}
            exclude={excludeP1}
            side="P1"
            playerName={p1Name}
            onSubmit={(cards) => actions.submitHand('P1', cards)}
          />
        </SceneShell>
      )}

      {/* HANDOFF (hotseat) */}
      {state.scene === 'HANDOFF' && (
        <SceneShell>
          <HandoffScene nextName={oppName} onContinue={actions.handoffContinue} />
        </SceneShell>
      )}

      {/* CARD_PICK_P2 (hotseat) */}
      {state.scene === 'CARD_PICK_P2' && (
        <SceneShell>
          <CardPickScene
            players={session.players}
            handSize={state.handSize}
            exclude={excludeP2}
            side="P2"
            playerName={oppName}
            onSubmit={(cards) => actions.submitHand('P2', cards)}
          />
        </SceneShell>
      )}

      {/* ROUND_INTRO: stinger */}
      {state.scene === 'ROUND_INTRO' && (
        <RoundStinger round={state.roundIndex + 1} totalRounds={state.totalRounds} />
      )}

      {/* ROUND_PLAY / REVEAL / RESULT */}
      {(state.scene === 'ROUND_PLAY' ||
        state.scene === 'ROUND_REVEAL' ||
        state.scene === 'ROUND_RESULT') && (
        <RoundScene
          state={state}
          flow={flow}
          questionTitle={questionTitle}
          playersById={playersById}
          isBot={state.mode === 'vs-bot'}
          yourName={p1Name}
          oppName={oppName}
          onPlayCard={(side, id) => actions.playCard(side, id)}
          onMultiplier={(side) => actions.useMultiplier(side)}
          onReveal={(side) => actions.useReveal(side)}
          onTransfer={(side) => actions.openTransfer(side)}
          onAck={actions.ackRound}
        />
      )}

      {/* BONUS_ASSIGN: ana maç ilk turu — 3 kategoriye kart ata (+2 puan) */}
      {state.scene === 'BONUS_ASSIGN' && flow && (
        <SceneShell>
          <BonusAssignScene
            sideName={state.bonusAssignSide === 'P1' ? p1Name : oppName}
            conditions={state.bonusConditions}
            hand={(state.bonusAssignSide === 'P1' ? state.p1Hand : state.p2Hand)
              .map((id) => playersById.get(id))
              .filter((p): p is NonNullable<typeof p> => !!p)}
            assigned={state.bonusAssignSide === 'P1' ? state.p1BonusCards : state.p2BonusCards}
            ctx={bonusConditionContext(flow)}
            onAssign={(slot, cardId) =>
              actions.assignBonus(state.bonusAssignSide, slot, cardId)
            }
            onConfirm={() => actions.confirmBonus(state.bonusAssignSide)}
          />
        </SceneShell>
      )}

      {/* ROUND_TRANSFER: transfer jokeri açıldı — kart değiş-tokuş */}
      {state.scene === 'ROUND_TRANSFER' && state.transferOpenSide && (
        <SceneShell>
          <TransferScene
            state={state}
            side={state.transferOpenSide}
            playersById={playersById}
            onExecute={(give, take) =>
              actions.executeTransfer(state.transferOpenSide!, give, take)
            }
            onSkip={() => actions.skipTransfer(state.transferOpenSide!)}
          />
        </SceneShell>
      )}

      {/* PHASE_TRANSITION: berabere → uzatma/penaltı duyurusu */}
      {state.scene === 'PHASE_TRANSITION' && (
        <SceneShell>
          <PhaseTransition phase={state.phase} onContinue={actions.ackPhaseTransition} />
        </SceneShell>
      )}

      {/* FINAL */}
      {state.scene === 'FINAL' && (
        <SceneShell>
          <FinalScene
            state={state}
            yourName={p1Name}
            oppName={oppName}
            onRematch={actions.reset}
            onHome={onExit}
          />
        </SceneShell>
      )}
    </View>
  );
}

/** Faz geçiş duyurusu (berabere → uzatma/sudden death). */
function PhaseTransition({
  phase,
  onContinue,
}: {
  phase: string;
  onContinue: () => void;
}) {
  const label = phase === 'extra' ? 'UZATMA' : phase === 'sudden' ? 'ANİ ÖLÜM' : 'DEVAM';
  const sub =
    phase === 'extra'
      ? 'Berabere! Uzatmalara gidiyoruz.'
      : phase === 'sudden'
        ? 'Hâlâ berabere! Ani ölüm turu.'
        : '';
  return (
    <View style={styles.phaseRoot}>
      <Text style={styles.phaseChip}>{label}</Text>
      <Text style={styles.phaseSub}>{sub}</Text>
      <View style={{ height: 24 }} />
      <PrimaryButton label="Devam" pulse={false} onPress={onContinue} />
    </View>
  );
}

function ErrorView({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.errorBox}>
      <Text style={styles.errorEmoji}>📡</Text>
      <Text style={styles.errorTitle}>Bağlanılamadı</Text>
      <Text style={styles.errorMsg}>{message}</Text>
      <View style={{ height: 16 }} />
      <PrimaryButton label="Tekrar dene" pulse={false} onPress={onRetry} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.pitch.deep },
  loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  errorBox: { alignItems: 'center', paddingHorizontal: 24 },
  errorEmoji: { fontSize: 48, marginBottom: 8 },
  errorTitle: { color: colors.text.primary, fontSize: 20, fontWeight: '900' },
  errorMsg: { color: colors.text.muted, fontSize: 14, textAlign: 'center', marginTop: 6, lineHeight: 20 },
  phaseRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  phaseChip: { color: colors.accent.goldHi, fontSize: 36, fontWeight: '900', letterSpacing: 3 },
  phaseSub: { color: colors.text.muted, fontSize: 16, textAlign: 'center', marginTop: 12 },
});
