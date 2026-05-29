import { describe, expect, it } from 'vitest';
import { computeValue, resolveRound, templateApplicable } from './resolver';
import { templateById, TEMPLATES } from './templates';
import { haversineKm, ISTANBUL } from './geo';
import { isPrime, countVowels, nameLetterCount } from './util';
import {
  fixtureContext,
  fixtureCR7,
  fixtureMessi,
  fixtureRonaldinho,
} from './test-fixtures';

describe('templates load', () => {
  it('loads 30 templates from JSON', () => {
    expect(TEMPLATES.length).toBe(30);
  });

  it('every template has a Turkish title', () => {
    for (const t of TEMPLATES) {
      expect(t.title.tr, t.id).toBeTruthy();
    }
  });

  it('no template uses random as a tiebreaker', () => {
    for (const t of TEMPLATES) {
      expect(t.tiebreakers, t.id).not.toContain('random');
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

  it('countVowels and nameLetterCount', () => {
    expect(countVowels('Ronaldinho')).toBe(4);
    expect(nameLetterCount('Lionel Messi')).toBe(11);
  });

  it('haversine returns positive km', () => {
    const d = haversineKm({ lat: 41.0, lng: 29.0 }, ISTANBUL);
    expect(d).toBeLessThan(20);
    const far = haversineKm({ lat: -30, lng: -51 }, ISTANBUL);
    expect(far).toBeGreaterThan(10000);
  });
});

describe('computeValue', () => {
  it('q01 jersey sum', () => {
    const t = templateById('q01_jersey_sum')!;
    expect(computeValue(t, fixtureMessi, fixtureContext)).toBe(40);
    expect(computeValue(t, fixtureRonaldinho, fixtureContext)).toBe(111);
  });

  it('q02 total goals (identity)', () => {
    const t = templateById('q02_total_goals')!;
    expect(computeValue(t, fixtureMessi, fixtureContext)).toBe(850);
  });

  it('q05 club count', () => {
    const t = templateById('q05_club_count')!;
    expect(computeValue(t, fixtureMessi, fixtureContext)).toBe(2);
    expect(computeValue(t, fixtureRonaldinho, fixtureContext)).toBe(3);
  });

  it('q14 distinct club countries', () => {
    const t = templateById('q14_distinct_club_countries')!;
    expect(computeValue(t, fixtureRonaldinho, fixtureContext)).toBe(3);
    expect(computeValue(t, fixtureMessi, fixtureContext)).toBe(2);
  });

  it('q16 two continents', () => {
    const t = templateById('q16_two_continents')!;
    expect(computeValue(t, fixtureRonaldinho, fixtureContext)).toBe(true);
    expect(computeValue(t, fixtureCR7, fixtureContext)).toBe(true);
    expect(computeValue(t, fixtureMessi, fixtureContext)).toBe(false);
  });

  it('q23 still active', () => {
    const t = templateById('q23_still_active')!;
    expect(computeValue(t, fixtureMessi, fixtureContext)).toBe(true);
    expect(computeValue(t, fixtureRonaldinho, fixtureContext)).toBe(false);
  });

  it('q28 prime jersey', () => {
    const t = templateById('q28_prime_jersey')!;
    expect(computeValue(t, fixtureCR7, fixtureContext)).toBe(true);
    expect(computeValue(t, fixtureMessi, fixtureContext)).toBe(false);
  });
});

describe('resolveRound', () => {
  it('q02 totalGoals: Ronaldo > Messi', () => {
    const t = templateById('q02_total_goals')!;
    const r = resolveRound(t, fixtureCR7, fixtureMessi, fixtureContext);
    expect(r.winner).toBe('P1');
  });

  it('q21 ucl final - bool tie, no tiebreaker -> tie', () => {
    const t = templateById('q21_ucl_final')!;
    const r = resolveRound(t, fixtureMessi, fixtureCR7, fixtureContext);
    expect(r.winner).toBe('tie');
    expect(r.tiebreakerUsed).toBeUndefined();
  });

  it('q22 worldcup tie -> nationalCaps tiebreaker, CR7 > Messi', () => {
    const t = templateById('q22_world_cup')!;
    const r = resolveRound(t, fixtureMessi, fixtureCR7, fixtureContext);
    expect(r.winner).toBe('P2');
    expect(r.tiebreakerUsed).toBe('stats.nationalCaps:max');
  });

  it('q07 younger: Messi (1987) beats Ronaldinho (1980)', () => {
    const t = templateById('q07_younger')!;
    const r = resolveRound(t, fixtureMessi, fixtureRonaldinho, fixtureContext);
    expect(r.winner).toBe('P1');
  });
});

describe('templateApplicable', () => {
  it('passes for filled fixture', () => {
    for (const t of TEMPLATES) {
      const okMessi = templateApplicable(t, fixtureMessi);
      expect(typeof okMessi, t.id).toBe('boolean');
    }
  });
});
