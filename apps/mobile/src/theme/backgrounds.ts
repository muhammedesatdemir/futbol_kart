/**
 * 9:16 sahne arka planları (assets/bg). Her sahne anahtarına bir görsel eşlenir.
 * Görseller AI ile üretildi (dramatik stadyum + neon enerji + altın aydınlatma).
 *
 * require() statik olmalı (Metro asset çözünürlüğü) — bu yüzden tek tek listelenir.
 */
export const backgrounds = {
  home: require('../../assets/bg/1_mobil_ana_sayfa.png'),
  mode: require('../../assets/bg/2_mobile_mode_secme.png'),
  pick: require('../../assets/bg/3_mobile_kart_secme.png'),
  handoff: require('../../assets/bg/4_mobile_oyuncu_degisim.png'),
  duel: require('../../assets/bg/5_mobile_duello.png'),
  result: require('../../assets/bg/6_mobile_sonuclar.png'),
} as const;

export type BackgroundKey = keyof typeof backgrounds;
