/** Asal sayı testi. */
export function isPrime(n: number): boolean {
  if (!Number.isInteger(n) || n < 2) return false;
  if (n === 2) return true;
  if (n % 2 === 0) return false;
  for (let i = 3; i * i <= n; i += 2) {
    if (n % i === 0) return false;
  }
  return true;
}

/** Sesli harf sayısı (Türkçe + İngilizce). */
export function countVowels(s: string): number {
  // a, e, i, o, u, y + Türkçe ı, ö, ü
  return (s.match(/[aeiouyAEIOUYıİöÖüÜ]/g) ?? []).length;
}

/** Sessiz harf sayısı (Türkçe + İngilizce harfler). */
export function countConsonants(s: string): number {
  const totalLetters = (s.match(/[a-zA-ZçÇğĞıİöÖşŞüÜ]/g) ?? []).length;
  return totalLetters - countVowels(s);
}

/** Sadece harf karakterlerinin sayısı (boşluk + noktalama hariç). */
export function nameLetterCount(s: string): number {
  return (s.match(/[a-zA-ZçÇğĞıİöÖşŞüÜ]/g) ?? []).length;
}

/** Adı tek kelime mi (boşluk içermiyor)? */
export function isSingleWord(s: string): boolean {
  return !s.trim().includes(' ');
}

/** Kelime sayısı (boşluk ile bölünmüş, boş olmayanlar). */
export function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter((w) => w.length > 0).length;
}

/** İsmin son kelimesi (soyad genelde). */
export function lastWord(s: string): string {
  const parts = s.trim().split(/\s+/);
  return parts[parts.length - 1] ?? '';
}

/** İsmin ilk kelimesi. */
export function firstWord(s: string): string {
  return s.trim().split(/\s+/)[0] ?? '';
}

/** Belirli bir harfin string içinde kaç kez geçtiği (case-insensitive). */
export function countLetter(s: string, letter: string): number {
  const target = letter.toLowerCase();
  const normalized = s.toLowerCase();
  let count = 0;
  for (const ch of normalized) {
    if (ch === target) count++;
  }
  return count;
}

/**
 * Türkçe karakter içeriyor mu (ı, ğ, ş, ö, ü, ç).
 * Türk oyuncuları ayırt etmek için kullanılır.
 */
export function hasTurkishChar(s: string): boolean {
  return /[ıİğĞşŞöÖüÜçÇ]/.test(s);
}

/** Adın hece sayısının kaba tahmini (sesli harf sayısı). Türkçe + İng. */
export function syllableCount(s: string): number {
  return countVowels(s);
}

/** Palindrom kontrolü (boşluk + noktalama yok say, lowercase). */
export function isPalindrome(s: string): boolean {
  const clean = s
    .toLowerCase()
    .replace(/[^a-zçğıöşü]/gi, '');
  if (clean.length < 2) return false;
  return clean === clean.split('').reverse().join('');
}

/** Dot-notation ile nested object'ten değer çek. */
export function getByPath(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let cursor: unknown = obj;
  for (const p of parts) {
    if (cursor === null || cursor === undefined) return undefined;
    if (typeof cursor !== 'object') return undefined;
    cursor = (cursor as Record<string, unknown>)[p];
  }
  return cursor;
}

/** Bir alanın **bilinen** değer olup olmadığı (null/undefined/NaN/boş array değil). */
export function isKnown(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'number' && Number.isNaN(value)) return false;
  if (Array.isArray(value) && value.length === 0) return false;
  if (typeof value === 'string' && value.trim().length === 0) return false;
  return true;
}

/** İki sayının mutlak farkı (proximity için). */
export function absDiff(a: number, b: number): number {
  return Math.abs(a - b);
}

/** birthDate (yyyy-mm-dd) → yıl. */
export function birthYear(birthDate: string | undefined): number | null {
  if (!birthDate) return null;
  const y = parseInt(birthDate.slice(0, 4), 10);
  return Number.isFinite(y) ? y : null;
}

/** birthDate → ay (1-12). */
export function birthMonth(birthDate: string | undefined): number | null {
  if (!birthDate) return null;
  const m = parseInt(birthDate.slice(5, 7), 10);
  return Number.isFinite(m) ? m : null;
}

/** birthDate → gün (1-31). */
export function birthDay(birthDate: string | undefined): number | null {
  if (!birthDate) return null;
  const d = parseInt(birthDate.slice(8, 10), 10);
  return Number.isFinite(d) ? d : null;
}

/**
 * birthDate → mevsim adı.
 * Kuzey yarımküre standardı:
 *   - Aralık-Şubat: 'winter'
 *   - Mart-Mayıs: 'spring'
 *   - Haziran-Ağustos: 'summer'
 *   - Eylül-Kasım: 'autumn'
 */
export function birthSeason(birthDate: string | undefined): 'winter' | 'spring' | 'summer' | 'autumn' | null {
  const m = birthMonth(birthDate);
  if (m === null) return null;
  if (m === 12 || m === 1 || m === 2) return 'winter';
  if (m >= 3 && m <= 5) return 'spring';
  if (m >= 6 && m <= 8) return 'summer';
  return 'autumn';
}

/** Sezon adı Türkçeye çevir. */
export function seasonLabelTr(season: ReturnType<typeof birthSeason>): string {
  switch (season) {
    case 'winter': return 'kış';
    case 'spring': return 'ilkbahar';
    case 'summer': return 'yaz';
    case 'autumn': return 'sonbahar';
    default: return 'bilinmeyen';
  }
}

/**
 * Şu an'a göre yaş (yıl olarak, tam yıl).
 * SABİT 'NOW': pipeline çıktısı deterministik kalsın diye build sırasında belirlenir.
 *
 * Argüman: nowYear (default: oyun motorunun referans yılı).
 */
export function ageYears(birthDate: string | undefined, nowYear: number): number | null {
  const y = birthYear(birthDate);
  if (y === null) return null;
  return nowYear - y;
}
