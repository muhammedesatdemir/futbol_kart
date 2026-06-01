'use client';

import { AnimatePresence, motion } from 'framer-motion';
import type { GamePhase, Scene } from '@/lib/sessionMachine';

/**
 * Oyun sahnesine göre fixed full-bleed arka plan.
 * - Sahne değiştikçe görsel cross-fade ile değişir
 * - Üstte overlay (vinyet + sıcak/soğuk ton) okunaklığı korur
 * - pointer-events: none — etkileşim engellenmez
 * - position: fixed — scroll'la birlikte sabit kalır
 *
 * z-stack:
 *   body (opak yeşil base) → SceneBackground görsel (z-0) →
 *   overlay (z-[1]) → <main> içerik (z-10)
 *
 * Negatif z-index KULLANMIYORUZ çünkü body opak arka plana sahip,
 * negatif z-index body'nin arkasına düşüp görünmez kalır.
 */

interface SceneBackgroundProps {
  scene: Scene;
  phase: GamePhase;
}

type BgKey = 'mode' | 'pick' | 'handoff' | 'round' | 'final';

const SCENE_TO_BG: Record<Scene, BgKey> = {
  MODE_SELECT: 'mode',
  CARD_PICK_P1: 'pick',
  CARD_PICK_P2: 'pick',
  HANDOFF: 'handoff',
  BONUS_ASSIGN: 'handoff',
  ROUND_INTRO: 'round',
  ROUND_PLAY: 'round',
  ROUND_REVEAL: 'round',
  ROUND_RESULT: 'round',
  PHASE_TRANSITION: 'handoff',
  FINAL: 'final',
};

const BG_IMAGES: Record<BgKey, string> = {
  mode: '/hero/scene-mode.webp',
  pick: '/hero/scene-pick.webp',
  handoff: '/hero/scene-handoff.webp',
  round: '/hero/scene-round.webp',
  final: '/hero/scene-final.webp',
};

/** Sahne başına özel `background-position`. Pick sahnesinde "center top" daha iyi duruyor. */
const BG_POSITION: Record<BgKey, string> = {
  mode: 'center',
  pick: 'center top',
  handoff: 'center',
  round: 'center',
  final: 'center',
};

export function SceneBackground({ scene, phase }: SceneBackgroundProps) {
  const bgKey = SCENE_TO_BG[scene];
  const isFinal = bgKey === 'final';

  // Round sahnesinde overlay biraz daha koyu (metin/sayı okunaklığı için).
  // Final sahnesinde sıcak altın tonu daha güçlü.
  const isRoundLike =
    bgKey === 'round' || phase === 'extra' || phase === 'sudden';

  return (
    <>
      {/* Görsel katmanı — sahneye göre cross-fade. z-0 (body üstünde, content altında) */}
      <div
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
        aria-hidden
      >
        <AnimatePresence>
          <motion.div
            key={bgKey}
            initial={{ opacity: 0, scale: 1.03 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 bg-cover bg-no-repeat"
            style={{
              backgroundImage: `url('${BG_IMAGES[bgKey]}')`,
              backgroundPosition: BG_POSITION[bgKey],
            }}
          />
        </AnimatePresence>
      </div>

      {/* Overlay katmanı — sabit, sahneye göre ton. z-[1] (görselin üstünde, content altında) */}
      <div
        className="pointer-events-none fixed inset-0 z-[1]"
        aria-hidden
        style={{
          background: buildOverlay({ isFinal, isRoundLike }),
        }}
      />
    </>
  );
}

function buildOverlay({
  isFinal,
  isRoundLike,
}: {
  isFinal: boolean;
  isRoundLike: boolean;
}): string {
  // Final: sıcak altın tonu güçlü, kupa atmosferi
  if (isFinal) {
    return [
      'radial-gradient(ellipse 90% 60% at 50% 35%, rgba(255,200,90,0.18), transparent 55%)',
      'radial-gradient(ellipse 100% 100% at 50% 50%, transparent 40%, rgba(0,0,0,0.55) 100%)',
      'linear-gradient(to bottom, rgba(0,0,0,0.35), rgba(2,22,14,0.78))',
    ].join(', ');
  }
  // Round: daha koyu overlay — metin/sayı okunaklığı
  if (isRoundLike) {
    return [
      'radial-gradient(circle at center, rgba(255,211,90,0.08), transparent 35%)',
      'radial-gradient(ellipse 100% 100% at 50% 50%, transparent 35%, rgba(0,0,0,0.6) 100%)',
      'linear-gradient(to bottom, rgba(0,0,0,0.6), rgba(2,22,14,0.88))',
    ].join(', ');
  }
  // Mode/pick/handoff: dengeli koyu, atmosfer canlı kalsın
  return [
    'radial-gradient(circle at center, rgba(255,211,90,0.10), transparent 35%)',
    'radial-gradient(ellipse 100% 100% at 50% 50%, transparent 45%, rgba(0,0,0,0.45) 100%)',
    'linear-gradient(to bottom, rgba(0,0,0,0.45), rgba(2,22,14,0.78))',
  ].join(', ');
}
