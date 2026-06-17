import { useMemo } from 'react';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { useSoundStore } from './soundStore';

/** Ses olayları → asset. Web karşılığı: apps/web/src/lib/useSfx.ts */
export type SfxName =
  | 'flip'
  | 'win'
  | 'tie'
  | 'final'
  | 'heartbreak'
  | 'whistleStart'
  | 'whistleEnd'
  | 'matchFound'
  | 'tick'
  | 'joker';

// require() statik olmalı (Metro). goal.mp4 ayrı (video efekti) — burada yok.
const SFX_SRC: Record<SfxName, number> = {
  flip: require('../../assets/sfx/card-flip.mp3'),
  win: require('../../assets/sfx/round-win.mp3'),
  tie: require('../../assets/sfx/round-tie.mp3'),
  final: require('../../assets/sfx/final-fanfare.mp3'),
  heartbreak: require('../../assets/sfx/heart_break.mp3'),
  whistleStart: require('../../assets/sfx/match-start-whistle.mp3'),
  whistleEnd: require('../../assets/sfx/match-end-whistle.mp3'),
  matchFound: require('../../assets/sfx/match-found.mp3'),
  tick: require('../../assets/sfx/countdown-tick.mp3'),
  joker: require('../../assets/sfx/joker-activate.mp3'),
};

const SFX_VOLUME: Record<SfxName, number> = {
  flip: 0.35,
  win: 0.5,
  tie: 0.3,
  final: 0.6,
  heartbreak: 0.5,
  whistleStart: 0.55,
  whistleEnd: 0.5,
  matchFound: 0.55,
  tick: 0.3,
  joker: 0.5,
};

export interface SfxPlayer {
  (name: SfxName): void;
  loop: (name: SfxName) => void;
  stop: (name: SfxName) => void;
}

// Havuz modül seviyesinde — her ses için tek AudioPlayer, tekrar tekrar kullanılır.
// Hook her render'da yeni player yaratmasın diye component dışında tutulur.
const pool: Partial<Record<SfxName, AudioPlayer>> = {};

function ensure(name: SfxName): AudioPlayer | null {
  let player = pool[name];
  if (!player) {
    try {
      player = createAudioPlayer(SFX_SRC[name]);
      player.volume = SFX_VOLUME[name];
      pool[name] = player;
    } catch {
      return null; // asset yok / oluşturulamadı — sessizce yut
    }
  }
  return player;
}

/**
 * Hafif SFX çalıcı (expo-audio). Web'le AYNI API yüzeyi:
 *   playSfx(name)        → tek atış
 *   playSfx.loop(name)   → döngülü başlat (tik-tak gibi)
 *   playSfx.stop(name)   → durdur + başa sar
 *
 * Ses store'da kapalıysa hiçbir şey çalmaz. Asset/oynatma hatası sessizce yutulur
 * → oyun akışı asla bozulmaz.
 */
export function useSfx(): SfxPlayer {
  return useMemo<SfxPlayer>(() => {
    const play = ((name: SfxName) => {
      if (!useSoundStore.getState().enabled) return;
      const player = ensure(name);
      if (!player) return;
      try {
        player.loop = false;
        player.seekTo(0);
        player.play();
      } catch {
        /* no-op */
      }
    }) as SfxPlayer;

    play.loop = (name: SfxName) => {
      if (!useSoundStore.getState().enabled) return;
      const player = ensure(name);
      if (!player) return;
      try {
        if (player.loop && player.playing) return; // zaten döngüde
        player.loop = true;
        player.seekTo(0);
        player.play();
      } catch {
        /* no-op */
      }
    };

    play.stop = (name: SfxName) => {
      const player = pool[name];
      if (!player) return;
      try {
        player.pause();
        player.loop = false;
        player.seekTo(0);
      } catch {
        /* no-op */
      }
    };

    return play;
  }, []);
}
