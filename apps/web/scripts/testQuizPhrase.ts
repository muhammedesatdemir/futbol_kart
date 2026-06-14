/* Doğrulama: ifade Türkçe okunuşu + maç-içi/cross-maç çeşitlilik. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Player } from '@futbol-kart/shared-types';
import { buildQuizRounds, quizPhrase, positionGroupLabel, metricByKey } from '../src/lib/quizMode';

const players = JSON.parse(
  readFileSync(join(process.cwd(), 'public', 'data', 'players.json'), 'utf8'),
) as Player[];

function q(metricKey: string, group: string | null): string {
  const p = quizPhrase(metricKey);
  const ctx = positionGroupLabel(group as never);
  const pre = ctx ? `${ctx[0]!.toLocaleUpperCase('tr-TR')}${ctx.slice(1)} arasında ` : '';
  return `${pre}hangisinin ${p.question} ${p.most}?`;
}

console.log('=== Örnek soru ifadeleri (her metrik) ===');
for (const f of [
  'goals', 'trophies', 'value', 'awards', 'caps', 'height', 'career', 'seasongoals', 'uclapps',
]) {
  console.log(`  ${f.padEnd(12)} → ${q(f, null)}`);
}
console.log('\n=== Pozisyon bağlamlı ===');
console.log('  ' + q('goals', 'FWD'));
console.log('  ' + q('goals', 'DEF'));
console.log('  ' + q('height', 'GK'));

// Maç-içi çeşitlilik: bir maçta kaç FARKLI (metrik+poz) soru var?
let minDistinct = 99;
let posCtxRounds = 0;
let totalRounds = 0;
const crossMatchMetricFirst: string[] = [];
for (let m = 0; m < 30; m++) {
  const rounds = buildQuizRounds(`vary-${m}`, players);
  const keys = rounds.map((r) => (r.positionGroup ? `${r.metricKey}:${r.positionGroup}` : r.metricKey));
  minDistinct = Math.min(minDistinct, new Set(keys).size);
  posCtxRounds += rounds.filter((r) => r.positionGroup).length;
  totalRounds += rounds.length;
  crossMatchMetricFirst.push(rounds[0]!.metricKey);
}
console.log('\n=== Çeşitlilik (30 maç) ===');
console.log(`Maç-içi en az farklı soru sayısı (7 turda): ${minDistinct}/7 (yüksek = iyi)`);
console.log(`Pozisyon-bağlamlı tur oranı: ${((posCtxRounds / totalRounds) * 100).toFixed(0)}%`);
console.log(`İlk tur metriği (30 maç, tekrar olmamalı çok): ${crossMatchMetricFirst.slice(0, 15).join(', ')}`);
console.log(`İlk tur metrik çeşidi: ${new Set(crossMatchMetricFirst).size}/30 farklı`);

// Örnek bir maçın 7 sorusu
console.log('\n=== Örnek maç (7 tur) ===');
const sample = buildQuizRounds('demo-vary', players);
for (const r of sample) {
  const f = metricByKey(r.metricKey)!;
  console.log(`  ${q(r.metricKey, r.positionGroup)}  [${f.unit}]`);
}
