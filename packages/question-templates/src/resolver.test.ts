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
  it('loads at least 100 templates from JSON', () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(100);
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
  it('t09_still_active', () => {
    const t = templateById('t09_still_active')!;
    expect(computeValue(t, fixtureMessi, fixtureContext)).toBe(true);
    expect(computeValue(t, fixtureRonaldinho, fixtureContext)).toBe(false);
  });

  it('p01_is_forward', () => {
    const t = templateById('p01_is_forward')!;
    expect(computeValue(t, fixtureMessi, fixtureContext)).toBe(true);
  });

  it('f01_jersey_has_prime — Messi (10, 30) yok; CR7 (7) var', () => {
    const t = templateById('f01_jersey_has_prime')!;
    expect(computeValue(t, fixtureMessi, fixtureContext)).toBe(false);
    expect(computeValue(t, fixtureCR7, fixtureContext)).toBe(true);
  });

  it('g12_two_continents — Ronaldinho 2 kıta (Avrupa+G.Amerika) → true', () => {
    const t = templateById('g12_two_continents')!;
    expect(computeValue(t, fixtureRonaldinho, fixtureContext)).toBe(true);
    expect(computeValue(t, fixtureCR7, fixtureContext)).toBe(true); // Europe + Asia
    expect(computeValue(t, fixtureMessi, fixtureContext)).toBe(false); // sadece Europe
  });

  it('g16_played_in_turkey — fixture\'larımızda kimse Türkiye\'de oynamamış', () => {
    const t = templateById('g16_played_in_turkey')!;
    expect(computeValue(t, fixtureMessi, fixtureContext)).toBe(false);
  });

  it('g18_played_abroad — Messi (AR) Barcelona+PSG → true', () => {
    const t = templateById('g18_played_abroad')!;
    expect(computeValue(t, fixtureMessi, fixtureContext)).toBe(true);
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

  it('p01_is_forward: ikisi de forvet → tiebreaker (totalGoals)', () => {
    const t = templateById('p01_is_forward')!;
    const r = resolveRound(t, fixtureMessi, fixtureCR7, fixtureContext);
    // Bool tie → tiebreaker totalGoals → CR7 920 > Messi 850
    expect(r.winner).toBe('P2');
    expect(r.tiebreakerUsed).toBe('stats.totalGoals:max');
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
