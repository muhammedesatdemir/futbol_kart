// Expo SDK 56 — pnpm monorepo Metro config.
//
// Expo, SDK 52+ ile monorepo'yu büyük ölçüde OTOMATİK yapılandırır (watchFolders +
// nodeModulesPaths). Buradaki tek elle eklenen şey: workspace paketlerimiz
// (@futbol-kart/game-engine, shared-types, question-templates) package.json'larında
// HAM TypeScript export ediyor ("main": "./src/index.ts" — derlenmiş JS değil).
//
// Modern Expo Metro + babel-preset-expo bu ham TS'i symlink üzerinden transpile
// edebiliyor; yine de monorepo kökünü açıkça izleyip (watchFolders) kök
// node_modules'ü çözünürlüğe ekleyerek garanti altına alıyoruz. Eğer ileride bir
// paket transpile edilmezse, çözüm Bölüm 2 (MOBIL-YOL-HARITASI.md): resolver
// üzerinden açık transpile, ama varsayılan yeterli olmalı.

const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Monorepo kökünü izle — workspace paketlerindeki değişiklikler hot-reload olsun.
config.watchFolders = [monorepoRoot];

// 2. Hem uygulamanın hem kökün node_modules'ünü çözünürlüğe ekle (pnpm symlink yapısı).
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// NOT: unstable_enableSymlinks KALDIRILDI — Expo SDK 56 Metro'su symlink'leri zaten
// otomatik çözüyor (expo-doctor bunu gereksiz override olarak işaretliyordu).

module.exports = config;
