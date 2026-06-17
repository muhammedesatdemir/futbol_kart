// babel-preset-expo: Expo runtime'ı (Hermes), TypeScript ve JSX dönüşümlerini
// içerir. Workspace paketlerimizdeki ham TS de bu preset ile transpile edilir.
//
// react-native-worklets/plugin: Reanimated 4 worklet'lerini (UI thread'de çalışan
// animasyon fonksiyonları) derler. EN SONDA olmalı — Reanimated dokümanı kuralı.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-worklets/plugin'],
  };
};
