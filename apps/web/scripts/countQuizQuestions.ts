/* Kaç ÇEŞİT soru var? metrik × (pozisyon-filtreli ise 4 poz). Gerçek havuzla
 * hangi (metrik+poz) kombinasyonu fiilen GEÇERLİ tur üretebiliyor ölç. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Player, Position } from '@futbol-kart/shared-types';
import { QUIZ_METRICS, isMarquee, metricValue, quizPhrase, positionGroupLabel } from '../src/lib/quizMode';

const players = (JSON.parse(
  readFileSync(join(process.cwd(), 'public', 'data', 'players.json'), 'utf8'),
) as Player[]);

const POS: Position[] = ['GK', 'DEF', 'MID', 'FWD'];

// Bir (metrik, poz) kombinasyonu yeterli aday içeriyor mu? (en az ~6 → tur kurulabilir)
function viable(field: typeof QUIZ_METRICS[number], group: Position | null): number {
  return players.filter((p) => {
    if (!isMarquee(p)) return false;
    if (group !== null && p.position !== group) return false;
    const v = metricValue(field, p);
    return v !== null && v > 0;
  }).length;
}

let nominalTotal = 0; // teorik (poz-filtreli → ×4)
let viableTotal = 0; // gerçekte tur üretebilen (≥6 aday)
const lines: string[] = [];

for (const f of QUIZ_METRICS) {
  if (f.positionFilterable) {
    nominalTotal += 4;
    const ok: string[] = [];
    for (const pos of POS) {
      const n = viable(f, pos);
      if (n >= 6) { viableTotal++; ok.push(`${positionGroupLabel(pos)}(${n})`); }
    }
    lines.push(`${f.shortLabel.padEnd(22)} [poz] → ${ok.join(', ')}`);
  } else {
    nominalTotal += 1;
    const n = viable(f, null);
    const ok = n >= 6;
    if (ok) viableTotal++;
    lines.push(`${f.shortLabel.padEnd(22)} [genel] → ${n} aday ${ok ? '✓' : '✗'}`);
  }
}

console.log('=== Metrik dökümü ===');
lines.forEach((l) => console.log('  ' + l));
console.log('\n=== TOPLAM SORU ÇEŞİDİ ===');
console.log(`Metrik sayısı: ${QUIZ_METRICS.length}`);
console.log(`Teorik kombinasyon (poz-filtreli ×4): ${nominalTotal}`);
console.log(`GERÇEK üretilebilir soru çeşidi (≥6 aday): ${viableTotal}`);
console.log(`Maç başına 7 tur → ${viableTotal} çeşitten 7'si (her maç farklı kombinasyon).`);
