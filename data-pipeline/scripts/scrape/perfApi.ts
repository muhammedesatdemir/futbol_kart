/**
 * Transfermarkt'ın "performance-game" endpoint'i — oyuncunun **her maçı**.
 *
 * URL: transfermarkt.com/ceapi/performance-game/{tmId}
 *
 * Tek istekte tüm kariyer döner (Vinicius için 651 maç, ~1.4 MB).
 * İçinden 13+ şablonun ihtiyaç duyduğu agregat istatistikler türetilir:
 *   - totalGoals / totalAssists / totalApps
 *   - maxSeasonGoals (en yüksek sezon golü)
 *   - nationalCaps / nationalGoals
 *   - proDebutYear / careerYears
 *   - last5LeagueGoals
 *   - clubs[] (ClubStint: fromYear, toYear, apps, goals, jerseyNo)
 *   - dominantJerseyNo (kariyer boyunca en çok takılan numara — q28 için)
 *
 * Auth/CSRF yok — sade fetchJson + http.ts rate limit (2 sn).
 */
import { fetchJson } from './http.js';

const PERF_BASE = 'https://www.transfermarkt.com/ceapi/performance-game';

interface PerfEnvelope {
  success: boolean;
  message: string;
  data: {
    playerId: string;
    performance: PerfGame[];
    clubIds: string[];
    coachIds: string[];
    competitionIds: string[];
    gameIds: string[];
  };
}

export interface PerfGame {
  gameInformation: {
    gameId: string;
    competitionId: string;
    competitionTypeId: number;
    seasonId: number;
    gameDay: number;
    gameDuration: number;
    isNationalGame: boolean;
    date?: {
      dateTimeUTC: string;
      dateTimeLocalized: string;
    };
    season?: {
      id: number;
      display: string;
      cyclicalName: string;
      nonCyclicalName: string;
    };
  };
  clubsInformation?: {
    club?: {
      venue: 'home' | 'away';
      clubId: string;
      goalsTotal: number;
      opponentGoalsTotal: number;
      clubRank?: number;
    };
    opponent?: {
      clubId: string;
    };
  };
  statistics?: {
    generalStatistics?: {
      shirtNumber: number | null;
      isCaptain: boolean;
      participationState: 'played' | 'not in squad' | 'on bench' | string;
      positionId: number | null;
      injuryId: number;
      absenceId: number;
      age: number;
    };
    goalStatistics?: {
      goalsScoredTotal: number | null;
      goalsScoredTotalOfficial: number | null;
      assists: number | null;
      assistsOfficial: number | null;
      ownGoalsScored: number | null;
      /** Oyuncu sahadayken rakibin attığı gol (kaleci "yediği gol" için). */
      opponentGoalsOnThePitch?: number | null;
    };
  };
}

/** Tek oyuncu için performance-game çek. */
export async function fetchPerformance(tmId: number): Promise<PerfGame[]> {
  const url = `${PERF_BASE}/${tmId}`;
  const env = await fetchJson<PerfEnvelope>(url);
  if (!env.success) {
    throw new Error(`perfApi ${tmId} failed: ${env.message}`);
  }
  return env.data.performance;
}

// ----- Agregasyon -----

export interface ClubStintAgg {
  clubId: string;
  /** Bu kulüpte ilk oynadığı sezon (TM seasonId — 2018 = 2018/19) */
  fromSeason: number;
  /** Bu kulüpte son oynadığı sezon */
  toSeason: number;
  apps: number;
  goals: number;
  assists: number;
  /** Bu kulüpte en sık takılan forma numarası */
  primaryJerseyNo?: number;
  /** Milli takım stint'i mi? */
  isNational: boolean;
}

export interface AggregatedStats {
  totalGoals: number;
  totalAssists: number;
  totalApps: number;
  /** En verimli sezondaki kulüp golü (milli hariç) */
  maxSeasonGoals: number;
  nationalCaps: number;
  nationalGoals: number;
  /** İlk "played" maçın sezon ID'si (2018 = 2018/19 sezon başı) */
  proDebutYear?: number;
  /** Son sezon ID'si — careerYears = (last - first) + 1 */
  careerYears?: number;
  /** Son 5 sezon kulüp ligi golü toplamı (q25) */
  last5LeagueGoals: number;
  /** Kariyer boyunca en çok takılan forma numarası (q28) */
  dominantJerseyNo?: number;
  /** Kulüp stint'leri (kulüpId + ilk/son sezon + apps/goals) */
  clubStints: ClubStintAgg[];
  /** Milli takım clubId'leri (3439 = Brazil vb.) — clubs lookup için */
  nationalTeamClubIds: string[];
}

const PLAYED = 'played';

/**
 * Sezon ID → "ana lig" kabul edilen competitionId mi?
 * TM competition type 1 = ulusal lig (ES1, BRA1, EN1, IT1, FR1, DE1).
 * Kupalar, CL, milli turnuvalar dışlanır.
 */
function isMainLeague(g: PerfGame): boolean {
  return g.gameInformation.competitionTypeId === 1
    && !g.gameInformation.isNationalGame;
}

/**
 * En çok geçen forma numarasını dön. null'ları yok say.
 */
function modeJersey(numbers: Array<number | null | undefined>): number | undefined {
  const tally = new Map<number, number>();
  for (const n of numbers) {
    // TM bazı altyapı/milli maçlarda 0 ya da null verir — geçerli forma değil
    if (typeof n !== 'number' || n <= 0) continue;
    tally.set(n, (tally.get(n) ?? 0) + 1);
  }
  let best: number | undefined;
  let bestCount = 0;
  for (const [n, c] of tally) {
    if (c > bestCount) { best = n; bestCount = c; }
  }
  return best;
}

/**
 * Maç-maç performance dizisini şablonlar için kullanılabilir agregat'a indir.
 *
 * NOT: TM, A milli + altyapı milli takım (U23, U21, U20, U19, U17) maçlarını
 * birlikte verir. Bu agregat ÖNCE tüm milli takım stint'lerini gruplayıp,
 * EN ÇOK MAÇI olan stint'i "A milli" kabul eder. nationalCaps/nationalGoals
 * yalnızca A milli stint'inden hesaplanır — diğer milli takım maçları toplam
 * sayılır ama nationalCaps'e dahil değildir.
 *
 * Bu sayede Wikipedia ile uyumlu A milli rakamları üretilir
 * (örn. Pirlo nat caps 116, eskiden 166 idi — U23 dahildi).
 */
export function aggregate(performance: PerfGame[]): AggregatedStats {
  let totalGoals = 0;
  let totalAssists = 0;
  let totalApps = 0;

  // Kulüp stint'leri için group key: clubId
  const byClub = new Map<string, {
    clubId: string;
    seasons: Set<number>;
    apps: number;
    goals: number;
    assists: number;
    jerseys: Array<number | null | undefined>;
    isNational: boolean;
  }>();

  // Sezon başına gol (kulüp; milli hariç) — maxSeasonGoals + last5LeagueGoals için
  const clubGoalsBySeason = new Map<number, number>();
  // Sezon başına lig (competitionTypeId=1) golleri — last5LeagueGoals için
  const leagueGoalsBySeason = new Map<number, number>();

  const allJerseys: Array<number | null | undefined> = [];

  // proDebut / careerYears
  let minPlayedSeason: number | undefined;
  let maxPlayedSeason: number | undefined;

  // Milli takım stint'lerinin ham sayım — clubId → {apps, goals}
  // İkinci geçişte en çok apps'liyi "A milli" kabul ederiz
  const nationalStintRaw = new Map<string, { apps: number; goals: number }>();

  for (const g of performance) {
    const gen = g.statistics?.generalStatistics;
    const goals = g.statistics?.goalStatistics?.goalsScoredTotal ?? 0;
    const assists = g.statistics?.goalStatistics?.assists ?? 0;
    const clubId = g.clubsInformation?.club?.clubId;
    const season = g.gameInformation.seasonId;
    const isNat = g.gameInformation.isNationalGame;
    const played = gen?.participationState === PLAYED;

    if (!clubId) continue;

    if (played) {
      totalApps++;
      totalGoals += goals;
      totalAssists += assists;
      if (isNat) {
        // Şimdilik sadece raw biriktirme; A milli ayrımı aşağıda yapılır
        const existing = nationalStintRaw.get(clubId) ?? { apps: 0, goals: 0 };
        existing.apps++;
        existing.goals += goals;
        nationalStintRaw.set(clubId, existing);
      } else {
        clubGoalsBySeason.set(season, (clubGoalsBySeason.get(season) ?? 0) + goals);
        if (isMainLeague(g)) {
          leagueGoalsBySeason.set(season, (leagueGoalsBySeason.get(season) ?? 0) + goals);
        }
      }
      minPlayedSeason = minPlayedSeason === undefined ? season : Math.min(minPlayedSeason, season);
      maxPlayedSeason = maxPlayedSeason === undefined ? season : Math.max(maxPlayedSeason, season);
      allJerseys.push(gen?.shirtNumber);
    }

    let bucket = byClub.get(clubId);
    if (!bucket) {
      bucket = {
        clubId,
        seasons: new Set(),
        apps: 0,
        goals: 0,
        assists: 0,
        jerseys: [],
        isNational: isNat,
      };
      byClub.set(clubId, bucket);
    }
    bucket.seasons.add(season);
    if (played) {
      bucket.apps++;
      bucket.goals += goals;
      bucket.assists += assists;
      bucket.jerseys.push(gen?.shirtNumber);
    }
  }

  // İkinci geçiş: A milli takımı belirle — en çok played apps'li milli stint
  // Beraberlik durumunda en çok gol'lüyü tercih et
  let aMilliClubId: string | undefined;
  let aMilliApps = 0;
  let aMilliGoals = 0;
  for (const [clubId, stat] of nationalStintRaw) {
    const better =
      stat.apps > aMilliApps ||
      (stat.apps === aMilliApps && stat.goals > aMilliGoals);
    if (better) {
      aMilliClubId = clubId;
      aMilliApps = stat.apps;
      aMilliGoals = stat.goals;
    }
  }
  const nationalCaps = aMilliApps;
  const nationalGoals = aMilliGoals;
  const nationalTeamClubIds = new Set<string>(aMilliClubId ? [aMilliClubId] : []);

  const maxSeasonGoals = clubGoalsBySeason.size
    ? Math.max(...clubGoalsBySeason.values())
    : 0;

  // last5 = son 5 sezonun lig golü toplamı (oyunun şu anki yılını bilmiyoruz;
  // oyuncunun en son aktif sezonundan geriye 5 sezon say)
  let last5LeagueGoals = 0;
  if (maxPlayedSeason !== undefined) {
    for (let s = maxPlayedSeason; s > maxPlayedSeason - 5; s--) {
      last5LeagueGoals += leagueGoalsBySeason.get(s) ?? 0;
    }
  }

  const dominantJerseyNo = modeJersey(allJerseys);

  const clubStints: ClubStintAgg[] = [];
  for (const b of byClub.values()) {
    const seasons = [...b.seasons].sort((a, c) => a - c);
    if (seasons.length === 0 || b.apps === 0) continue;
    clubStints.push({
      clubId: b.clubId,
      fromSeason: seasons[0]!,
      toSeason: seasons[seasons.length - 1]!,
      apps: b.apps,
      goals: b.goals,
      assists: b.assists,
      primaryJerseyNo: modeJersey(b.jerseys),
      isNational: b.isNational,
    });
  }
  // Sezon başlangıcına göre sırala
  clubStints.sort((a, c) => a.fromSeason - c.fromSeason);

  const careerYears = minPlayedSeason !== undefined && maxPlayedSeason !== undefined
    ? maxPlayedSeason - minPlayedSeason + 1
    : undefined;

  return {
    totalGoals,
    totalAssists,
    totalApps,
    maxSeasonGoals,
    nationalCaps,
    nationalGoals,
    proDebutYear: minPlayedSeason,
    careerYears,
    last5LeagueGoals,
    dominantJerseyNo,
    clubStints,
    nationalTeamClubIds: [...nationalTeamClubIds],
  };
}
