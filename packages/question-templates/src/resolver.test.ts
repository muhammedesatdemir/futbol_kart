import { describe, expect, it } from 'vitest';
import { computeValue, resolveRound, templateApplicable } from './resolver';
import { templateById, TEMPLATES } from './templates';
import { haversineKm, ISTANBUL } from './geo';
import {
  countLetter,
  countVowels,
  hasTurkishChar,
  isPalindrome,
  isPrime,
  nameLetterCount,
} from './util';
import {
  fixtureContext,
  fixtureCR7,
  fixtureMessi,
  fixtureRonaldinho,
} from './test-fixtures';

describe('templates load', () => {
  it('loads at least 80 templates from JSON', () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(80);
  });

  it('every template has Turkish title + formula', () => {
    for (const t of TEMPLATES) {
      expect(t.title.tr, t.id).toBeTruthy();
      expect(t.formula?.tr, t.id).toBeTruthy();
    }
  });

  it('every template has unique id', () => {
    const ids = new Set<string>();
    for (const t of TEMPLATES) {
      expect(ids.has(t.id), `duplicate id: ${t.id}`).toBe(false);
      ids.add(t.id);
    }
  });

  it('no template uses "random" as a tiebreaker', () => {
    for (const t of TEMPLATES) {
      expect(t.tiebreakers, t.id).not.toContain('random');
    }
  });

  it('parametric templates declare params', () => {
    const paramTemplates = TEMPLATES.filter((t) => /\{\w+\}/.test(t.title.tr ?? ''));
    for (const t of paramTemplates) {
      expect(t.params, `template ${t.id} uses placeholder but has no params`).toBeDefined();
      expect(t.params!.length, t.id).toBeGreaterThan(0);
    }
  });
});

describe('util', () => {
  it('isPrime', () => {
    expect(isPrime(2)).toBe(true);
    expect(isPrime(7)).toBe(true);
    expect(isPrime(10)).toBe(false);
    expect(isPrime(1)).toBe(false);
  });

  it('countVowels + Türkçe', () => {
    expect(countVowels('Ronaldinho')).toBe(4);
    expect(countVowels('Şükür')).toBe(2); // ü, ü
    expect(nameLetterCount('Lionel Messi')).toBe(11);
  });

  it('countLetter', () => {
    expect(countLetter('Messi', 'm')).toBe(1);
    expect(countLetter('Messi', 's')).toBe(2);
    expect(countLetter('Cristiano Ronaldo', 'o')).toBe(3);
  });

  it('hasTurkishChar', () => {
    expect(hasTurkishChar('Şükür')).toBe(true);
    expect(hasTurkishChar('Çakır')).toBe(true);
    expect(hasTurkishChar('Messi')).toBe(false);
  });

  it('isPalindrome', () => {
    expect(isPalindrome('Ada')).toBe(true);
    expect(isPalindrome('Anna')).toBe(true);
    expect(isPalindrome('Messi')).toBe(false);
  });

  it('haversine returns positive km', () => {
    const d = haversineKm({ lat: 41.0, lng: 29.0 }, ISTANBUL);
    expect(d).toBeLessThan(20);
    const far = haversineKm({ lat: -30, lng: -51 }, ISTANBUL);
    expect(far).toBeGreaterThan(10000);
  });
});

describe('computeValue — sayısal', () => {
  it('n01_total_goals', () => {
    const t = templateById('n01_total_goals')!;
    expect(computeValue(t, fixtureMessi, fixtureContext)).toBe(850);
    expect(computeValue(t, fixtureCR7, fixtureContext)).toBe(920);
  });

  it('n12_jersey_sum', () => {
    const t = templateById('n12_jersey_sum')!;
    expect(computeValue(t, fixtureMessi, fixtureContext)).toBe(40); // 10+30
    expect(computeValue(t, fixtureRonaldinho, fixtureContext)).toBe(111); // 10+21+80
  });

  it('n25_club_count', () => {
    const t = templateById('n25_club_count')!;
    expect(computeValue(t, fixtureMessi, fixtureContext)).toBe(2);
    expect(computeValue(t, fixtureRonaldinho, fixtureContext)).toBe(3);
  });

  it('n17_total_goal_contribution', () => {
    const t = templateById('n17_total_goal_contribution')!;
    expect(computeValue(t, fixtureMessi, fixtureContext)).toBe(850 + 380);
  });

  it('n22_goal_per_match', () => {
    const t = templateById('n22_goal_per_match')!;
    const v = computeValue(t, fixtureMessi, fixtureContext) as number;
    expect(v).toBeCloseTo(850 / 1080, 3);
  });
});

describe('computeValue — boolean', () => {
  it('g20/g19 doğum kıtası — Ronaldinho (BR): G.Amerika true, Avrupa false', () => {
    // Fixture'da BR ülke kodlu kulüp (gremio, South America) var → eşleşir
    expect(computeValue(templateById('g20_born_in_south_america')!, fixtureRonaldinho, fixtureContext)).toBe(true);
    expect(computeValue(templateById('g19_born_in_europe')!, fixtureRonaldinho, fixtureContext)).toBe(false);
  });

  it('p04_is_goalkeeper — Messi kaleci değil', () => {
    const t = templateById('p04_is_goalkeeper')!;
    expect(computeValue(t, fixtureMessi, fixtureContext)).toBe(false);
  });

  it('f01_jersey_has_prime — Messi (10, 30) yok; CR7 (7) var', () => {
    const t = templateById('f01_jersey_has_prime')!;
    expect(computeValue(t, fixtureMessi, fixtureContext)).toBe(false);
    expect(computeValue(t, fixtureCR7, fixtureContext)).toBe(true);
  });

  it('g11_distinct_club_continents — Ronaldinho 2 kıta (Avrupa+G.Amerika)', () => {
    const t = templateById('g11_distinct_club_continents')!;
    expect(computeValue(t, fixtureRonaldinho, fixtureContext)).toBe(2);
    expect(computeValue(t, fixtureCR7, fixtureContext)).toBe(2); // Europe + Asia
    expect(computeValue(t, fixtureMessi, fixtureContext)).toBe(1); // sadece Europe
  });

  it('g16_played_in_turkey — fixture\'larımızda kimse Türkiye\'de oynamamış', () => {
    const t = templateById('g16_played_in_turkey')!;
    expect(computeValue(t, fixtureMessi, fixtureContext)).toBe(false);
  });

  it('g10_distinct_club_countries — Messi (ES+FR) → 2', () => {
    const t = templateById('g10_distinct_club_countries')!;
    expect(computeValue(t, fixtureMessi, fixtureContext)).toBe(2);
  });
});

describe('computeValue — proximity (parametrik)', () => {
  it('x01_age_proximity, targetAge=30 — Messi (37) vs CR7 (40)', () => {
    const t = templateById('x01_age_proximity')!;
    const ctx = { ...fixtureContext, params: { targetAge: 30 } };
    // Messi 1987 → 2025-1987=38 → |38-30|=8 → -8
    // CR7 1985 → 40 → |40-30|=10 → -10
    expect(computeValue(t, fixtureMessi, ctx)).toBe(-8);
    expect(computeValue(t, fixtureCR7, ctx)).toBe(-10);
  });

  it('x05_jersey_proximity, targetJersey=10 — Messi 10 vs CR7 7', () => {
    const t = templateById('x05_jersey_proximity')!;
    const ctx = { ...fixtureContext, params: { targetJersey: 10 } };
    // Messi 10 → |10-10|=0 → -0 (sayısal 0)
    expect(computeValue(t, fixtureMessi, ctx)).toEqual(0);
    expect(computeValue(t, fixtureCR7, ctx)).toBe(-1);
  });
});

describe('computeValue — isim/kart', () => {
  it('k01_name_letter_count', () => {
    const t = templateById('k01_name_letter_count')!;
    expect(computeValue(t, fixtureMessi, fixtureContext)).toBe(11); // "Lionel Messi"
  });

  it('k12_name_letter_count_target, letter="o"', () => {
    const t = templateById('k12_name_letter_count_target')!;
    const ctx = { ...fixtureContext, params: { letter: 'o' } };
    // Cristiano Ronaldo: 3
    expect(computeValue(t, fixtureCR7, ctx)).toBe(3);
  });
});

describe('resolveRound', () => {
  it('n01: CR7 > Messi (gol)', () => {
    const t = templateById('n01_total_goals')!;
    const r = resolveRound(t, fixtureCR7, fixtureMessi, fixtureContext);
    expect(r.winner).toBe('P1');
  });

  it('t01_younger: Messi (1987) > Ronaldinho (1980)', () => {
    const t = templateById('t01_younger')!;
    const r = resolveRound(t, fixtureMessi, fixtureRonaldinho, fixtureContext);
    expect(r.winner).toBe('P1');
  });

  it('t02_older: Ronaldinho (1980) yaşlı → kazanır; değer pozitif epoch ms', () => {
    const t = templateById('t02_older')!;
    expect(t.compareOp).toBe('min'); // eski tarih = küçük ms = min kazanır
    const r = resolveRound(t, fixtureMessi, fixtureRonaldinho, fixtureContext);
    // Ronaldinho (P2) daha yaşlı → kazanmalı
    expect(r.winner).toBe('P2');
    // Değer pozitif olmalı (negatif epoch format'ı bozuyordu)
    expect(typeof r.p1Value === 'number' && r.p1Value > 0).toBe(true);
    expect(typeof r.p2Value === 'number' && r.p2Value > 0).toBe(true);
  });

  it('p04_is_goalkeeper: ikisi de kaleci değil → gerçek beraberlik, kazanan yok', () => {
    const t = templateById('p04_is_goalkeeper')!;
    const r = resolveRound(t, fixtureMessi, fixtureCR7, fixtureContext);
    // İkisi de kaleci değil (Hayır-Hayır) → beraberlik. Tiebreaker ile
    // rastgele/keyfi kazanan ASLA belirlenmez; eşitlik uzatma/penaltı fazlarıyla kırılır.
    expect(r.winner).toBe('tie');
    expect(r.tiebreakerUsed).toBeUndefined();
  });

  it('numeric tie: eşit değerler → beraberlik, kazanan yok', () => {
    const t = templateById('n01_total_goals')!;
    // Aynı oyuncuyu iki tarafa koyarsak değerler eşit → tie
    const r = resolveRound(t, fixtureMessi, fixtureMessi, fixtureContext);
    expect(r.winner).toBe('tie');
  });
});

describe('parametrik şablon — param üretimi ve başlık interpolasyonu', () => {
  it('pickParams int aralık + step içinde değer üretir', async () => {
    const { pickParams } = await import('./resolver');
    const t = templateById('x04_apps_proximity')!;
    // step 100, from 200, to 900 → izin verilen değerler 200..900
    for (let i = 0; i < 50; i++) {
      const p = pickParams(t, () => i / 50);
      const v = p['targetApps'] as number;
      expect(v).toBeGreaterThanOrEqual(200);
      expect(v).toBeLessThanOrEqual(900);
      expect(v % 100).toBe(0);
    }
  });

  it('interpolateTitle placeholder\'ı değerle değiştirir', async () => {
    const { interpolateTitle } = await import('./resolver');
    const t = templateById('x04_apps_proximity')!;
    const out = interpolateTitle(t.title.tr, { targetApps: 500 });
    expect(out).toContain('500');
    expect(out).not.toContain('{targetApps}');
  });
});

describe('templateApplicable', () => {
  it('tüm şablonlar fixture\'lar üzerinde tip-doğru bool döndürüyor', () => {
    for (const t of TEMPLATES) {
      expect(typeof templateApplicable(t, fixtureMessi), t.id).toBe('boolean');
      expect(typeof templateApplicable(t, fixtureCR7), t.id).toBe('boolean');
    }
  });
});

describe('regression — şablon/resolver senkronizasyonu', () => {
  // Üç fixture'ı da kapsayacak geniş bir oyuncu seti
  const fixtures = [fixtureMessi, fixtureCR7, fixtureRonaldinho];

  it('compute:custom şablonların ID\'si resolver switch ile eşleşiyor (orphan yok)', () => {
    // Bir şablon uygulanabilir olduğu HALDE computeValue null dönüyorsa,
    // resolver'da o ID için case yok demektir (renamed/orphan bug).
    for (const t of TEMPLATES) {
      if (t.compute !== 'custom') continue;
      const applicable = fixtures.filter((p) => templateApplicable(t, p));
      if (applicable.length === 0) continue; // fixture kapsamı dışında
      const anyKnown = applicable.some(
        (p) => computeValue(t, p, fixtureContext) !== null,
      );
      expect(
        anyKnown,
        `${t.id}: uygulanabilir fixture'larda HEP null döndü — resolver case eksik/yanlış olabilir`,
      ).toBe(true);
    }
  });

  it('hiçbir şablon "random" tiebreaker içermiyor ve resolveRound rastgele kazanan üretmiyor', () => {
    for (const t of TEMPLATES) {
      expect(t.tiebreakers, t.id).not.toContain('random');
    }
    // Eşit değerlerde her zaman tie döner (tiebreaker uygulanmaz)
    const t = templateById('p04_is_goalkeeper')!;
    const r = resolveRound(t, fixtureMessi, fixtureCR7, fixtureContext);
    expect(r.winner).toBe('tie');
    expect(r.tiebreakerUsed).toBeUndefined();
  });

  it('e09/e10 dönüştürülen şablonlar sayısal değer üretiyor (bool değil)', () => {
    const e09 = templateById('e09_national_dominant')!;
    expect(e09.compareOp).toBe('max');
    const v9 = computeValue(e09, fixtureMessi, fixtureContext);
    expect(typeof v9).toBe('number');

    const e10 = templateById('e10_high_value_active')!;
    expect(e10.compareOp).toBe('max');
    // Messi aktif → maxTransferFeeEUR varsa sayı, yoksa null (ama bool değil)
    const v10 = computeValue(e10, fixtureMessi, fixtureContext);
    expect(v10 === null || typeof v10 === 'number').toBe(true);
  });

  it('silinen şablonlar artık mevcut değil', () => {
    for (const id of [
      'k08_name_palindrome',
      'f07_goals_round',
      'f08_apps_4_digits',
      'e01_tall_giant',
      'e02_short_player',
      'e03_1000_plus_apps',
      'e04_500_plus_goals',
      'e06_50_plus_season',
      't11_career_decades_count',
      // Boolean azaltma turunda silinenler
      'g07_north_hemisphere',
      'g09_capital_birth',
      'g12_two_continents',
      'g18_played_abroad',
      'c07_one_club_man',
      'p01_is_forward',
      'p05_right_footed',
      'k13_name_starts_vowel',
      'f03_jersey_all_even',
      'f09_jersey_palindrome',
      'e05_20_plus_career',
      'e08_5_plus_countries',
      // Duplike/işe yaramaz temizliği (t03≈t01, t10=t02, k06=k04, c03≈t06, t09 %91 berabere)
      't03_birth_year',
      't10_age_today_older',
      'k06_name_syllables',
      'c03_first_club_year_early',
      't09_still_active',
      'c04_last_club_year_late',
    ]) {
      expect(templateById(id), `${id} silinmeli`).toBeUndefined();
    }
  });

  it('yeni doğum-kıtası soruları mevcut', () => {
    for (const id of ['g20_born_in_south_america', 'g21_born_in_africa', 'g23_born_in_asia']) {
      expect(templateById(id), `${id} eklenmeli`).toBeDefined();
    }
  });

  it('boolean şablon oranı azınlıkta (< %15)', () => {
    const bool = TEMPLATES.filter((t) => t.compareOp === 'bool');
    const ratio = bool.length / TEMPLATES.length;
    expect(ratio, `bool oranı %${(ratio * 100).toFixed(1)} — çok yüksek`).toBeLessThan(0.15);
  });
});
