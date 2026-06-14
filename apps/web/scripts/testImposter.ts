/* İmposter doğrulama: gizli havuz + ipucu çeşitliliği + ifşa koruması (gerçek veri). */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Player } from '@futbol-kart/shared-types';
import { isFamousPlayer, pickSecretPlayer, buildClue, secretNameTokens } from '../src/lib/imposterMode';

const players = JSON.parse(
  readFileSync(join(process.cwd(), 'public', 'data', 'players.json'), 'utf8'),
) as Player[];

const pool = players.filter(isFamousPlayer);
console.log(`Gizli futbolcu havuzu (isFamousPlayer): ${pool.length}`);
const byPos = { GK: 0, DEF: 0, MID: 0, FWD: 0 } as Record<string, number>;
for (const p of pool) byPos[p.position]++;
console.log('Pozisyon dağılımı:', byPos);

// İpucu çeşitliliği: 2000 farklı maçta hangi eksenler/kelimeler çıkıyor?
const axisCount: Record<string, number> = {};
const wordCount: Record<string, number> = {};
for (let i = 0; i < 2000; i++) {
  const secret = pickSecretPlayer(`m${i}`, players)!;
  const clue = buildClue(`m${i}`, secret);
  axisCount[clue.axis] = (axisCount[clue.axis] ?? 0) + 1;
  wordCount[clue.word] = (wordCount[clue.word] ?? 0) + 1;
}
console.log('\nİpucu EKSEN dağılımı (2000 maç):', axisCount);
console.log('İpucu KELİME çeşidi:', Object.keys(wordCount).length, 'farklı kelime');
console.log('En sık ipucu kelimeleri:',
  Object.entries(wordCount).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([w, c]) => `${w}(${c})`).join(', '));

// İfşa koruması: her ipucu kelimesi KAÇ famous oyuncuya uyuyor? (düşükse ifşa eder)
// Pozisyon/ülke/dönem/kupa/fiziksel — kelimeye göre eşleşen havuz sayısı.
function matchCount(word: string): number {
  return pool.filter((p) => {
    const tr = p.achievements.trophies;
    switch (word) {
      case 'Kaleci': return p.position === 'GK';
      case 'Defans oyuncusu': return p.position === 'DEF';
      case 'Orta saha oyuncusu': return p.position === 'MID';
      case 'Forvet': return p.position === 'FWD';
      case 'Hâlâ aktif': return p.isActive;
      case 'Emekli efsane': return !p.isActive;
      case 'Brezilyalı': return p.nationalityCode === 'BR';
      case 'Arjantinli': return p.nationalityCode === 'AR';
      case 'Alman': return p.nationalityCode === 'DE';
      case 'Fransız': return p.nationalityCode === 'FR';
      case 'İspanyol': return p.nationalityCode === 'ES';
      case 'İtalyan': return p.nationalityCode === 'IT';
      case 'İngiliz': return p.nationalityCode === 'EN';
      case 'Şampiyonlar Ligi şampiyonu': return (tr?.uclTitles ?? 0) >= 1;
      case 'Dünya Kupası şampiyonu': return (tr?.worldCupTitles ?? 0) >= 1;
      case 'Uzun boylu': return typeof p.heightCm === 'number' && p.heightCm >= 190;
      case 'Kısa boylu': return typeof p.heightCm === 'number' && p.heightCm > 0 && p.heightCm <= 172;
      case 'Solak': return p.preferredFoot === 'L';
      default: return false;
    }
  }).length;
}
console.log('\n=== İFŞA KORUMASI (her ipucu kelimesi kaç famous oyuncuya uyuyor) ===');
const allWords = Object.keys(wordCount);
let minMatch = Infinity;
for (const w of allWords.sort()) {
  const n = matchCount(w);
  minMatch = Math.min(minMatch, n);
  const flag = n < 20 ? ' ⚠️ DAR' : '';
  console.log(`  ${w.padEnd(30)} → ${n} oyuncu${flag}`);
}
console.log(`\nEn dar ipucu kelimesi: ${minMatch} oyuncu (≥20 ideal — blöfe alan bırakır, ifşa etmez)`);

// Yasak kelime token örneği
const sample = pickSecretPlayer('demo', players)!;
console.log(`\nÖrnek gizli futbolcu: ${sample.displayName} → yasak token'lar:`, secretNameTokens(sample));
const sclue = buildClue('demo', sample);
console.log(`Bu oyuncunun ipucusu (seed 'demo'): "${sclue.word}" (eksen: ${sclue.axis})`);
