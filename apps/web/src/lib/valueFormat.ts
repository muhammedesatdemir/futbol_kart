/**
 * Tur sonu değerlerini Türkçe + birim ile gösterir.
 * Şablon id'sine göre özel formatlama; bilinmeyen id'ler için sade fallback.
 *
 * v2 — 121 yeni şablon ID'sine göre güncellenmiştir.
 */

const MONTH_NAMES_TR = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
];

const REFERENCE_YEAR = 2025;

function numTR(n: number, fractionDigits = 0): string {
  return n.toLocaleString('tr-TR', {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  });
}

function ageFromBirthMs(ms: number): number {
  const today = new Date();
  const birth = new Date(ms);
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const m = today.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && today.getUTCDate() < birth.getUTCDate())) age--;
  return age;
}

function fmtTransferFee(eur: number): string {
  if (eur >= 1_000_000) return `${numTR(eur / 1_000_000, 1)} M€`;
  if (eur >= 1_000) return `${numTR(eur / 1_000)} K€`;
  return `${numTR(eur)} €`;
}

/**
 * Format tablosu. Şablon ID'si → birim. Kapanmayan formatlar (proximity, k12 vb.)
 * runtime'da parametre ile değişir; o yüzden default sayısal döner.
 */
const UNIT_BY_TEMPLATE: Record<string, string> = {
  // gol birimleri
  n01_total_goals: 'gol',
  n05_national_goals: 'milli gol',
  n06_max_season_goals: 'gol',
  n07_last5_league_goals: 'gol',
  n18_kulup_golu: 'kulüp golü',
  n17_total_goal_contribution: 'g+a',
  c06_max_club_goals: 'gol',
  // maç birimleri
  n03_total_apps: 'maç',
  n04_national_caps: 'milli maç',
  n19_kulup_maci: 'kulüp maçı',
  c05_max_club_apps: 'maç',
  // asist birimleri
  n02_total_assists: 'asist',
  // kulüp birimleri
  n25_club_count: 'kulüp',
  c01_club_count: 'kulüp',
  g10_distinct_club_countries: 'ülke',
  g11_distinct_club_continents: 'kıta',
  // kariyer birimleri
  n09_career_years: 'yıl',
  c02_longest_stint_years: 'yıl',
  t12_active_years_now: 'yıl',
  t08_decade_spread: 'on yıl',
  // ad birimleri
  k01_name_letter_count: 'harf',
  k02_display_letter_count: 'harf',
  k09_lastname_length: 'harf',
  k10_firstname_length: 'harf',
  k03_name_word_count: 'kelime',
  k04_name_vowels: 'sesli',
  k05_name_consonants: 'sessiz',
  k06_name_syllables: 'hece',
  k12_name_letter_count_target: 'kez',
  // forma birimleri
  n12_jersey_sum: '',
  n13_jersey_avg: '',
  n14_jersey_max: '#',
  n15_jersey_min: '#',
  n16_jersey_distinct: 'numara',
};

export function formatValue(
  templateId: string,
  value: number | boolean | null,
): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Evet' : 'Hayır';

  // Özel format gerektiren ID'ler
  switch (templateId) {
    case 'n11_height_cm':
    case 'n11b_height_cm_min':
      return `${numTR(value)} cm`;

    case 'n08_max_transfer_fee':
    case 'e10_high_value_active':
      return fmtTransferFee(value);

    case 'e09_national_dominant':
      // Milli gol oranı (0..1) → yüzde
      return `%${numTR(value * 100)}`;

    case 'n10_pro_debut_year':
    case 't03_birth_year':
    case 'c03_first_club_year_early':
    case 'c04_last_club_year_late':
      return `${numTR(value)}`; // yıl olarak gösterilir (örn. "2003")

    case 't01_younger':
    case 't02_older':
      // value = birthDate ms
      return `${ageFromBirthMs(value)} yaş`;

    case 't10_age_today_older':
      return `${numTR(value)} yaş`;

    case 't07_debut_age_young':
      return `${numTR(value)} yaş`;

    case 't04_birth_month_late': {
      const i = Math.max(1, Math.min(12, Math.round(value))) - 1;
      return MONTH_NAMES_TR[i] ?? `${value}. ay`;
    }
    case 't05_birth_day_late':
      return `${numTR(value)}. gün`;

    case 't06_earlier_debut':
      return `${numTR(value)} yılı`;

    case 'g01_equator_dist':
    case 'g03_north_latitude':
    case 'g04_south_latitude':
    case 'g05_east_longitude':
    case 'g06_west_longitude':
      return `${numTR(Math.abs(value), 1)}°`;

    case 'g02_istanbul_dist':
    case 'g14_first_last_club_dist':
    case 'g15_birth_to_first_club_dist':
      return `${numTR(Math.round(value))} km`;

    case 'g22_lat_proximity_target':
    case 'x01_age_proximity':
    case 'x02_height_proximity':
    case 'x03_goals_proximity':
    case 'x04_apps_proximity':
    case 'x05_jersey_proximity':
    case 'x06_birth_year_proximity':
    case 'x07_career_years_proximity':
    case 'x08_club_count_proximity':
    case 'x09_assists_proximity':
    case 'x10_national_caps_proximity':
      // Proximity değerleri negatif (mutlak fark). Mutlak değeri göster.
      return `Fark: ${numTR(Math.abs(value), 1)}`;

    // Composite ratiolar — virgüllü
    case 'n20_avg_goals_per_season':
    case 'n21_avg_apps_per_season':
    case 'n22_goal_per_match':
    case 'n23_assist_per_match':
    case 'n24_national_goal_per_cap':
      return numTR(value, 2);
    default:
      break;
  }

  // Tablo ile sade birim
  const unit = UNIT_BY_TEMPLATE[templateId];
  if (unit !== undefined) {
    return unit ? `${numTR(value)} ${unit}` : numTR(value);
  }

  // Bilinmeyenlerde fallback
  if (Number.isInteger(value)) return numTR(value);
  return numTR(value, 1);
}

/**
 * Şablon kazananı için kısa açıklayıcı alt-yazı.
 */
export function comparisonHint(
  templateId: string,
  compareOp: 'max' | 'min' | 'bool',
): string {
  if (compareOp === 'bool') {
    return 'Şartı sağlayan kazandı';
  }
  switch (templateId) {
    case 't01_younger':
      return 'Daha genç olan kazandı';
    case 't02_older':
    case 't10_age_today_older':
      return 'Daha yaşlı olan kazandı';
    case 'g01_equator_dist':
    case 'g02_istanbul_dist':
      return 'Daha yakın olan kazandı';
    case 't06_earlier_debut':
    case 'c03_first_club_year_early':
    case 'n10_pro_debut_year':
      return 'Daha erken başlayan kazandı';
    case 'g04_south_latitude':
    case 'g06_west_longitude':
    case 'n11b_height_cm_min':
    case 'n15_jersey_min':
    case 't07_debut_age_young':
      return 'Daha küçük olan kazandı';
    default:
      if (templateId.includes('_proximity')) {
        return 'Hedefe daha yakın olan kazandı';
      }
      return compareOp === 'max'
        ? 'Daha çok olan kazandı'
        : 'Daha az olan kazandı';
  }
}

// REFERENCE_YEAR — gelecekteki üst kodlar için
export { REFERENCE_YEAR };
