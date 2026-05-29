import type { Player, ClubStint } from '@futbol-kart/shared-types';
import type { Template } from './schema';
import { haversineKm, ISTANBUL, isCapital } from './geo';
import { countVowels, getByPath, isPrime, nameLetterCount } from './util';

export interface ResolverContext {
  clubsById: Map<string, ClubLite>;
  rng: () => number;
}

export interface ClubLite {
  id: string;
  country: string;
  countryCode: string;
  continent: string;
  lat: number;
  lng: number;
}

export type ComputedValue = number | boolean | null;

export interface RoundOutcome {
  winner: 'P1' | 'P2' | 'tie';
  p1Value: ComputedValue;
  p2Value: ComputedValue;
  tiebreakerUsed?: string;
}

export function computeValue(
  template: Template,
  player: Player,
  ctx: ResolverContext,
): ComputedValue {
  switch (template.id) {
    case 'q01_jersey_sum':
      return sum(player.jerseyNumbers);
    case 'q05_club_count':
      return player.clubs.length;
    case 'q07_younger':
      return player.birthDate ? new Date(player.birthDate).getTime() : null;
    case 'q11_equator_dist':
      return player.birthLat !== undefined ? Math.abs(player.birthLat) : null;
    case 'q12_istanbul_dist':
      if (player.birthLat === undefined || player.birthLng === undefined) return null;
      return haversineKm({ lat: player.birthLat, lng: player.birthLng }, ISTANBUL);
    case 'q14_distinct_club_countries':
      return distinctClubCountries(player, ctx);
    case 'q15_first_last_club_dist':
      return firstLastClubDistance(player, ctx);
    case 'q16_two_continents':
      return distinctContinents(player, ctx) >= 2;
    case 'q17_capital_birth':
      return isCapital(player.birthCity);
    case 'q19_longest_stint':
      return longestStintYears(player);
    case 'q20_decade_spread':
      return decadeSpread(player);
    case 'q23_still_active':
      return player.isActive;
    case 'q26_longer_name':
      return nameLetterCount(player.name);
    case 'q27_more_vowels':
      return countVowels(player.name);
    case 'q28_prime_jersey':
      return player.jerseyNumbers.some(isPrime);
    case 'q30_later_birth_month':
      return new Date(player.birthDate).getUTCMonth() + 1;
    default:
      return defaultCompute(template, player);
  }
}

function defaultCompute(template: Template, player: Player): ComputedValue {
  const raw = getByPath(player, template.field);
  switch (template.compute) {
    case 'identity':
      if (raw === undefined || raw === null) return null;
      if (typeof raw === 'boolean') return raw;
      if (typeof raw === 'number') return raw;
      if (typeof raw === 'string' && template.field === 'birthDate') {
        return new Date(raw).getTime();
      }
      return null;
    case 'sum':
      return Array.isArray(raw) ? sum(raw as number[]) : null;
    case 'count':
      return Array.isArray(raw) ? raw.length : null;
    default:
      return null;
  }
}

function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0);
}

function distinctClubCountries(player: Player, ctx: ResolverContext): number {
  const set = new Set<string>();
  for (const stint of player.clubs) {
    const club = ctx.clubsById.get(stint.clubId);
    if (club) set.add(club.countryCode);
  }
  return set.size;
}

function distinctContinents(player: Player, ctx: ResolverContext): number {
  const set = new Set<string>();
  for (const stint of player.clubs) {
    const club = ctx.clubsById.get(stint.clubId);
    if (club) set.add(club.continent);
  }
  return set.size;
}

function firstLastClubDistance(player: Player, ctx: ResolverContext): number | null {
  if (player.clubs.length < 2) return null;
  const sorted = [...player.clubs].sort((a, b) => a.fromYear - b.fromYear);
  const first = ctx.clubsById.get(sorted[0]!.clubId);
  const last = ctx.clubsById.get(sorted[sorted.length - 1]!.clubId);
  if (!first || !last) return null;
  return haversineKm({ lat: first.lat, lng: first.lng }, { lat: last.lat, lng: last.lng });
}

function longestStintYears(player: Player): number {
  let max = 0;
  for (const s of player.clubs) {
    const end = s.toYear ?? new Date().getUTCFullYear();
    const span = end - s.fromYear;
    if (span > max) max = span;
  }
  return max;
}

function decadeSpread(player: Player): number {
  const decades = new Set<number>();
  for (const s of player.clubs) {
    const end = s.toYear ?? new Date().getUTCFullYear();
    for (let y = s.fromYear; y <= end; y++) {
      decades.add(Math.floor(y / 10));
    }
  }
  return decades.size;
}

export function resolveRound(
  template: Template,
  p1: Player,
  p2: Player,
  ctx: ResolverContext,
): RoundOutcome {
  const v1 = computeValue(template, p1, ctx);
  const v2 = computeValue(template, p2, ctx);

  const winnerByValue = compareValues(v1, v2, template.compareOp);
  if (winnerByValue !== 'tie') {
    return { winner: winnerByValue, p1Value: v1, p2Value: v2 };
  }

  for (const tb of template.tiebreakers) {
    const outcome = applyTiebreaker(tb, p1, p2, ctx);
    if (outcome.winner !== 'tie') {
      return { ...outcome, p1Value: v1, p2Value: v2, tiebreakerUsed: tb };
    }
  }

  return { winner: 'tie', p1Value: v1, p2Value: v2 };
}

function compareValues(
  v1: ComputedValue,
  v2: ComputedValue,
  op: 'max' | 'min' | 'bool',
): 'P1' | 'P2' | 'tie' {
  if (v1 === null && v2 === null) return 'tie';
  if (v1 === null) return 'P2';
  if (v2 === null) return 'P1';

  if (op === 'bool') {
    if (v1 === v2) return 'tie';
    return v1 === true ? 'P1' : 'P2';
  }

  const n1 = typeof v1 === 'boolean' ? (v1 ? 1 : 0) : v1;
  const n2 = typeof v2 === 'boolean' ? (v2 ? 1 : 0) : v2;
  if (n1 === n2) return 'tie';
  if (op === 'max') return n1 > n2 ? 'P1' : 'P2';
  return n1 < n2 ? 'P1' : 'P2';
}

function applyTiebreaker(
  tb: string,
  p1: Player,
  p2: Player,
  ctx: ResolverContext,
): { winner: 'P1' | 'P2' | 'tie' } {
  if (tb === 'random') {
    return { winner: ctx.rng() < 0.5 ? 'P1' : 'P2' };
  }
  const [path, op] = tb.split(':');
  if (!path || !op) return { winner: 'tie' };
  const v1 = numericPath(p1, path);
  const v2 = numericPath(p2, path);
  if (v1 === null && v2 === null) return { winner: 'tie' };
  if (v1 === null) return { winner: 'P2' };
  if (v2 === null) return { winner: 'P1' };
  if (v1 === v2) return { winner: 'tie' };
  if (op === 'max') return { winner: v1 > v2 ? 'P1' : 'P2' };
  if (op === 'min') return { winner: v1 < v2 ? 'P1' : 'P2' };
  return { winner: 'tie' };
}

function numericPath(player: Player, path: string): number | null {
  if (path === 'clubs.length') return player.clubs.length;
  const v = getByPath(player, path);
  return typeof v === 'number' ? v : null;
}

export function templateApplicable(
  template: Template,
  player: Player,
): boolean {
  for (const field of template.requiresFields) {
    const v = getByPath(player, field);
    if (v === undefined || v === null) return false;
    if (Array.isArray(v) && v.length === 0) return false;
  }
  return true;
}
