export interface Club {
  id: string;
  name: string;
  city: string;
  country: string;
  countryCode: string;
  continent: Continent;
  lat: number;
  lng: number;
  founded?: number;
  /** Kulüp amblemi (TM crestUrl). Popüler kulüplerde dolu — kulüp-bazlı modlar için. */
  crestUrl?: string;
  /** Kulüp renkleri (logo fallback / tema). */
  colors?: {
    primary?: string;
    secondary?: string;
    tertiary?: string;
  };
}

export type Continent =
  | 'Europe'
  | 'South America'
  | 'North America'
  | 'Africa'
  | 'Asia'
  | 'Oceania';

export interface ClubStint {
  clubId: string;
  fromYear: number;
  toYear: number | null;
  apps: number;
  goals: number;
  jerseyNo?: number;
}
