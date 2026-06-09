'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useSoundStore } from '@/lib/soundStore';

/** Ses olayları → dosya adı (public/sfx/<name>.mp3). */
export type SfxName =
  | 'flip'
  | 'win'
  | 'tie'
  | 'final'
  | 'heartbreak'
  | 'whistleStart' // maç/kapışma başı hakem düdüğü (bir kez, ilk round/draft)
  | 'whistleEnd' // maç sonu kısa bitiş düdüğü (fanfardan hemen önce)
  | 'matchFound' // online "rakip bulundu" anı
  | 'tick' // geri sayım son saniyeler (aciliyet)
  | 'joker'; // joker aktivasyonu (power-up)

const SFX_SRC: Record<SfxName, string> = {
  flip: '/sfx/card-flip.mp3',
  win: '/sfx/round-win.mp3',
  tie: '/sfx/round-tie.mp3',
  final: '/sfx/final-fanfare.mp3',
  heartbreak: '/sfx/heart_break.mp3', // Liste Doldur — can kaybı (cam kırılması)
  whistleStart: '/sfx/match-start-whistle.mp3',
  whistleEnd: '/sfx/match-end-whistle.mp3',
  matchFound: '/sfx/match-found.mp3',
  tick: '/sfx/countdown-tick.mp3',
  joker: '/sfx/joker-activate.mp3',
};

/** Olay başına ses seviyesi (fanfar diğerlerinden biraz daha yüksek). */
const SFX_VOLUME: Record<SfxName, number> = {
  flip: 0.35,
  win: 0.5,
  tie: 0.3,
  final: 0.6,
  heartbreak: 0.5,
  whistleStart: 0.55,
  whistleEnd: 0.5,
  matchFound: 0.55,
  tick: 0.3, // her saniye çalacağı için kısık tutuldu
  joker: 0.5,
};

/**
 * Hafif SFX çalıcı — native HTMLAudioElement, bağımlılık yok.
 *
 * - Ses store'da KAPALIYsa hiçbir şey çalmaz (ve preload etmez).
 * - Her ses için tek Audio instance havuzlanır; tekrar çalmak için currentTime=0.
 * - Asset eksikse (henüz üretilmediyse) sessizce yutulur — oyun akışı bozulmaz.
 * - Çalma kullanıcı etkileşimi sonrası tetiklendiği için autoplay kısıtına takılmaz.
 */
export function useSfx() {
  const enabled = useSoundStore((s) => s.enabled);
  const poolRef = useRef<Partial<Record<SfxName, HTMLAudioElement>>>({});

  // Ses açıkken ses dosyalarını hazırla (kapalıyken hiç indirme).
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    const pool = poolRef.current;
    (Object.keys(SFX_SRC) as SfxName[]).forEach((name) => {
      if (!pool[name]) {
        const audio = new Audio(SFX_SRC[name]);
        audio.preload = 'auto';
        audio.volume = SFX_VOLUME[name];
        pool[name] = audio;
      }
    });
  }, [enabled]);

  return useCallback(
    (name: SfxName) => {
      if (!useSoundStore.getState().enabled) return;
      if (typeof window === 'undefined') return;
      const pool = poolRef.current;
      let audio = pool[name];
      if (!audio) {
        audio = new Audio(SFX_SRC[name]);
        audio.volume = SFX_VOLUME[name];
        pool[name] = audio;
      }
      try {
        audio.currentTime = 0;
        void audio.play().catch(() => {
          /* asset yok / autoplay reddi — sessizce yut */
        });
      } catch {
        /* no-op */
      }
    },
    [],
  );
}
