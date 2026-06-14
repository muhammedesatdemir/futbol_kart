/* Tek seferlik doğrulama: quizMode gerçek players.json üzerinde sağlıklı tur üretiyor mu? */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Player } from '@futbol-kart/shared-types';
import {
  buildQuizRounds,
  isMarquee,
  metricByKey,
  metricValue,
  evaluateQuizPick,
  botPick,
  QUIZ_ROUNDS,
  QUIZ_METRICS,
} from '../src/lib/quizMode';
import { createPRNG } from '@futbol-kart/game-engine';

const players = JSON.parse(
  readFileSync(join(process.cwd(), 'public', 'data', 'players.json'), 'utf8'),
) as Player[];

const marquee = players.filter(isMarquee);
console.log(`Toplam oyuncu: ${players.length}, marquee: ${marquee.length}`);
const byPos = { GK: 0, DEF: 0, MID: 0, FWD: 0 } as Record<string, number>;
for (const p of marquee) byPos[p.position]++;
console.log('Marquee pozisyon dağılımı:', byPos);
console.log(`Kullanılabilir metrik: ${QUIZ_METRICS.length}`);

// 200 farklı maç simüle et: her tur belirgin mi, 4 farklı oyuncu mu, değerler dolu mu?
let totalRounds = 0;
let deadTurns = 0; // belirginlik şartı ihlali (olmamalı)
let dupTurns = 0; // 4'te tekrar oyuncu (olmamalı)
let posMixTurns = 0; // pozisyon-bağımlı metrikte pozisyon karışık (olmamalı)
let shortMatches = 0; // QUIZ_ROUNDS'tan az tur (havuz yetmedi)
const metricUse: Record<string, number> = {};
const botCorrect = { n: 0, correct: 0 };

for (let m = 0; m < 200; m++) {
  const rounds = buildQuizRounds(`seed-${m}`, players);
  if (rounds.length < QUIZ_ROUNDS) shortMatches++;
  for (const r of rounds) {
    totalRounds++;
    metricUse[r.metricKey] = (metricUse[r.metricKey] ?? 0) + 1;
    const field = metricByKey(r.metricKey)!;
    // 4 farklı oyuncu
    if (new Set(r.choiceIds).size !== r.choiceIds.length) dupTurns++;
    // değerler dolu + correctIndex doğru
    const top = Math.max(...r.values);
    const second = [...r.values].sort((a, b) => b - a)[1]!;
    if (!(top >= second * 1.15 && top - second >= 2)) deadTurns++;
    if (r.values[r.correctIndex] !== top) deadTurns++;
    // pozisyona bağlı metrikte pozisyon birliği
    if (field.positionFilterable) {
      const positions = new Set(r.choiceIds.map((id) => players.find((p) => p.id === id)!.position));
      if (positions.size > 1) posMixTurns++;
    }
    // bot makul mü (skill 0.62 → ~%60+ doğru beklenir)
    const prng = createPRNG(`bot-${m}-${r.metricKey}`);
    const bi = botPick(r, () => prng.next(), 0.62);
    botCorrect.n++;
    if (evaluateQuizPick(r, [bi]).correct) botCorrect.correct++;
  }
}

console.log('\n=== SONUÇ ===');
console.log(`Üretilen tur: ${totalRounds} (200 maç × ${QUIZ_ROUNDS})`);
console.log(`Kısa maç (havuz yetmedi): ${shortMatches}`);
console.log(`Belirginlik ihlali (0 olmalı): ${deadTurns}`);
console.log(`Tekrar oyuncu (0 olmalı): ${dupTurns}`);
console.log(`Pozisyon karışık [poz-bağımlı] (0 olmalı): ${posMixTurns}`);
console.log(`Bot isabet: ${botCorrect.correct}/${botCorrect.n} = ${((botCorrect.correct / botCorrect.n) * 100).toFixed(0)}%`);
console.log('Metrik kullanım dağılımı:', metricUse);

// Örnek bir tur yazdır (insan gözüyle adillik kontrolü)
const sample = buildQuizRounds('demo-print', players)[0]!;
const f = metricByKey(sample.metricKey)!;
console.log(`\nÖrnek tur — "${f.shortLabel}":`);
for (let i = 0; i < sample.choiceIds.length; i++) {
  const p = players.find((x) => x.id === sample.choiceIds[i])!;
  const mark = i === sample.correctIndex ? ' 👑' : '';
  console.log(`  ${p.displayName} (${p.position}): ${sample.values[i]} ${f.unit}${mark}`);
}
const keep = sample.fiftyKeepIndexes.map((i) => players.find((x) => x.id === sample.choiceIds[i])!.displayName);
console.log(`  %50 sonrası kalan: ${keep.join(' + ')}`);
