/**
 * Tur sonu değerlerini Türkçe + birim ile gösterir.
 * Şablon id'sine göre özel formatlama; bilinmeyen id'ler için sade fallback.
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

export function formatValue(
  templateId: string,
  value: number | boolean | null,
): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Evet' : 'Hayır';

  switch (templateId) {
    case 'q01_jersey_sum':
      return numTR(value);
    case 'q02_total_goals':
    case 'q03_max_season_goals':
    case 'q09_national_goals':
    case 'q25_last5_league_goals':
      return `${numTR(value)} gol`;
    case 'q04_total_apps':
    case 'q08_national_caps':
      return `${numTR(value)} maç`;
    case 'q05_club_count':
    case 'q14_distinct_club_countries':
      return `${numTR(value)} kulüp`;
    case 'q06_height':
      return `${numTR(value)} cm`;
    case 'q07_younger':
      // value = birthDate ms; daha genç = ms daha büyük
      return `${ageFromBirthMs(value)} yaşında`;
    case 'q10_total_assists':
      return `${numTR(value)} asist`;
    case 'q11_equator_dist':
      return `${numTR(value, 1)}°`;
    case 'q12_istanbul_dist':
    case 'q15_first_last_club_dist':
      return `${numTR(Math.round(value))} km`;
    case 'q13_more_north': {
      const abs = Math.abs(value);
      const dir = value >= 0 ? 'K' : 'G';
      return `${numTR(abs, 1)}° ${dir}`;
    }
    case 'q18_earlier_debut':
      return `${numTR(value)} yılı`;
    case 'q19_longest_stint':
    case 'q24_career_years':
      return `${numTR(value)} yıl`;
    case 'q20_decade_spread':
      return `${numTR(value)} on yıl`;
    case 'q26_longer_name':
      return `${numTR(value)} harf`;
    case 'q27_more_vowels':
      return `${numTR(value)} sesli`;
    case 'q29_max_transfer_fee':
      return fmtTransferFee(value);
    case 'q30_later_birth_month': {
      const i = Math.max(1, Math.min(12, Math.round(value))) - 1;
      return MONTH_NAMES_TR[i] ?? `${value}. ay`;
    }
    default:
      if (Number.isInteger(value)) return numTR(value);
      return numTR(value, 1);
  }
}

/**
 * Şablon kazananı için kısa açıklayıcı bir alt-yazı.
 * Örn. "Daha az olan kazandı" / "Daha çok olan kazandı".
 */
export function comparisonHint(
  templateId: string,
  compareOp: 'max' | 'min' | 'bool',
): string {
  if (compareOp === 'bool') {
    // bool'larda alt yazı daha az anlamlı — kısa kalsın
    return 'Sahip olan kazandı';
  }
  switch (templateId) {
    case 'q07_younger':
      return 'Daha genç olan kazandı';
    case 'q11_equator_dist':
    case 'q12_istanbul_dist':
    case 'q15_first_last_club_dist':
      return 'Daha yakın olan kazandı';
    case 'q18_earlier_debut':
      return 'Daha erken başlayan kazandı';
    default:
      return compareOp === 'max'
        ? 'Daha çok olan kazandı'
        : 'Daha az olan kazandı';
  }
}
