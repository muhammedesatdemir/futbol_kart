/* Doğrulama: metrik×filtre×pozisyon → kaç FARKLI viable soru + 0 ölü tur + ifade. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Player, Position } from '@futbol-kart/shared-types';
import {
  buildQuizRounds, quizPhrase, quizContextLabel, metricByKey,
  QUIZ_METRICS, QUIZ_FILTERS, isMarquee, metricValue,
} from '../src/lib/quizMode';

const players = JSON.parse(
  readFileSync(join(process.cwd(), 'public', 'data', 'players.json'), 'utf8'),
) as Player[];

const POS: (Position | null)[] = [null, 'GK', 'DEF', 'MID', 'FWD'];

// Bir (metrik, poz, filtre) kombinasyonu geçerli tur üretebilir mi? (havuz ≥6 + belirginlik şansı)
function viableCount(metricKey: string, group: Position | null, filterKey: string | null): number {
  const f = metricByKey(metricKey)!;
  const flt = filterKey ? QUIZ_FILTERS.find((x) => x?.key === filterKey) ?? null : null;
  let n = 0;
  for (const p of players) {
    if (!isMarquee(p)) continue;
    if (group && p.position !== group) continue;
    if (flt && !flt.test(p)) continue;
    const v = metricValue(f, p);
    if (v !== null && v > 0) n++;
  }
  return n;
}

// Teorik enumerasyon: kaç (metrik+poz+filtre) kombinasyonu ≥6 aday içeriyor?
let viable = 0;
const POOL_MIN = 6;
for (const m of QUIZ_METRICS) {
  const groups = m.positionFilterable ? POS : [null];
  for (const g of groups) {
    for (const flt of QUIZ_FILTERS) {
      const fk = flt?.key ?? null;
      if (viableCount(m.key, g, fk) >= POOL_MIN) viable++;
    }
  }
}
console.log(`Metrik: ${QUIZ_METRICS.length}, filtre ekseni: ${QUIZ_FILTERS.length} (null dahil)`);
console.log(`≥${POOL_MIN} adaylı (metrik×poz×filtre) kombinasyon: ${viable}`);

// Pratik: 500 maç simüle et — gerçekte üretilen FARKLI soru-kimliği + ölü tur var mı?
const seen = new Set<string>();
let dead = 0, dup = 0, short = 0, total = 0;
for (let i = 0; i < 500; i++) {
  const rounds = buildQuizRounds(`v${i}`, players);
  if (rounds.length < 7) short++;
  for (const r of rounds) {
    total++;
    seen.add(`${r.metricKey}|${r.positionGroup ?? ''}|${r.filterKey ?? ''}`);
    if (new Set(r.choiceIds).size !== 4) dup++;
    const top = Math.max(...r.values);
    const second = [...r.values].sort((a, b) => b - a)[1]!;
    if (!(top >= second * 1.15 && top - second >= 2)) dead++;
  }
}
console.log(`\n500 maç simülasyonu (${total} tur):`);
console.log(`  Üretilen FARKLI soru-kimliği: ${seen.size}`);
console.log(`  Ölü tur (belirginlik ihlali): ${dead} (0 olmalı)`);
console.log(`  Tekrar oyuncu: ${dup} (0 olmalı)`);
console.log(`  Kısa maç (<7 tur): ${short} (0 olmalı)`);

// Örnek bir maçın 7 sorusu (ifade kontrolü)
console.log('\n=== Örnek maç ifadeleri ===');
for (const r of buildQuizRounds('demo-final', players)) {
  const p = quizPhrase(r.metricKey);
  const ctx = quizContextLabel(r.filterKey, r.positionGroup);
  const pre = ctx ? `${ctx[0]!.toLocaleUpperCase('tr-TR')}${ctx.slice(1)} arasında hangisinin` : 'Hangisinin';
  console.log(`  ${pre} ${p.question} ${p.most}?`);
}
