import type { Player } from '@futbol-kart/shared-types';
// (ClubStint tipini doğrudan kullanmıyoruz; Player.clubs üzerinden erişiyoruz.)
import type { Template, TemplateParams } from './schema';
import { haversineKm, ISTANBUL, isCapital } from './geo';
import {
  countVowels,
  countConsonants,
  countLetter,
  hasTurkishChar,
  isPalindrome,
  isPrime,
  isKnown,
  nameLetterCount,
  wordCount,
  lastWord,
  firstWord,
  syllableCount,
  birthYear,
  birthMonth,
  birthDay,
  birthSeason,
  ageYears,
  absDiff,
  getByPath,
} from './util';

/** Oyun motorunun "şimdi" referansı — yaş hesaplamaları için sabit yıl. */
export const REFERENCE_YEAR = 2025;

export interface ResolverContext {
  clubsById: Map<string, ClubLite>;
  rng: () => number;
  /** Parametrik şablon için runtime'da belirlenen değerler. */
  params?: TemplateParams;
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

/**
 * Bir şablonun tek oyuncudaki değerini hesaplar.
 *
 * Yapı: ID-bazlı switch → kategori-bazlı default → field+compute fallback.
 *
 * NOT: Bilinmeyen değerlerde null döndür; null değerler karşılaştırmada
 * kaybeder (compareValues'de "değer biliniyorsa kazanır" mantığı).
 */
export function computeValue(
  template: Template,
  player: Player,
  ctx: ResolverContext,
): ComputedValue {
  // Custom case'ler — özel hesaplama gerektirenler
  const customResult = computeCustom(template, player, ctx);
  if (customResult !== undefined) return customResult;

  // Generic compute türleri
  switch (template.compute) {
    case 'identity':
      return computeIdentity(template, player);
    case 'sum':
      return computeSumArray(template, player);
    case 'count':
      return computeCountArray(template, player);
    case 'distance':
      return computeDistanceToBirth(template, player);
    case 'proximity':
      return computeProximity(template, player, ctx);
    case 'birthYear':
      return birthYear(player.birthDate);
    case 'birthMonth':
      return birthMonth(player.birthDate);
    case 'birthDay':
      return birthDay(player.birthDate);
    case 'birthDayOfWeek':
      return birthDayOfWeek(player.birthDate);
    case 'ageYears':
      return ageYears(player.birthDate, REFERENCE_YEAR);
    case 'debutAge':
      return computeDebutAge(player);
    case 'divide':
      return computeDivide(template, player);
    case 'multiply':
      return computeMultiply(template, player);
    case 'subtract':
      return computeSubtract(template, player);
    case 'boolCheck':
      return computeBoolCheck(template, player, ctx);
    case 'regexCount':
      return computeRegexCount(template, player);
    case 'countDistinct':
      return computeCountDistinct(template, player, ctx);
    default:
      return null;
  }
}

// ===========================
// Custom (ID-bazlı) hesaplamalar
// ===========================

function computeCustom(
  template: Template,
  player: Player,
  ctx: ResolverContext,
): ComputedValue | undefined {
  switch (template.id) {
    // ---------- KLASİK SAYISAL ----------
    case 'n01_total_goals': return player.stats.totalGoals;
    case 'n02_total_assists': return player.stats.totalAssists;
    case 'n03_total_apps': return player.stats.totalApps;
    case 'n04_national_caps': return player.stats.nationalCaps;
    case 'n05_national_goals': return player.stats.nationalGoals;
    case 'n06_max_season_goals': return player.stats.maxSeasonGoals ?? null;
    case 'n07_last5_league_goals': return player.stats.last5LeagueGoals ?? null;
    case 'n08_max_transfer_fee': return player.stats.maxTransferFeeEUR ?? null;
    case 'n09_career_years': return player.stats.careerYears ?? null;
    case 'n10_pro_debut_year': return player.stats.proDebutYear ?? null;
    case 'n11_height_cm': return player.heightCm ?? null;
    case 'n12_jersey_sum': return sum(player.jerseyNumbers);
    case 'n13_jersey_avg': return player.jerseyNumbers.length
      ? sum(player.jerseyNumbers) / player.jerseyNumbers.length
      : null;
    case 'n14_jersey_max': return player.jerseyNumbers.length
      ? Math.max(...player.jerseyNumbers)
      : null;
    case 'n15_jersey_min': return player.jerseyNumbers.length
      ? Math.min(...player.jerseyNumbers)
      : null;
    case 'n16_jersey_distinct': return new Set(player.jerseyNumbers).size || null;
    case 'n17_total_goal_contribution': // gol + asist
      return player.stats.totalGoals + player.stats.totalAssists;
    case 'n18_kulup_golu': // kulüp golü = toplam - milli
      return player.stats.totalGoals - player.stats.nationalGoals;
    case 'n19_kulup_maci': // kulüp maçı = toplam - milli
      return player.stats.totalApps - player.stats.nationalCaps;
    case 'n20_avg_goals_per_season':
      if (!player.stats.careerYears || player.stats.careerYears === 0) return null;
      return player.stats.totalGoals / player.stats.careerYears;
    case 'n21_avg_apps_per_season':
      if (!player.stats.careerYears || player.stats.careerYears === 0) return null;
      return player.stats.totalApps / player.stats.careerYears;
    case 'n22_goal_per_match':
      if (player.stats.totalApps === 0) return null;
      return player.stats.totalGoals / player.stats.totalApps;
    case 'n23_assist_per_match':
      if (player.stats.totalApps === 0) return null;
      return player.stats.totalAssists / player.stats.totalApps;
    case 'n24_national_goal_per_cap':
      if (player.stats.nationalCaps === 0) return null;
      return player.stats.nationalGoals / player.stats.nationalCaps;
    case 'n25_club_count':
      return player.clubs.length || null;

    // ---------- ZAMAN / YAŞ ----------
    case 't01_younger':
      return player.birthDate ? new Date(player.birthDate).getTime() : null;
    case 't02_older':
      return player.birthDate ? -new Date(player.birthDate).getTime() : null;
    case 't03_birth_year': return birthYear(player.birthDate);
    case 't04_birth_month': return birthMonth(player.birthDate);
    case 't05_birth_day': return birthDay(player.birthDate);
    case 't06_earlier_debut': return player.stats.proDebutYear ?? null;
    case 't07_debut_age': return computeDebutAge(player);
    case 't08_decade_spread': return decadeSpread(player);
    case 't09_still_active': return player.isActive;
    case 't10_age_today': return ageYears(player.birthDate, REFERENCE_YEAR);
    case 't11_career_decades_count': return decadeSpread(player);
    case 't12_active_career_years':
      if (!player.isActive || !player.stats.proDebutYear) return null;
      return REFERENCE_YEAR - player.stats.proDebutYear;

    // ---------- COĞRAFYA ----------
    case 'g01_equator_dist':
      return typeof player.birthLat === 'number' ? Math.abs(player.birthLat) : null;
    case 'g02_istanbul_dist':
      if (typeof player.birthLat !== 'number' || typeof player.birthLng !== 'number') return null;
      return haversineKm({ lat: player.birthLat, lng: player.birthLng }, ISTANBUL);
    case 'g03_north_latitude':
      return typeof player.birthLat === 'number' ? player.birthLat : null;
    case 'g04_south_latitude':
      return typeof player.birthLat === 'number' ? -player.birthLat : null;
    case 'g05_east_longitude':
      return typeof player.birthLng === 'number' ? player.birthLng : null;
    case 'g06_west_longitude':
      return typeof player.birthLng === 'number' ? -player.birthLng : null;
    case 'g07_north_hemisphere':
      return typeof player.birthLat === 'number' ? player.birthLat > 0 : null;
    case 'g08_east_hemisphere':
      return typeof player.birthLng === 'number' ? player.birthLng > 0 : null;
    case 'g09_capital_birth': return isCapital(player.birthCity);
    case 'g10_distinct_club_countries': return distinctClubCountries(player, ctx);
    case 'g11_distinct_club_continents': return distinctContinents(player, ctx);
    case 'g12_two_continents': return distinctContinents(player, ctx) >= 2;
    case 'g13_three_continents': return distinctContinents(player, ctx) >= 3;
    case 'g14_first_last_club_dist': return firstLastClubDistance(player, ctx);
    case 'g15_birth_to_first_club_dist': return birthToFirstClubDistance(player, ctx);
    case 'g16_played_in_turkey': return playedInCountry(player, ctx, 'TR');
    case 'g17_played_in_top5_leagues':
      return playedInAnyCountry(player, ctx, ['ES', 'GB', 'IT', 'DE', 'FR']);
    case 'g18_played_abroad': return playedAbroad(player, ctx);
    case 'g19_born_in_europe':
      return birthInContinent(player, ctx, 'Europe');
    case 'g20_born_in_south_america':
      return birthInContinent(player, ctx, 'South America');
    case 'g21_born_in_africa':
      return birthInContinent(player, ctx, 'Africa');
    case 'g22_lat_proximity_target':
      if (typeof player.birthLat !== 'number') return null;
      return absDiff(player.birthLat, Number(ctx.params?.['targetLat'] ?? 41));

    // ---------- KULÜP KARİYERİ ----------
    case 'c01_club_count': return player.clubs.length || null;
    case 'c02_longest_stint_years': return longestStintYears(player);
    case 'c03_first_club_year':
      if (player.clubs.length === 0) return null;
      return Math.min(...player.clubs.map((s) => s.fromYear));
    case 'c04_last_club_year':
      if (player.clubs.length === 0) return null;
      return Math.max(...player.clubs.map((s) => s.toYear ?? REFERENCE_YEAR));
    case 'c05_max_club_apps':
      if (player.clubs.length === 0) return null;
      return Math.max(...player.clubs.map((s) => s.apps));
    case 'c06_max_club_goals':
      if (player.clubs.length === 0) return null;
      return Math.max(...player.clubs.map((s) => s.goals));
    case 'c07_one_club_man':
      return player.clubs.length === 1;
    case 'c08_loyal_player': // tek bir kulüpte 10+ yıl
      return player.clubs.some((s) => {
        const end = s.toYear ?? REFERENCE_YEAR;
        return end - s.fromYear >= 10;
      });
    case 'c09_played_for_club_id': {
      const target = String(ctx.params?.['clubId'] ?? '');
      return target ? player.clubs.some((s) => s.clubId === target) : null;
    }

    // ---------- POZİSYON / AYAK ----------
    case 'p01_is_forward': return player.position === 'FWD';
    case 'p02_is_midfielder': return player.position === 'MID';
    case 'p03_is_defender': return player.position === 'DEF';
    case 'p04_is_goalkeeper': return player.position === 'GK';
    case 'p05_right_footed': return player.preferredFoot === 'R';
    case 'p06_left_footed': return player.preferredFoot === 'L';
    case 'p07_two_footed': return player.preferredFoot === 'B';

    // ---------- İSİM / KART ----------
    case 'k01_name_letter_count': return nameLetterCount(player.name);
    case 'k02_display_letter_count': return nameLetterCount(player.displayName);
    case 'k03_name_word_count': return wordCount(player.name);
    case 'k04_name_vowels': return countVowels(player.name);
    case 'k05_name_consonants': return countConsonants(player.name);
    case 'k06_name_syllables': return syllableCount(player.name);
    case 'k07_name_has_turkish_char': return hasTurkishChar(player.name);
    case 'k08_name_palindrome': return isPalindrome(player.name);
    case 'k09_lastname_length': return nameLetterCount(lastWord(player.name));
    case 'k10_firstname_length': return nameLetterCount(firstWord(player.name));
    case 'k11_uses_stage_name': // sahne adı = name ≠ displayName
      return player.name.trim().toLowerCase() !== player.displayName.trim().toLowerCase();
    case 'k12_name_letter_count_target': {
      const letter = String(ctx.params?.['letter'] ?? 'a');
      return countLetter(player.name, letter);
    }
    case 'k13_name_starts_vowel': {
      const ch = firstWord(player.name).charAt(0).toLowerCase();
      return /[aeiouıöü]/.test(ch);
    }
    case 'k14_name_ends_vowel': {
      const lw = lastWord(player.name);
      const ch = lw.charAt(lw.length - 1).toLowerCase();
      return /[aeiouıöü]/.test(ch);
    }
    case 'k15_alliteration': // ad ve soyad aynı harfle başlıyor mu
      return firstWord(player.name).charAt(0).toLowerCase() ===
             lastWord(player.name).charAt(0).toLowerCase();

    // ---------- EĞLENCE / SAYISAL EĞLENCE ----------
    case 'f01_jersey_has_prime': return player.jerseyNumbers.some(isPrime);
    case 'f02_jersey_has_target': {
      const target = Number(ctx.params?.['number'] ?? 10);
      return player.jerseyNumbers.includes(target);
    }
    case 'f03_jersey_all_even':
      return player.jerseyNumbers.length > 0 && player.jerseyNumbers.every((n) => n % 2 === 0);
    case 'f04_jersey_all_odd':
      return player.jerseyNumbers.length > 0 && player.jerseyNumbers.every((n) => n % 2 === 1);
    case 'f05_birth_day_even': {
      const d = birthDay(player.birthDate);
      return d === null ? null : d % 2 === 0;
    }
    case 'f06_birth_year_even': {
      const y = birthYear(player.birthDate);
      return y === null ? null : y % 2 === 0;
    }
    case 'f07_goals_round': // gol sayısı 100'ün katı mı
      return player.stats.totalGoals > 0 && player.stats.totalGoals % 100 === 0;
    case 'f08_apps_4_digits':
      return player.stats.totalApps >= 1000;
    case 'f09_jersey_palindrome': // forma no palindrom mu (11, 22, 33...)
      return player.jerseyNumbers.some((n) => {
        const s = String(n);
        return s.length > 1 && s === s.split('').reverse().join('');
      });
    case 'f10_height_ends_zero': // boyu 0'la bitiyor (170, 180, 190)
      return typeof player.heightCm === 'number' && player.heightCm % 10 === 0;
    case 'f11_birth_season': {
      const s = birthSeason(player.birthDate);
      const want = String(ctx.params?.['season'] ?? 'winter');
      return s === want;
    }

    // ---------- PROXIMITY ----------
    case 'x01_age_proximity': {
      const target = Number(ctx.params?.['targetAge'] ?? 30);
      const a = ageYears(player.birthDate, REFERENCE_YEAR);
      return a === null ? null : -absDiff(a, target);
    }
    case 'x02_height_proximity': {
      const target = Number(ctx.params?.['targetHeight'] ?? 180);
      return typeof player.heightCm === 'number'
        ? -absDiff(player.heightCm, target)
        : null;
    }
    case 'x03_goals_proximity': {
      const target = Number(ctx.params?.['targetGoals'] ?? 100);
      return -absDiff(player.stats.totalGoals, target);
    }
    case 'x04_apps_proximity': {
      const target = Number(ctx.params?.['targetApps'] ?? 500);
      return -absDiff(player.stats.totalApps, target);
    }
    case 'x05_jersey_proximity': {
      const target = Number(ctx.params?.['targetJersey'] ?? 10);
      if (player.jerseyNumbers.length === 0) return null;
      const closest = Math.min(
        ...player.jerseyNumbers.map((n) => absDiff(n, target)),
      );
      // -0 yerine 0 dön (JS özelliği), proximity max kazanır olduğu için 0 = en yakın
      return closest === 0 ? 0 : -closest;
    }
    case 'x06_birth_year_proximity': {
      const target = Number(ctx.params?.['targetYear'] ?? 1990);
      const y = birthYear(player.birthDate);
      return y === null ? null : -absDiff(y, target);
    }
    case 'x07_career_years_proximity': {
      const target = Number(ctx.params?.['targetCareer'] ?? 15);
      if (!player.stats.careerYears) return null;
      return -absDiff(player.stats.careerYears, target);
    }
    case 'x08_club_count_proximity': {
      const target = Number(ctx.params?.['targetClubs'] ?? 5);
      return -absDiff(player.clubs.length, target);
    }
    case 'x09_assists_proximity': {
      const target = Number(ctx.params?.['targetAssists'] ?? 100);
      return -absDiff(player.stats.totalAssists, target);
    }
    case 'x10_national_caps_proximity': {
      const target = Number(ctx.params?.['targetCaps'] ?? 50);
      return -absDiff(player.stats.nationalCaps, target);
    }

    // ---------- EXTREME / NICHE ----------
    case 'e01_tall_giant': // 200cm+
      return typeof player.heightCm === 'number' && player.heightCm >= 200;
    case 'e02_short_player': // 170cm altı
      return typeof player.heightCm === 'number' && player.heightCm < 170;
    case 'e03_1000_plus_apps':
      return player.stats.totalApps >= 1000;
    case 'e04_500_plus_goals':
      return player.stats.totalGoals >= 500;
    case 'e05_20_plus_career':
      return (player.stats.careerYears ?? 0) >= 20;
    case 'e06_50_plus_season':
      return (player.stats.maxSeasonGoals ?? 0) >= 50;
    case 'e07_3_plus_continents':
      return distinctContinents(player, ctx) >= 3;
    case 'e08_5_plus_countries':
      return distinctClubCountries(player, ctx) >= 5;
    case 'e09_national_dominant':
      // milli golleri toplam gollerinin %50'sinden fazla
      if (player.stats.totalGoals === 0) return null;
      return player.stats.nationalGoals / player.stats.totalGoals >= 0.5;
    case 'e10_high_value_active':
      // hâlâ aktif ve 50M+ transfer değeri
      return (
        player.isActive &&
        typeof player.stats.maxTransferFeeEUR === 'number' &&
        player.stats.maxTransferFeeEUR >= 50_000_000
      );

    // ---------- BOOLEAN (sınırlı: bireysel) ----------
    case 'b01_active_player': return player.isActive;
    case 'b02_played_in_capital': return isCapital(player.birthCity);
    case 'b03_has_jersey_10': return player.jerseyNumbers.includes(10);

    default:
      return undefined; // generic compute akışına bırak
  }
}

// ===========================
// Generic compute yardımcıları
// ===========================

function computeIdentity(template: Template, player: Player): ComputedValue {
  const raw = getByPath(player, template.field);
  if (raw === undefined || raw === null) return null;
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string' && template.field === 'birthDate') {
    return new Date(raw).getTime();
  }
  return null;
}

function computeSumArray(template: Template, player: Player): ComputedValue {
  const raw = getByPath(player, template.field);
  return Array.isArray(raw) ? sum(raw as number[]) : null;
}

function computeCountArray(template: Template, player: Player): ComputedValue {
  const raw = getByPath(player, template.field);
  return Array.isArray(raw) ? raw.length : null;
}

function computeDistanceToBirth(template: Template, player: Player): ComputedValue {
  if (typeof player.birthLat !== 'number' || typeof player.birthLng !== 'number') return null;
  void template; // şu an sadece istanbul mesafesi
  return haversineKm({ lat: player.birthLat, lng: player.birthLng }, ISTANBUL);
}

function computeProximity(
  template: Template,
  player: Player,
  ctx: ResolverContext,
): ComputedValue {
  const target = Number(ctx.params?.['target'] ?? 0);
  const raw = getByPath(player, template.field);
  if (typeof raw !== 'number') return null;
  // Negatif mutlak fark — max kazanırsa "en yakın" kazanır
  return -absDiff(raw, target);
}

function computeDebutAge(player: Player): ComputedValue {
  if (!player.stats.proDebutYear) return null;
  const y = birthYear(player.birthDate);
  if (y === null) return null;
  return player.stats.proDebutYear - y;
}

function birthDayOfWeek(birthDate: string | undefined): number | null {
  if (!birthDate) return null;
  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime())) return null;
  return d.getUTCDay();
}

function computeDivide(template: Template, player: Player): ComputedValue {
  const [num, den] = template.field.split('/');
  if (!num || !den) return null;
  const n = getByPath(player, num.trim());
  const d = getByPath(player, den.trim());
  if (typeof n !== 'number' || typeof d !== 'number' || d === 0) return null;
  return n / d;
}

function computeMultiply(template: Template, player: Player): ComputedValue {
  const [a, b] = template.field.split('*');
  if (!a || !b) return null;
  const va = getByPath(player, a.trim());
  const vb = getByPath(player, b.trim());
  if (typeof va !== 'number' || typeof vb !== 'number') return null;
  return va * vb;
}

function computeSubtract(template: Template, player: Player): ComputedValue {
  const [a, b] = template.field.split('-');
  if (!a || !b) return null;
  const va = getByPath(player, a.trim());
  const vb = getByPath(player, b.trim());
  if (typeof va !== 'number' || typeof vb !== 'number') return null;
  return va - vb;
}

function computeBoolCheck(
  template: Template,
  player: Player,
  ctx: ResolverContext,
): ComputedValue {
  const raw = getByPath(player, template.field);
  const target = ctx.params?.['value'] ?? template.field;
  return raw === target;
}

function computeRegexCount(template: Template, player: Player): ComputedValue {
  const raw = getByPath(player, template.field);
  if (typeof raw !== 'string') return null;
  const pattern = template.tags?.find((t) => t.startsWith('regex:'))?.slice(6);
  if (!pattern) return null;
  return (raw.match(new RegExp(pattern, 'g')) ?? []).length;
}

function computeCountDistinct(
  template: Template,
  player: Player,
  ctx: ResolverContext,
): ComputedValue {
  switch (template.field) {
    case 'clubs.country':
      return distinctClubCountries(player, ctx);
    case 'clubs.continent':
      return distinctContinents(player, ctx);
    default:
      return null;
  }
}

function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0);
}

// ===========================
// Coğrafi / kulüp yardımcıları
// ===========================

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

function firstLastClubDistance(
  player: Player,
  ctx: ResolverContext,
): number | null {
  if (player.clubs.length < 2) return null;
  const sorted = [...player.clubs].sort((a, b) => a.fromYear - b.fromYear);
  const first = ctx.clubsById.get(sorted[0]!.clubId);
  const last = ctx.clubsById.get(sorted[sorted.length - 1]!.clubId);
  if (!first || !last) return null;
  return haversineKm({ lat: first.lat, lng: first.lng }, { lat: last.lat, lng: last.lng });
}

function birthToFirstClubDistance(
  player: Player,
  ctx: ResolverContext,
): number | null {
  if (typeof player.birthLat !== 'number' || typeof player.birthLng !== 'number') return null;
  if (player.clubs.length === 0) return null;
  const sorted = [...player.clubs].sort((a, b) => a.fromYear - b.fromYear);
  const first = ctx.clubsById.get(sorted[0]!.clubId);
  if (!first) return null;
  return haversineKm(
    { lat: player.birthLat, lng: player.birthLng },
    { lat: first.lat, lng: first.lng },
  );
}

function longestStintYears(player: Player): number | null {
  if (player.clubs.length === 0) return null;
  let max = 0;
  for (const s of player.clubs) {
    const end = s.toYear ?? REFERENCE_YEAR;
    const span = end - s.fromYear;
    if (span > max) max = span;
  }
  return max;
}

function decadeSpread(player: Player): number {
  const decades = new Set<number>();
  for (const s of player.clubs) {
    const end = s.toYear ?? REFERENCE_YEAR;
    for (let y = s.fromYear; y <= end; y++) {
      decades.add(Math.floor(y / 10));
    }
  }
  return decades.size;
}

function playedInCountry(player: Player, ctx: ResolverContext, countryCode: string): boolean {
  for (const stint of player.clubs) {
    const club = ctx.clubsById.get(stint.clubId);
    if (club && club.countryCode === countryCode) return true;
  }
  return false;
}

function playedInAnyCountry(
  player: Player,
  ctx: ResolverContext,
  codes: string[],
): boolean {
  const set = new Set(codes);
  for (const stint of player.clubs) {
    const club = ctx.clubsById.get(stint.clubId);
    if (club && set.has(club.countryCode)) return true;
  }
  return false;
}

function playedAbroad(player: Player, ctx: ResolverContext): boolean {
  const nat = player.nationalityCode;
  for (const stint of player.clubs) {
    const club = ctx.clubsById.get(stint.clubId);
    if (club && club.countryCode !== nat) return true;
  }
  return false;
}

function birthInContinent(
  player: Player,
  ctx: ResolverContext,
  continent: string,
): boolean | null {
  // birthCountry ile club country eşleyebilir miyiz?
  // Doğrudan ülke kodu üzerinden eşleştirme yapalım
  const bc = player.birthCountryCode;
  if (!bc) return null;
  // Kıta lookup: clubs.continent map kullan (kulüp listesi üzerinden gezerek aynı ülke kodu)
  for (const c of ctx.clubsById.values()) {
    if (c.countryCode === bc) return c.continent === continent;
  }
  return null;
}

// ===========================
// Tur çözücü
// ===========================

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
  // Özel kısayollar
  if (path === 'clubs.length' || path === 'clubs') return player.clubs.length;
  if (path === 'jerseyNumbers' || path === 'jerseyNumbers.length') {
    return player.jerseyNumbers.length;
  }
  if (path === 'birthDate') {
    return player.birthDate ? new Date(player.birthDate).getTime() : null;
  }
  const v = getByPath(player, path);
  return typeof v === 'number' ? v : null;
}

export function templateApplicable(
  template: Template,
  player: Player,
): boolean {
  for (const field of template.requiresFields) {
    // Virtual alanlar — getByPath bunları çözemez
    if (field === 'birthYear' || field === 'birthMonth' || field === 'birthDay') {
      if (!player.birthDate) return false;
      continue;
    }
    const v = getByPath(player, field);
    if (!isKnown(v)) return false;
  }
  return true;
}
