import type { Player } from '@futbol-kart/shared-types';
import type { ClubLite, ResolverContext } from './resolver';

const clubs: ClubLite[] = [
  { id: 'barcelona', country: 'Spain', countryCode: 'ES', continent: 'Europe', lat: 41.3809, lng: 2.1228 },
  { id: 'psg', country: 'France', countryCode: 'FR', continent: 'Europe', lat: 48.8414, lng: 2.253 },
  { id: 'gremio', country: 'Brazil', countryCode: 'BR', continent: 'South America', lat: -30.0653, lng: -51.235 },
  { id: 'al-nassr', country: 'Saudi Arabia', countryCode: 'SA', continent: 'Asia', lat: 24.7728, lng: 46.7414 },
];

export const fixtureContext: ResolverContext = {
  clubsById: new Map(clubs.map((c) => [c.id, c])),
  rng: () => 0.42,
};

export const fixtureMessi: Player = {
  id: 'p_messi', slug: 'messi', name: 'Lionel Messi', displayName: 'Messi',
  birthDate: '1987-06-24', birthCity: 'Rosario', birthCountry: 'Argentina', birthCountryCode: 'AR', birthLat: -32.9, birthLng: -60.6,
  nationality: 'Argentina', nationalityCode: 'AR',
  position: 'FWD', preferredFoot: 'L', heightCm: 170, isActive: true,
  clubs: [
    { clubId: 'barcelona', fromYear: 2004, toYear: 2021, apps: 778, goals: 672, jerseyNo: 10 },
    { clubId: 'psg', fromYear: 2021, toYear: 2023, apps: 75, goals: 32, jerseyNo: 30 },
  ],
  jerseyNumbers: [10, 30],
  stats: {
    totalGoals: 850, totalAssists: 380, totalApps: 1080,
    nationalCaps: 191, nationalGoals: 112, maxSeasonGoals: 73,
    last5LeagueGoals: 4, maxTransferFeeEUR: 0, proDebutYear: 2004, careerYears: 21,
  },
  achievements: { hasUCLFinal: true, hasWorldCup: true, hasUCLTitle: true, hasBallonDor: true },
};

export const fixtureRonaldinho: Player = {
  id: 'p_ronaldinho', slug: 'ronaldinho', name: 'Ronaldo de Assis Moreira', displayName: 'Ronaldinho',
  birthDate: '1980-03-21', birthCity: 'Porto Alegre', birthCountry: 'Brazil', birthCountryCode: 'BR', birthLat: -30.03, birthLng: -51.22,
  nationality: 'Brazil', nationalityCode: 'BR',
  position: 'FWD', preferredFoot: 'R', heightCm: 181, isActive: false,
  clubs: [
    { clubId: 'gremio', fromYear: 1998, toYear: 2001, apps: 89, goals: 35, jerseyNo: 10 },
    { clubId: 'psg', fromYear: 2001, toYear: 2003, apps: 77, goals: 25, jerseyNo: 21 },
    { clubId: 'barcelona', fromYear: 2003, toYear: 2008, apps: 207, goals: 94, jerseyNo: 10 },
  ],
  jerseyNumbers: [10, 21, 80],
  stats: {
    totalGoals: 245, totalAssists: 160, totalApps: 614,
    nationalCaps: 97, nationalGoals: 33, maxSeasonGoals: 26,
    last5LeagueGoals: 0, maxTransferFeeEUR: 32000000, proDebutYear: 1998, careerYears: 17,
  },
  achievements: { hasUCLFinal: false, hasWorldCup: true, hasUCLTitle: true, hasBallonDor: true },
};

export const fixtureCR7: Player = {
  id: 'p_cr7', slug: 'cr7', name: 'Cristiano Ronaldo', displayName: 'Ronaldo',
  birthDate: '1985-02-05', birthCity: 'Funchal', birthCountry: 'Portugal', birthCountryCode: 'PT', birthLat: 32.66, birthLng: -16.92,
  nationality: 'Portugal', nationalityCode: 'PT',
  position: 'FWD', preferredFoot: 'R', heightCm: 187, isActive: true,
  clubs: [
    { clubId: 'barcelona', fromYear: 2003, toYear: 2009, apps: 100, goals: 50, jerseyNo: 7 },
    { clubId: 'al-nassr', fromYear: 2023, toYear: null, apps: 90, goals: 78, jerseyNo: 7 },
  ],
  jerseyNumbers: [7, 9, 17, 28],
  stats: {
    totalGoals: 920, totalAssists: 240, totalApps: 1250,
    nationalCaps: 219, nationalGoals: 138, maxSeasonGoals: 61,
    last5LeagueGoals: 6, maxTransferFeeEUR: 100000000, proDebutYear: 2002, careerYears: 22,
    competitions: {
      uclApps: 183, uclGoals: 140, uclAssists: 42,
      uelApps: 8, uelGoals: 2, uelAssists: 1,
      worldCupApps: 22, worldCupGoals: 8, worldCupAssists: 2, worldCupGoalsConceded: 0,
      leagueApps: 758, leagueGoals: 600, leagueAssists: 180,
      domesticCupApps: 78, domesticCupGoals: 40,
    },
  },
  achievements: {
    hasUCLFinal: true, hasWorldCup: true, hasUCLTitle: true, hasBallonDor: true,
    trophies: {
      uclTitles: 5, uelTitles: 0, otherEuropeanTitles: 6, domesticLeagueTitles: 8,
      domesticCupTitles: 12, worldCupTitles: 0, continentalNationalTitles: 3, totalTitles: 34,
      individual: { ballonDor: 5, fifaBest: 3, goldenBoot: 4, topScorerAwards: 22, playerOfTheYear: 25, otherIndividual: 5, totalIndividual: 64 },
    },
  },
};
