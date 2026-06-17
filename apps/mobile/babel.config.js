// babel-preset-expo: Expo runtime'ı (Hermes/JSC), TypeScript ve JSX dönüşümlerini
// içerir. Workspace paketlerimizdeki ham TS de bu preset ile transpile edilir.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
