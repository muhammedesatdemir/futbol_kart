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
  /** Turnuva bazlı maç/gol agregaları — cache'lenmiş maç verisinden türetildi. */
  competitions?: CompetitionStats;
}

/** Turnuva bazlı maç/gol/asist (UCL/UEL/Dünya Kupası/lig/kupa). "Hedefe Yaklaş" modu için. */
export interface CompetitionStats {
  uclApps: number;
  uclGoals: number;
  uclAssists: number;
  uelApps: number;
  uelGoals: number;
  uelAssists: number;
  worldCupApps: number;
  worldCupGoals: number;
  worldCupAssists: number;
  /** Kalecinin Dünya Kupası'nda sahadayken yediği gol. */
  worldCupGoalsConceded: number;
  leagueApps: number;
  leagueGoals: number;
  leagueAssists: number;
  domesticCupApps: number;
  domesticCupGoals: number;
}

export interface PlayerAchievements {
  hasUCLFinal: boolean;
  hasWorldCup: boolean;
  hasUCLTitle?: boolean;
  hasBallonDor?: boolean;
  /** Kazanılan kupa adetleri (TM Erfolge). Kupa soruları + "en kupalı kadro" için. */
  trophies?: TrophyCounts;
}

/** Kazanılan kupa adetleri (kategorize). honours scrape'inden gelir. */
export interface TrophyCounts {
  uclTitles: number;
  uelTitles: number;
  otherEuropeanTitles: number;
  domesticLeagueTitles: number;
  domesticCupTitles: number;
  worldCupTitles: number;
  continentalNationalTitles: number;
  /** TAKIM kupalarının toplamı (bireysel ödüller HARİÇ). */
  totalTitles: number;
  /** Bireysel ödüller — takım kupası değil, ayrı sorular için. */
  individual?: IndividualAwards;
}

/** Bireysel ödül adetleri (Ballon d'Or, gol krallığı vb.). Takım toplamına dahil DEĞİL. */
export interface IndividualAwards {
  ballonDor: number;
  fifaBest: number;
  goldenBoot: number;
  topScorerAwards: number;
  playerOfTheYear: number;
  otherIndividual: number;
  totalIndividual: number;
}
