export interface LatLng {
  lat: number;
  lng: number;
}

export const ISTANBUL: LatLng = { lat: 41.0082, lng: 28.9784 };

export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const CAPITAL_CITIES = new Set(
  [
    'Madrid',
    'London',
    'Paris',
    'Berlin',
    'Rome',
    'Lisbon',
    'Amsterdam',
    'Brussels',
    'Vienna',
    'Prague',
    'Warsaw',
    'Budapest',
    'Athens',
    'Dublin',
    'Stockholm',
    'Oslo',
    'Copenhagen',
    'Helsinki',
    'Bucharest',
    'Sofia',
    'Belgrade',
    'Zagreb',
    'Kyiv',
    'Moscow',
    'Ankara',
    'Cairo',
    'Tehran',
    'Baghdad',
    'Riyadh',
    'Tokyo',
    'Beijing',
    'Seoul',
    'Bangkok',
    'Jakarta',
    'New Delhi',
    'Brasilia',
    'Buenos Aires',
    'Lima',
    'Santiago',
    'Bogota',
    'Caracas',
    'Mexico City',
    'Washington',
    'Ottawa',
    'Nairobi',
    'Lagos',
    'Pretoria',
    'Cape Town',
    'Canberra',
    'Wellington',
  ].map((s) => s.toLowerCase()),
);

export function isCapital(city?: string): boolean {
  if (!city) return false;
  return CAPITAL_CITIES.has(city.toLowerCase());
}
