import { z } from 'zod';

export const clubSchema = z.object({
  id: z.string(),
  name: z.string(),
  city: z.string(),
  country: z.string(),
  countryCode: z.string().length(2),
  continent: z.enum([
    'Europe',
    'South America',
    'North America',
    'Africa',
    'Asia',
    'Oceania',
  ]),
  lat: z.number(),
  lng: z.number(),
  founded: z.number().optional(),
});
export type ClubInput = z.infer<typeof clubSchema>;

const clubStintSchema = z.object({
  clubId: z.string(),
  fromYear: z.number().int(),
  toYear: z.number().int().nullable(),
  apps: z.number().int().nonnegative(),
  goals: z.number().int().nonnegative(),
  jerseyNo: z.number().int().positive().optional(),
});

const statsSchema = z.object({
  totalGoals: z.number().int().nonnegative(),
  totalAssists: z.number().int().nonnegative(),
  totalApps: z.number().int().nonnegative(),
  nationalCaps: z.number().int().nonnegative(),
  nationalGoals: z.number().int().nonnegative(),
  maxSeasonGoals: z.number().int().nonnegative().optional(),
  last5LeagueGoals: z.number().int().nonnegative().optional(),
  maxTransferFeeEUR: z.number().int().nonnegative().optional(),
  proDebutYear: z.number().int().optional(),
  careerYears: z.number().int().nonnegative().optional(),
});

const achievementsSchema = z.object({
  hasUCLFinal: z.boolean(),
  hasWorldCup: z.boolean(),
  hasUCLTitle: z.boolean().optional(),
  hasBallonDor: z.boolean().optional(),
});

export const playerSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  displayName: z.string(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  birthCity: z.string().optional(),
  birthCountry: z.string().optional(),
  birthCountryCode: z.string().length(2).optional(),
  birthLat: z.number().optional(),
  birthLng: z.number().optional(),
  nationality: z.string(),
  nationalityCode: z.string().length(2),
  position: z.enum(['GK', 'DEF', 'MID', 'FWD']),
  preferredFoot: z.enum(['L', 'R', 'B']).optional(),
  heightCm: z.number().int().optional(),
  isActive: z.boolean(),
  clubs: z.array(clubStintSchema),
  jerseyNumbers: z.array(z.number().int().positive()),
  stats: statsSchema,
  achievements: achievementsSchema,
  imageUrl: z.string().url().optional(),
});
export type PlayerInput = z.infer<typeof playerSchema>;
