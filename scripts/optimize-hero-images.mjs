#!/usr/bin/env node
/**
 * Hero / sahne arka plan görsellerini PNG → WebP'ye dönüştürür.
 *
 * Kullanım:
 *   pnpm exec node scripts/optimize-hero-images.mjs
 *
 * Hedef:
 *   - Kalite kaybı çıplak gözle görünmeyen ~88 quality WebP
 *   - 2200px max width (background, retina'ya kadar yeter)
 *   - jpg fallback (eski tarayıcılar için, ~70 quality)
 *
 * Çıktı:
 *   public/hero/*.webp  (modern, küçük)
 *   public/hero/*.jpg   (fallback, sadece eski tarayıcılar için)
 *   Orijinal .png'ler dokunulmaz — silmek için ayrı bir flag gerek.
 */
import { readdir, stat } from 'node:fs/promises';
import { join, parse } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const HERO_DIR = join(__dirname, '..', 'apps', 'web', 'public', 'hero');

const MAX_WIDTH = 2200;
const WEBP_QUALITY = 88;
const JPG_QUALITY = 70;

function fmtBytes(n) {
  if (n > 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  if (n > 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

async function main() {
  const entries = await readdir(HERO_DIR);
  const pngs = entries.filter((f) => f.toLowerCase().endsWith('.png'));

  if (pngs.length === 0) {
    console.error(`No PNG found in ${HERO_DIR}`);
    process.exit(1);
  }

  console.log(`Optimizing ${pngs.length} PNG(s) from ${HERO_DIR}\n`);

  let totalOriginal = 0;
  let totalWebp = 0;
  let totalJpg = 0;

  for (const file of pngs) {
    const srcPath = join(HERO_DIR, file);
    const base = parse(file).name;
    const webpPath = join(HERO_DIR, `${base}.webp`);
    const jpgPath = join(HERO_DIR, `${base}.jpg`);

    const srcStat = await stat(srcPath);
    totalOriginal += srcStat.size;

    const img = sharp(srcPath).resize({
      width: MAX_WIDTH,
      withoutEnlargement: true,
    });

    // WebP — primary
    await img
      .clone()
      .webp({ quality: WEBP_QUALITY, effort: 5 })
      .toFile(webpPath);
    const webpStat = await stat(webpPath);
    totalWebp += webpStat.size;

    // JPG — fallback (eski tarayıcılar)
    await img.clone().jpeg({ quality: JPG_QUALITY, mozjpeg: true }).toFile(jpgPath);
    const jpgStat = await stat(jpgPath);
    totalJpg += jpgStat.size;

    const webpSaving = ((1 - webpStat.size / srcStat.size) * 100).toFixed(1);
    console.log(
      `  ${file.padEnd(30)} ${fmtBytes(srcStat.size).padStart(10)}  →  webp ${fmtBytes(webpStat.size).padStart(10)} (-${webpSaving}%)  ·  jpg ${fmtBytes(jpgStat.size).padStart(10)}`,
    );
  }

  console.log('\nTotal:');
  console.log(`  original PNG: ${fmtBytes(totalOriginal)}`);
  console.log(
    `  webp:         ${fmtBytes(totalWebp)}  (${((1 - totalWebp / totalOriginal) * 100).toFixed(1)}% küçülme)`,
  );
  console.log(
    `  jpg fallback: ${fmtBytes(totalJpg)}  (${((1 - totalJpg / totalOriginal) * 100).toFixed(1)}% küçülme)`,
  );
  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
