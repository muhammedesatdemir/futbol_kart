/**
 * Saf filtre/arama fonksiyonları — kart seçme ekranı için.
 *
 * Kullanım:
 *   const filtered = applyFilters(players, clubsById, criteria);
 *
 * Server ve client'ta paylaşılır. Hiçbir React import'u yok.
 */
import type { Player, Position } from '@futbol-kart/shared-types';

export interface ClubLookup {
  id: string;
  name: string;
  country: string;
  countryCode: string;
}

export interface FilterCriteria {
  /** Arama metni (her şey: ad, ülke, lig, takım, forma) */
  search: string;
  /** Pozisyon filtresi (boş = hepsi) */
  position: Position | null;
  /** Ülke kodu filtresi (boş = hepsi) — ISO2: TR, BR, AR... */
  countryCode: string | null;
  /** Aktif/emekli filtresi (null = hepsi) */
  activeOnly: boolean | null;
  /** Çağ filtresi: aktif (2010+ debut), modern (1990-2010), efsane (öncesi) */
  era: 'active' | 'modern' | 'legend' | null;
}

export const EMPTY_CRITERIA: FilterCriteria = {
  search: '',
  position: null,
  countryCode: null,
  activeOnly: null,
  era: null,
};

/**
 * Türkçe + uluslararası karakterleri normalize et + lowercase.
 *
 * Aksanları (á→a, é→e, í→i, ñ→n, ç→c…) ve Türkçe'ye özel harfleri soyar ki
 * "Ángel Di María" → "angel di maria" olarak aransın. Hem oyuncu verisi hem de
 * arama terimi bu fonksiyondan geçirilmelidir.
 *
 * Tüm modların arama kutuları (Liste, Kadro, Hedef…) buraya bağlanmalı —
 * ham `.toLowerCase().includes()` kullanılmamalı.
 */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u')
    .trim();
}

/** Bir oyuncunun "şu anki" kulübünü bul (clubs[].toYear === null veya en yeni). */
export function currentClub(player: Player, clubsById: Map<string, ClubLookup>): ClubLookup | null {
  if (player.clubs.length === 0) return null;
  // Önce toYear === null olanı dene (aktif sözleşme)
  const active = player.clubs.find((c) => c.toYear === null);
  if (active) return clubsById.get(active.clubId) ?? null;
  // Yoksa en son sezonu olanı
  const last = [...player.clubs].sort((a, b) => (b.toYear ?? 0) - (a.toYear ?? 0))[0];
  return last ? clubsById.get(last.clubId) ?? null : null;
}

/** Oyuncunun çağını tahmin et (proDebutYear bazlı). */
export function eraOf(player: Player): 'active' | 'modern' | 'legend' {
  const debut = player.stats.proDebutYear;
  if (debut === undefined) return 'modern';
  if (debut >= 2010) return 'active';
  if (debut >= 1990) return 'modern';
  return 'legend';
}

/**
 * Arama metni (multi-field): bir oyuncuda herhangi bir match var mı?
 *
 * Aranan alanlar:
 *   - displayName, name (tam ad)
 *   - nationality, nationalityCode
 *   - birthCity, birthCountry
 *   - mevcut kulübün adı + ülkesi
 *   - jerseyNumbers (#10 formatı)
 *   - pozisyon (Türkçe + İngilizce)
 */
function matchesSearch(
  player: Player,
  searchTerms: string[],
  currentClubName: string,
  currentClubCountry: string,
): boolean {
  if (searchTerms.length === 0) return true;
  const haystack = normalize([
    player.displayName,
    player.name,
    player.nationality,
    player.nationalityCode,
    player.birthCity ?? '',
    player.birthCountry ?? '',
    currentClubName,
    currentClubCountry,
    player.jerseyNumbers.map((n) => `#${n}`).join(' '),
    positionSearchTokens(player.position),
  ].join(' '));

  // TÜM terimler haystack'te olmalı (AND mantığı)
  return searchTerms.every((t) => haystack.includes(t));
}

/** Pozisyon arama token'ları: TR + EN. */
function positionSearchTokens(pos: Position): string {
  switch (pos) {
    case 'GK':
      return 'kaleci goalkeeper gk';
    case 'DEF':
      return 'defans defender def stoper';
    case 'MID':
      return 'orta saha midfielder mid mf';
    case 'FWD':
      return 'forvet forward fw striker';
  }
}

/**
 * Tüm filtreleri uygula ve filtrelenmiş oyuncu listesini dön.
 * Önce ucuz filtreler (pozisyon/ülke), sonra arama (en pahalı).
 */
export function applyFilters(
  players: Player[],
  clubsById: Map<string, ClubLookup>,
  criteria: FilterCriteria,
): Player[] {
  const searchTerms = normalize(criteria.search)
    .split(/\s+/)
    .filter((t) => t.length > 0);

  return players.filter((p) => {
    // Ucuz filtreler önce
    if (criteria.position && p.position !== criteria.position) return false;
    if (criteria.countryCode && p.nationalityCode !== criteria.countryCode) return false;
    if (criteria.activeOnly !== null && p.isActive !== criteria.activeOnly) return false;
    if (criteria.era && eraOf(p) !== criteria.era) return false;
    // Arama
    if (searchTerms.length > 0) {
      const club = currentClub(p, clubsById);
      const ok = matchesSearch(
        p,
        searchTerms,
        club?.name ?? '',
        club?.country ?? '',
      );
      if (!ok) return false;
    }
    return true;
  });
}

/**
 * Varsayılan kart havuzu için "kürasyon" — efsane + güncel karışımı.
 *
 * Strateji:
 *   - Yarısı: en yüksek market value (aktif)
 *   - Yarısı: efsaneler (1990 öncesi debut + market value ortalama üstü)
 *
 * Tekrar yoksa, deterministik (her render'da aynı) — UX tutarlılığı.
 */
export function curateDefaultPool(
  players: Player[],
  count: number = 32,
): Player[] {
  const half = Math.floor(count / 2);

  // Aktif oyuncular, market value'ye göre sırala
  const actives = players
    .filter((p) => p.isActive && (p.stats.maxTransferFeeEUR ?? 0) > 0)
    .sort((a, b) => (b.stats.maxTransferFeeEUR ?? 0) - (a.stats.maxTransferFeeEUR ?? 0))
    .slice(0, half);

  // Efsaneler: 1990 öncesi debut, market value yüksek (artist ratio)
  const legends = players
    .filter((p) => eraOf(p) === 'legend' || eraOf(p) === 'modern')
    .filter((p) => !actives.includes(p))
    .sort((a, b) => {
      // Önce gol sayısı (efsane göstergesi)
      const ga = a.stats.totalGoals + a.stats.totalAssists;
      const gb = b.stats.totalGoals + b.stats.totalAssists;
      return gb - ga;
    })
    .slice(0, count - actives.length);

  // İki listeyi birleştir, interleave (efsane-güncel sıralı)
  const out: Player[] = [];
  for (let i = 0; i < Math.max(actives.length, legends.length); i++) {
    if (legends[i]) out.push(legends[i]!);
    if (actives[i]) out.push(actives[i]!);
  }
  return out.slice(0, count);
}

/** Hızlı club lookup map oluştur. */
export function buildClubLookup(
  clubs: Array<{ id: string; name: string; country: string; countryCode: string }>,
): Map<string, ClubLookup> {
  const m = new Map<string, ClubLookup>();
  for (const c of clubs) m.set(c.id, c);
  return m;
}

/**
 * Tüm benzersiz ülke kodlarını (filtre dropdown için) listele.
 * Sıralı: önce TR, sonra alfabetik.
 */
export function uniqueCountries(players: Player[]): Array<{ code: string; name: string }> {
  const map = new Map<string, string>();
  for (const p of players) {
    if (p.nationalityCode && !map.has(p.nationalityCode)) {
      map.set(p.nationalityCode, p.nationality);
    }
  }
  const arr = [...map.entries()].map(([code, name]) => ({ code, name }));
  arr.sort((a, b) => {
    if (a.code === 'TR') return -1;
    if (b.code === 'TR') return 1;
    return a.name.localeCompare(b.name);
  });
  return arr;
}

/**
 * Tüm benzersiz lig adlarını (mevcut kulüplerin primary lig'i) listele.
 * Şimdilik kulüp ülkesi bazlı gruplama — gerçek lig yok.
 */
export function uniqueLeagues(
  clubs: Array<{ country: string; countryCode: string }>,
): Array<{ key: string; label: string }> {
  const seen = new Set<string>();
  const out: Array<{ key: string; label: string }> = [];
  for (const c of clubs) {
    if (!c.countryCode || seen.has(c.countryCode)) continue;
    seen.add(c.countryCode);
    out.push({ key: c.countryCode, label: c.country });
  }
  out.sort((a, b) => a.label.localeCompare(b.label));
  return out;
}
