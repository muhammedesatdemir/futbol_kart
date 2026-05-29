import type { ClubStint } from './club';

export type Foot = 'L' | 'R' | 'B';
export type Position = 'GK' | 'DEF' | 'MID' | 'FWD';

export interface Player {
  id: string;
  slug: string;
  name: string;
  displayName: string;

  birthDate: string;
  birthCity?: string;
  birthCountry?: string;
  birthCountryCode?: string;
  birthLat?: number;
  birthLng?: number;
  nationality: string;
  nationalityCode: string;

  position: Position;
  preferredFoot?: Foot;
  heightCm?: number;
  isActive: boolean;

  clubs: ClubStint[];
  jerseyNumbers: number[];

  stats: PlayerStats;
  achievements: PlayerAchievements;

  imageUrl?: string;
}

export interface PlayerStats {
  totalGoals: number;
  totalAssists: number;
  totalApps: number;
  nationalCaps: number;
  nationalGoals: number;
  maxSeasonGoals?: number;
  last5LeagueGoals?: number;
  maxTransferFeeEUR?: number;
  proDebutYear?: number;
  careerYears?: number;
}

export interface PlayerAchievements {
  hasUCLFinal: boolean;
  hasWorldCup: boolean;
  hasUCLTitle?: boolean;
  hasBallonDor?: boolean;
}
