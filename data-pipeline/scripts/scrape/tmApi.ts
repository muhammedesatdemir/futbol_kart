/**
 * Transfermarkt'ın resmi (ama açık) JSON API'sini çağırır.
 *
 * İki endpoint:
 *   1. tmapi-alpha.transfermarkt.technology/players?ids[]={tmId}
 *      → oyuncu metadata (ad, doğum, milliyet, boy, ayak, pozisyon, koord.)
 *   2. tmapi-alpha.transfermarkt.technology/clubs?ids[]={cid}&ids[]=...
 *      → kulüp detayları (ad, şehir, enlem/boylam, ülke)
 *
 * Auth/CSRF yok — sade fetch ile 200 OK. http.ts rate limit + cache uygular.
 */
import { fetchJson } from './http.js';

const TMAPI_BASE = 'https://tmapi-alpha.transfermarkt.technology';

interface TmApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

// ----- /players -----

export interface TmApiPlayer {
  id: string;
  /** TM'nin "name" alanı (genelde kısa) */
  name: string;
  /** TM'nin "shortName" alanı (kısa, kart üstü için) */
  shortName: string;
  /** Sanatçı/sahne adı (genelde shortName ile aynı) */
  artistName: string;
  /** TM'nin "displayName" alanı — TAM resmi ad ("Vinicius José Paixão de Oliveira Junior") */
  displayName: string;
  lifeDates: {
    age: number;
    /** ISO yyyy-mm-dd */
    dateOfBirth: string;
    isDateOfBirthUnknown: boolean;
    dateOfDeath: string | null;
  };
  birthPlaceDetails: {
    placeOfBirth: string;
    countryOfBirthId: number;
    placeOfBirthAdditionalInfo?: string;
    gender: 'male' | 'female';
  };
  nationalityDetails: {
    passportName: string;
    nationalities: {
      nationalityId: number;
      secondNationalityId?: number;
    };
  };
  attributes: {
    /** Metre cinsinden (1.76 = 176 cm) */
    height?: number;
    preferredFootId?: number;
    positionGroup?: string; // "FORWARD" | "MIDFIELD" | "DEFENDER" | "GOALKEEPER"
    positionGroupName?: string;
    positionId?: number;
    preferredFoot?: { id: number; name: 'left' | 'right' | 'both' };
    position?: {
      id: number;
      name: string;
      shortName: string;
      category: string;
    };
    contractUntil?: string;
    formerClubsNote?: string;
  };
  relativeUrl: string;
  portraitUrl?: string;
  marketValueDetails?: {
    current?: { value: number; currency: string };
    highest?: { value: number; currency: string };
  };
  clubAssignments?: Array<{
    playerId: string;
    clubId: string;
    shirtNumber: number | null;
    isCaptain: boolean;
    /** "current" | "nationalTeam" | "youth" */
    type: string;
    debut?: string;
    start?: string;
  }>;
}

/**
 * Bir veya daha fazla oyuncunun metadata'sını çek.
 * TM tek istekte birden fazla id alıyor — verimli batch.
 */
export async function fetchPlayers(tmIds: number[]): Promise<TmApiPlayer[]> {
  if (tmIds.length === 0) return [];
  const params = tmIds.map((id) => `ids[]=${id}`).join('&');
  const url = `${TMAPI_BASE}/players?${params}`;
  const env = await fetchJson<TmApiEnvelope<TmApiPlayer[]>>(url);
  if (!env.success) {
    throw new Error(`tmApi players failed: ${env.message}`);
  }
  return env.data;
}

// ----- /clubs -----

export interface TmApiClub {
  id: string;
  name: string;
  baseDetails: {
    shortName: string;
    abbreviation: string;
    isNationalTeam: boolean;
    countryId: number;
    primaryCompetitionId?: string;
    /** Asıl kulüp (B takım / U21 ayrı ise) */
    superiorClubId?: number;
    superiorClub?: {
      id: string;
      name: string;
      clubCode?: string;
      location?: {
        countryId: number;
        street?: string;
        postcode?: string;
        city?: string;
        latitude?: number;
        longitude?: number;
      };
      colors?: {
        firstColor?: string;
        secondColor?: string;
        thirdColor?: string;
      };
    };
  };
  relativeUrl: string;
  crestUrl?: string;
}

// ----- /quickselect/countries -----

export interface TmApiCountry {
  /** TM numeric id (string olarak gelir) — countryOfBirthId ile eşleşir */
  id: string;
  /** İngilizce ülke adı (örn. "Brazil", "Spain") */
  name: string;
  /** Bayrak/lig kısayolu (parser kullanmıyor) */
  link?: string;
}

/**
 * TM countryId → name mapping. Tek seferlik istek, ~250 ülke.
 * Cache'lenir (http.ts), tekrar çağırınca disk'ten gelir.
 */
export async function fetchCountries(): Promise<TmApiCountry[]> {
  const url = 'https://www.transfermarkt.com/quickselect/countries';
  // Bu endpoint envelope kullanmıyor — düz array
  return await fetchJson<TmApiCountry[]>(url);
}

/**
 * Bir veya daha fazla kulübün detayını çek.
 * 50+ kulüp tek istekte gelebilir — kariyer kulüpleri için ideal.
 */
export async function fetchClubs(clubIds: string[]): Promise<TmApiClub[]> {
  if (clubIds.length === 0) return [];
  // TM URL'i çok uzarsa hata verebilir; 60'lık parçalara böl
  const CHUNK = 60;
  const out: TmApiClub[] = [];
  for (let i = 0; i < clubIds.length; i += CHUNK) {
    const slice = clubIds.slice(i, i + CHUNK);
    const params = slice.map((id) => `ids[]=${id}`).join('&');
    const url = `${TMAPI_BASE}/clubs?${params}`;
    const env = await fetchJson<TmApiEnvelope<TmApiClub[]>>(url);
    if (!env.success) {
      throw new Error(`tmApi clubs failed (chunk ${i}): ${env.message}`);
    }
    out.push(...env.data);
  }
  return out;
}
