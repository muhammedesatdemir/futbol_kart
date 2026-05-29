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
