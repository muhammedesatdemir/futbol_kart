/**
 * Scrape sonuçlarını (cache/players-raw.json) mevcut manuel seed ile birleştir.
 *
 * 1. cache/players-raw.json içindeki TmPlayer kayıtlarını oku
 * 2. clubStint'lerde geçen TÜM unique clubId'leri topla → tmApi.fetchClubs ile
 *    tek istekte koordinat + şehir + ülke al
 * 3. tmApi.fetchCountries — birthCountryId → "Brazil" gibi ad çevirisi
 * 4. Yeni kulüpleri seed/clubs.json'a ekle (id = "tm_" + clubId)
 * 5. Her TmPlayer → Player'a çevir (mevcut 50 manuel seed dokunulmaz)
 * 6. seed/players.json + seed/clubs.json güncellenir
 *
 * Önce: scrape:list, scrape:players çalıştırılmalı.
 *
 * Kullanım:
 *   pnpm --filter @futbol-kart/data-pipeline scrape:merge
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Club, ClubStint, Continent, Player, Position } from '@futbol-kart/shared-types';
import type { TmPlayer } from './players.js';
import { fetchClubs, fetchCountries, type TmApiClub } from './tmApi.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PIPELINE_ROOT = join(__dirname, '..', '..');
const CACHE_DIR = join(PIPELINE_ROOT, 'cache');

const PLAYERS_RAW = join(CACHE_DIR, 'players-raw.json');
const SEED_PLAYERS = join(PIPELINE_ROOT, 'seed', 'players.json');
const SEED_CLUBS = join(PIPELINE_ROOT, 'seed', 'clubs.json');
const SEED_BLOCKLIST = join(PIPELINE_ROOT, 'seed', 'blocklist.json');

/**
 * "Aktif futbolcu" eşiği — oyuncunun en son kulüp stinti bu yıl veya sonrasında
 * bitiyorsa hâlâ oynuyor sayılır. Veri 2026 başında çekildi; son sezon ~2025.
 * Son 2 sezonu kapsar (sakatlık/transfer boşluklarını tolere eder). Bu eşik
 * `isActive`'i belirler — Kadro Kur "en yaşlı/genç (aktif)" kriterleri + kart
 * seçim ekranının "aktif" çağ filtresi buna dayanır.
 */
const ACTIVE_SINCE_YEAR = 2024;

/**
 * Ülke adı (TM English) → ISO 2 harfli kod.
 * Eksik kalan ülkeler "XX" — corrections.csv ile düzeltilir.
 */
const COUNTRY_CODE: Record<string, string> = {
  Turkey: 'TR', 'Türkiye': 'TR',
  Brazil: 'BR', Brezilya: 'BR',
  Argentina: 'AR', Arjantin: 'AR',
  Portugal: 'PT', Portekiz: 'PT',
  France: 'FR', Fransa: 'FR',
  Germany: 'DE', Almanya: 'DE',
  Italy: 'IT', İtalya: 'IT',
  England: 'EN', İngiltere: 'EN', 'United Kingdom': 'EN',
  // Scotland/Wales/NI'yi de "EN" (Birleşik Krallık) altına alıyoruz — schema 2 karakter zorunlu;
  // q14_distinct_club_countries pratikte UK'yi tek ülke kabul ediyor.
  Scotland: 'EN', Wales: 'EN', 'Northern Ireland': 'EN',
  Ireland: 'IE',
  Netherlands: 'NL', Hollanda: 'NL',
  Belgium: 'BE', Belçika: 'BE',
  Spain: 'ES', İspanya: 'ES',
  Russia: 'RU', Rusya: 'RU',
  Japan: 'JP', Japonya: 'JP',
  'Saudi Arabia': 'SA', 'Suudi Arabistan': 'SA',
  'United States': 'US', ABD: 'US', USA: 'US',
  Cameroon: 'CM', Kamerun: 'CM',
  Croatia: 'HR', Hırvatistan: 'HR',
  Egypt: 'EG', Mısır: 'EG',
  Norway: 'NO', Norveç: 'NO',
  Poland: 'PL', Polonya: 'PL',
  Georgia: 'GE', Gürcistan: 'GE',
  'Ivory Coast': 'CI', 'Fildişi Sahili': 'CI', "Cote D'Ivoire": 'CI',
  Colombia: 'CO', Kolombiya: 'CO',
  Uruguay: 'UY',
  Chile: 'CL', Şili: 'CL',
  Senegal: 'SN',
  Morocco: 'MA', Fas: 'MA',
  Algeria: 'DZ', Cezayir: 'DZ',
  Nigeria: 'NG', Nijerya: 'NG',
  Austria: 'AT', Avusturya: 'AT',
  Denmark: 'DK', Danimarka: 'DK',
  Sweden: 'SE', İsveç: 'SE',
  Switzerland: 'CH', İsviçre: 'CH',
  'Czech Republic': 'CZ', Çekya: 'CZ',
  Serbia: 'RS', Sırbistan: 'RS',
  Greece: 'GR', Yunanistan: 'GR',
  Ukraine: 'UA', Ukrayna: 'UA',
  Mexico: 'MX', Meksika: 'MX',
  Ecuador: 'EC',
  Slovenia: 'SI', Slovakya: 'SK', Slovakia: 'SK',
  Hungary: 'HU', Macaristan: 'HU',
  Albania: 'AL',
  Romania: 'RO',
  Paraguay: 'PY',
  Bolivia: 'BO',
  Iran: 'IR', İran: 'IR',
  'South Korea': 'KR', 'Korea, South': 'KR',
  Australia: 'AU', Avustralya: 'AU',
  Canada: 'CA', Kanada: 'CA',
  Mali: 'ML',
  Ghana: 'GH', Gana: 'GH',
  'DR Congo': 'CD',
  'The Gambia': 'GM',
  Eritrea: 'ER',
  Guinea: 'GN',
  Honduras: 'HN',
  Peru: 'PE',
  Venezuela: 'VE',
  Israel: 'IL', İsrail: 'IL',
};

/** TM countryId → İngilizce ülke adı (quickselect/countries'ten). Mapping bellek içi. */
const countryNameById = new Map<number, string>();

/** TM ülke adı → kıta (kabaca). Bilinmeyenler "Europe" default'lar. */
function continentFromCountry(countryName: string): Continent {
  const lower = countryName.toLowerCase();
  // South America
  if (/brazil|argentin|uruguay|chile|colomb|paraguay|peru|ecuador|venezuel|boliv/.test(lower)) {
    return 'South America';
  }
  // Africa
  if (/algeria|angola|benin|botswana|burkina|burundi|cameroon|cape verde|chad|comoros|congo|djibouti|egypt|equatorial|eritrea|ethiopia|gabon|gambia|ghana|guinea|ivory|kenya|lesotho|liberia|libya|madagascar|malawi|mali|mauritania|mauritius|morocco|mozambique|namibia|niger|nigeria|rwanda|senegal|sierra|somalia|south africa|south sudan|sudan|swaziland|tanzania|togo|tunisia|uganda|zambia|zimbabwe/.test(lower)) {
    return 'Africa';
  }
  // North America (Caribbean dahil)
  if (/united states|usa|canada|mexico|guatemala|honduras|nicaragua|costa rica|panama|cuba|jamaica|haiti|dominican|trinidad|bahamas|barbados|belize|el salvador/.test(lower)) {
    return 'North America';
  }
  // Asia
  if (/afghanistan|armenia|azerbaijan|bahrain|bangladesh|bhutan|brunei|cambodia|china|cyprus|india|indonesia|iran|iraq|israel|japan|jordan|kazakhstan|korea|kuwait|kyrgyzstan|laos|lebanon|malaysia|maldives|mongolia|myanmar|nepal|oman|pakistan|palestine|philippines|qatar|saudi|singapore|sri lanka|syria|tajikistan|thailand|timor|turkmenistan|uzbekistan|united arab|vietnam|yemen/.test(lower)) {
    return 'Asia';
  }
  // Oceania
  if (/australia|new zealand|fiji|papua|samoa|tonga|vanuatu|solomon/.test(lower)) {
    return 'Oceania';
  }
  // Default Europe
  return 'Europe';
}

/**
 * TM countryId → ISO 3166-1 alpha-2 doğrudan mapping.
 *
 * TM'in name lookup'ı karakter normalize / büyük-küçük harf sorunlarıyla
 * yer yer false negative veriyor (örn. "Cote d'Ivoire" vs "Cote D'Ivoire").
 * Bu sayısal ID tablosu güvenilir çünkü TM ID'leri sabit.
 *
 * Buraya sadece sık karşılaşılan futbol ülkeleri ekli; eksik olanlar
 * sonra `countryNameById` üzerinden COUNTRY_CODE name lookup'a düşer.
 *
 * Kaynak: /quickselect/countries + Wikipedia ISO listesi.
 */
const COUNTRY_CODE_BY_TM_ID: Record<number, string> = {
  // === AVRUPA ===
  3: 'AL',   // Albania
  127: 'AT', // Austria
  18: 'BY',  // Belarus
  19: 'BE',  // Belgium
  24: 'BA',  // Bosnia-Herzegovina
  28: 'BG',  // Bulgaria
  37: 'HR',  // Croatia
  188: 'CY', // Cyprus
  172: 'CZ', // Czech Republic
  39: 'DK',  // Denmark
  189: 'EN', // England
  47: 'EE',  // Estonia
  208: 'FO', // Faroe Islands
  49: 'FI',  // Finland
  50: 'FR',  // France
  40: 'DE',  // Germany
  56: 'GR',  // Greece
  178: 'HU', // Hungary
  73: 'IS',  // Iceland
  72: 'IE',  // Ireland
  75: 'IT',  // Italy
  244: 'XK', // Kosovo
  92: 'LV',  // Latvia
  98: 'LT',  // Lithuania
  99: 'LU',  // Luxembourg
  106: 'MT', // Malta
  100: 'MK', // North Macedonia
  216: 'ME', // Montenegro
  122: 'NL', // Netherlands
  192: 'EN', // Northern Ireland → EN (UK altında, 2-char schema)
  125: 'NO', // Norway
  135: 'PL', // Poland
  136: 'PT', // Portugal
  140: 'RO', // Romania
  141: 'RU', // Russia
  190: 'EN', // Scotland → EN (UK altında, 2-char schema)
  215: 'RS', // Serbia
  154: 'SK', // Slovakia
  155: 'SI', // Slovenia
  157: 'ES', // Spain
  147: 'SE', // Sweden
  148: 'CH', // Switzerland
  174: 'TR', // Türkiye
  177: 'UA', // Ukraine
  191: 'EN', // Wales → EN (UK altında, 2-char schema)

  // === GÜNEY AMERİKA ===
  9: 'AR',   // Argentina
  23: 'BO',  // Bolivia
  26: 'BR',  // Brazil
  33: 'CL',  // Chile
  83: 'CO',  // Colombia
  44: 'EC',  // Ecuador
  132: 'PY', // Paraguay
  133: 'PE', // Peru
  179: 'UY', // Uruguay
  182: 'VE', // Venezuela
  161: 'SR', // Suriname

  // === KUZEY AMERİKA & KARAYİPLER ===
  80: 'CA',  // Canada
  88: 'CU',  // Cuba
  76: 'JM',  // Jamaica
  110: 'MX', // Mexico
  170: 'TT', // Trinidad and Tobago
  184: 'US', // United States

  // === AFRİKA ===
  2: 'EG',   // Egypt
  4: 'DZ',   // Algeria
  6: 'AO',   // Angola
  8: 'GQ',   // Equatorial Guinea
  29: 'BF',  // Burkina Faso
  31: 'CM',  // Cameroon
  32: 'CV',  // Cape Verde
  38: 'CI',  // Cote d'Ivoire
  46: 'ER',  // Eritrea
  51: 'GA',  // Gabon
  52: 'GM',  // The Gambia
  54: 'GH',  // Ghana
  59: 'GN',  // Guinea
  60: 'GW',  // Guinea-Bissau
  82: 'KE',  // Kenya
  85: 'CG',  // Congo
  95: 'LR',  // Liberia
  96: 'LY',  // Libya
  101: 'MG', // Madagascar
  102: 'MW', // Malawi
  105: 'ML', // Mali
  107: 'MA', // Morocco
  108: 'MR', // Mauritania
  115: 'MZ', // Mozambique
  117: 'NA', // Namibia
  123: 'NE', // Niger
  124: 'NG', // Nigeria
  139: 'RW', // Rwanda
  142: 'ZM', // Zambia
  149: 'SN', // Senegal
  152: 'SL', // Sierra Leone
  159: 'ZA', // South Africa
  166: 'TZ', // Tanzania
  168: 'TG', // Togo
  173: 'TN', // Tunisia
  176: 'UG', // Uganda
  187: 'ZW', // Zimbabwe
  193: 'CD', // DR Congo

  // === ASYA & ORTA DOĞU ===
  1: 'AF',   // Afghanistan
  10: 'AM',  // Armenia
  13: 'AZ',  // Azerbaijan
  15: 'BH',  // Bahrain
  34: 'CN',  // China
  53: 'GE',  // Georgia
  67: 'IN',  // India
  68: 'ID',  // Indonesia
  70: 'IQ',  // Iraq
  71: 'IR',  // Iran
  74: 'IL',  // Israel
  77: 'JP',  // Japan
  78: 'JO',  // Jordan
  81: 'KZ',  // Kazakhstan
  87: 'KR',  // South Korea
  89: 'KW',  // Kuwait
  94: 'LB',  // Lebanon
  103: 'MY', // Malaysia
  128: 'PK', // Pakistan
  134: 'PH', // Philippines
  137: 'QA', // Qatar
  146: 'SA', // Saudi Arabia
  153: 'SG', // Singapore
  158: 'SY', // Syria
  163: 'TW', // Taiwan
  167: 'TH', // Thailand
  180: 'UZ', // Uzbekistan
  183: 'AE', // United Arab Emirates
  185: 'VN', // Vietnam
  186: 'YE', // Yemen
  240: 'PS', // Palestine

  // === OKYANUSYA ===
  12: 'AU',  // Australia
  120: 'NZ', // New Zealand
};

function isoFromCountryName(name: string | undefined): string | undefined {
  if (!name) return undefined;
  // Önce tam eşleşme
  if (COUNTRY_CODE[name]) return COUNTRY_CODE[name];
  // Sonra normalize: case-insensitive + trim
  const norm = name.trim();
  const lowerKey = Object.keys(COUNTRY_CODE).find(
    (k) => k.toLowerCase() === norm.toLowerCase(),
  );
  return lowerKey ? COUNTRY_CODE[lowerKey] : undefined;
}

function isoFromCountryId(id: number | undefined): string | undefined {
  if (id === undefined) return undefined;
  // 1) Sayısal ID lookup (en güvenilir)
  if (COUNTRY_CODE_BY_TM_ID[id]) return COUNTRY_CODE_BY_TM_ID[id];
  // 2) Fallback: name → COUNTRY_CODE map (case-insensitive)
  const name = countryNameById.get(id);
  return isoFromCountryName(name);
}

function countryNameFromId(id: number | undefined): string | undefined {
  if (id === undefined) return undefined;
  return countryNameById.get(id);
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i')
    .replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function readJson<T>(path: string): Promise<T | null> {
  if (!existsSync(path)) return null;
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

/**
 * TM position kodlarını oyunun 4 kategorisine eşler.
 *
 * Öncelik sırası:
 *   1. positionGroup (FORWARD/MIDFIELDER/DEFENDER/GOALKEEPER) — TM'in resmi sınıflandırması
 *   2. position.shortName (CF/AM/CB/CM/LW/RW/DM/GK/RB/LB/SS/RM/LM/SW) — kesin kod
 *   3. Metin fallback (eski mantık)
 */
function mapPosition(
  positionGroup: string | undefined,
  shortName: string | undefined,
): Position {
  // 1. positionGroup ile direkt eşleştir (en güvenilir)
  if (positionGroup) {
    const g = positionGroup.toUpperCase();
    if (g === 'GOALKEEPER') return 'GK';
    if (g === 'DEFENDER') return 'DEF';
    if (g === 'MIDFIELDER') return 'MID';
    if (g === 'FORWARD') return 'FWD';
  }

  // 2. shortName ile (FIFA standart kısaltmalar)
  if (shortName) {
    const sn = shortName.toUpperCase();
    if (sn === 'GK') return 'GK';
    // Defans pozisyonları
    if (['CB', 'RB', 'LB', 'RWB', 'LWB', 'SW'].includes(sn)) return 'DEF';
    // Forvet pozisyonları
    if (['CF', 'LW', 'RW', 'SS', 'ST', 'LF', 'RF'].includes(sn)) return 'FWD';
    // Orta saha pozisyonları (kalan her şey orta saha)
    if (['CM', 'AM', 'DM', 'RM', 'LM', 'OM'].includes(sn)) return 'MID';
  }

  // 3. Metin fallback (default güvenli)
  return 'MID';
}

/**
 * TM clubId → bizim clubs.json'daki id. tm_ prefix'i ile çakışma önlenir.
 * Mevcut manuel kulüpler (id="barcelona" vb.) dokunulmaz.
 */
function tmClubKey(tmClubId: string): string {
  return `tm_${tmClubId}`;
}

/**
 * Kulüp adı altyapı/genç takımı işareti taşıyor mu?
 *
 * TM her oyuncunun U17/U19/U20/U21/U23 maçlarını da clubStints'e ekler;
 * bunlar gerçek "profesyonel kulüp" sayılmaz (q05_club_count vb. şişer).
 *
 * Kapsam:
 *   - "Real Madrid U21", "Barcelona U19", "Argentina U20" → altyapı
 *   - "Real Madrid Castilla" → B takımı, profesyonel sayılır (kalır)
 *   - "Real Madrid", "Bayern München" → A takımı (kalır)
 *   - "Spain", "Brazil" → A milli (kalır, ayrı filtre)
 *
 * NOT: Yaralı veya yedek beklemiş oyuncuyu cezalandırmamak için
 * minApps eşiği KULLANMIYORUZ. Sadece ad-bazlı altyapı işareti.
 */
function isYouthSquadName(name: string): boolean {
  // U + 1-2 rakam (U17, U19, U20, U21, U23) — kelime sınırıyla, "U" tek başına eşleşmez.
  return /\bU\d{1,2}\b/.test(name);
}

/**
 * TmApiClub → Club. Eksik koordinat/şehir XX yedeği döner.
 */
function tmClubToClub(tc: TmApiClub): Club {
  const loc = tc.baseDetails.superiorClub?.location;
  const countryName = countryNameFromId(tc.baseDetails.countryId)
    ?? countryNameFromId(loc?.countryId)
    ?? '';
  const countryCode = isoFromCountryName(countryName) ?? 'XX';
  const continent = continentFromCountry(countryName);
  return {
    id: tmClubKey(tc.id),
    name: tc.baseDetails.shortName || tc.name,
    city: loc?.city ?? '',
    country: countryName,
    countryCode,
    continent,
    lat: loc?.latitude ?? 0,
    lng: loc?.longitude ?? 0,
  };
}

/**
 * Sezon ID (TM: 2018 = 2018/19 sezon) → fromYear için kullanılabilir takvim yılı.
 * TM seasonId zaten başlangıç yılı, doğrudan kullan.
 */
function seasonToYear(seasonId: number): number {
  return seasonId;
}

interface TrophyCountsRaw {
  uclTitles: number; uelTitles: number; otherEuropeanTitles: number;
  domesticLeagueTitles: number; domesticCupTitles: number;
  worldCupTitles: number; continentalNationalTitles: number; totalTitles: number;
  individual?: {
    ballonDor: number; fifaBest: number; goldenBoot: number;
    topScorerAwards: number; playerOfTheYear: number;
    otherIndividual: number; totalIndividual: number;
  };
}
interface CompetitionStatsRaw {
  uclApps: number; uclGoals: number; uclAssists: number;
  uelApps: number; uelGoals: number; uelAssists: number;
  worldCupApps: number; worldCupGoals: number; worldCupAssists: number; worldCupGoalsConceded: number;
  leagueApps: number; leagueGoals: number; leagueAssists: number;
  domesticCupApps: number; domesticCupGoals: number;
}

function tmToPlayer(
  tm: TmPlayer,
  clubNameById: Map<string, string>,
  geocodeByKey: Map<string, { lat: number; lng: number }>,
  honoursByTmId: Map<number, TrophyCountsRaw>,
  competitionByTmId: Map<number, CompetitionStatsRaw>,
  slugOverride?: string,
): Player | null {
  const m = tm.meta;
  if (!m.lifeDates?.dateOfBirth || !m.shortName) {
    return null;
  }
  const slug = slugOverride ?? slugify(m.shortName);
  const id = `p_${slug}`;

  const birthCountry = countryNameFromId(m.birthPlaceDetails?.countryOfBirthId);
  const birthCountryCode = isoFromCountryId(m.birthPlaceDetails?.countryOfBirthId) ?? 'XX';
  const nationality = countryNameFromId(m.nationalityDetails?.nationalities?.nationalityId)
    ?? birthCountry
    ?? '';
  const nationalityCode = isoFromCountryId(m.nationalityDetails?.nationalities?.nationalityId)
    ?? birthCountryCode;

  const position: Position = mapPosition(
    m.attributes?.positionGroup,
    m.attributes?.position?.shortName,
  );
  const preferredFootRaw = m.attributes?.preferredFoot?.name;
  const preferredFoot = preferredFootRaw === 'left' ? 'L'
    : preferredFootRaw === 'right' ? 'R'
    : preferredFootRaw === 'both' ? 'B'
    : undefined;

  const heightCm = typeof m.attributes?.height === 'number'
    ? Math.round(m.attributes.height * 100)
    : undefined;

  // ClubStints: agg → ClubStint
  //   - milli takımları (A milli + altyapı) ayrı tutuyoruz, kulüp listesine girmez
  //   - altyapı kulüpleri (Real Madrid U21, Spain U17 vb.) — gerçek kulüp sayılmaz
  //   - jerseyNo 0 ise undefined (TM bazı altyapı kayıtlarında 0 verir)
  const clubs: ClubStint[] = tm.stats.clubStints
    .filter((s) => {
      if (s.isNational) return false;
      const name = clubNameById.get(s.clubId) ?? '';
      if (isYouthSquadName(name)) return false;
      return true;
    })
    .map((s) => ({
      clubId: tmClubKey(s.clubId),
      fromYear: seasonToYear(s.fromSeason),
      toYear: seasonToYear(s.toSeason),
      apps: s.apps,
      goals: s.goals,
      jerseyNo: typeof s.primaryJerseyNo === 'number' && s.primaryJerseyNo > 0
        ? s.primaryJerseyNo
        : undefined,
    }));

  // jerseyNumbers: profesyonel kulüp stint'lerinden unique forma no'ları
  // (altyapı kulüplerinin numaraları "kariyer formaları" sayılmaz)
  const jerseyNumbers = [...new Set(
    tm.stats.clubStints
      .filter((s) => {
        if (s.isNational) return false;
        const name = clubNameById.get(s.clubId) ?? '';
        return !isYouthSquadName(name);
      })
      .map((s) => s.primaryJerseyNo)
      .filter((n): n is number => typeof n === 'number' && n > 0),
  )];

  return {
    id,
    slug,
    // name: TAM resmi ad — q26 (ad uzunluğu) ve q27 (sesli harf) için
    //   displayName: TM "Full name:" field (sahne adı kullananlarda dolu — Pelé, Vinicius)
    //   name:        TM standart ad ("Lionel Messi", "Zinédine Zidane") — orta form, hemen hep dolu
    //   shortName:   TM kısaltma ("L. Messi", "Z. Zidane") — son fallback
    name: m.displayName || m.name || m.shortName,
    // displayName (kart üstü): okunabilir orta form. shortName "L. Messi" çok kuru.
    displayName: m.name || m.shortName,
    birthDate: m.lifeDates.dateOfBirth,
    birthCity: m.birthPlaceDetails?.placeOfBirth,
    birthCountry,
    birthCountryCode,
    // birthLat/birthLng: cache/geocode.json'dan (Nominatim ile çekildi)
    ...(() => {
      const city = m.birthPlaceDetails?.placeOfBirth;
      const countryId = m.birthPlaceDetails?.countryOfBirthId;
      if (!city || !countryId) return {};
      const geo = geocodeByKey.get(`${city}|${countryId}`);
      if (!geo) return {};
      return { birthLat: geo.lat, birthLng: geo.lng };
    })(),
    nationality,
    nationalityCode,
    position,
    preferredFoot,
    heightCm,
    // isActive: GERÇEKTEN hâlâ oynuyor mu? TM'nin "ölmemiş" bayrağı yetersizdi
    // (1922 doğumlu emekliler de "aktif" görünüyordu). Doğru ölçüt: en son kulüp
    // stintinin bitiş yılı son 2 sezon içinde (>= ACTIVE_SINCE_YEAR). Ölmüşse asla.
    isActive:
      !m.lifeDates?.dateOfDeath &&
      clubs.length > 0 &&
      Math.max(...clubs.map((c) => c.toYear ?? 0)) >= ACTIVE_SINCE_YEAR,
    clubs,
    jerseyNumbers,
    stats: {
      totalGoals: tm.stats.totalGoals,
      totalAssists: tm.stats.totalAssists,
      totalApps: tm.stats.totalApps,
      nationalCaps: tm.stats.nationalCaps,
      nationalGoals: tm.stats.nationalGoals,
      maxSeasonGoals: tm.stats.maxSeasonGoals,
      last5LeagueGoals: tm.stats.last5LeagueGoals,
      maxTransferFeeEUR: m.marketValueDetails?.highest?.value,
      proDebutYear: tm.stats.proDebutYear,
      careerYears: tm.stats.careerYears,
      // Turnuva bazlı agregalar (cache'lenmiş maç verisinden) — varsa ekle
      ...(competitionByTmId.has(tm.tmId)
        ? { competitions: competitionByTmId.get(tm.tmId) }
        : {}),
    },
    achievements: {
      // hasUCLFinal/hasWorldCup: eski boolean placeholder'lar (kullanılmıyor)
      hasUCLFinal: false,
      hasWorldCup: (honoursByTmId.get(tm.tmId)?.worldCupTitles ?? 0) > 0,
      // Kupa adetleri (honours scrape) — varsa ekle
      ...(honoursByTmId.has(tm.tmId)
        ? { trophies: honoursByTmId.get(tm.tmId) }
        : {}),
    },
    // Boş string TM'den gelebilir; URL validator boş string'i reddediyor
    imageUrl: m.portraitUrl && m.portraitUrl.trim().length > 0 ? m.portraitUrl : undefined,
  };
}

async function main() {
  const tmCache = await readJson<Record<string, TmPlayer>>(PLAYERS_RAW);
  if (!tmCache) {
    console.error('[merge] cache/players-raw.json yok. Önce scrape:players çalıştır.');
    process.exit(1);
  }

  // 0. Blocklist yükle (oyuncu çıkarma listesi)
  // Hem tmId hem slug bazlı çift güvenlik filtresi
  const blockedTmIds = new Set<number>();
  const blockedSlugs = new Set<string>();
  if (existsSync(SEED_BLOCKLIST)) {
    type BlockEntry = { tmId: number; slug: string; name: string; reason: string };
    const raw = JSON.parse(await readFile(SEED_BLOCKLIST, 'utf8')) as {
      blocked?: BlockEntry[];
    };
    for (const e of raw.blocked ?? []) {
      blockedTmIds.add(e.tmId);
      blockedSlugs.add(e.slug);
    }
    console.log(`[merge] blocklist: ${blockedTmIds.size} oyuncu (${blockedSlugs.size} slug)`);
  }

  // 1. Ülke tablosu — TM countryId → ad
  console.log('[merge] ülke tablosu çekiliyor…');
  const countries = await fetchCountries();
  for (const c of countries) {
    const idNum = parseInt(c.id, 10);
    if (Number.isFinite(idNum)) countryNameById.set(idNum, c.name);
  }
  console.log(`[merge]   ${countryNameById.size} ülke yüklendi`);

  // 2. Tüm unique TM clubId'leri topla
  const allTmClubIds = new Set<string>();
  for (const tm of Object.values(tmCache)) {
    for (const s of tm.stats.clubStints) {
      allTmClubIds.add(s.clubId);
    }
  }
  console.log(`[merge] toplam unique TM clubId: ${allTmClubIds.size}`);

  // 3. Kulüpleri çek (batched)
  console.log('[merge] kulüp detayları çekiliyor…');
  const tmClubs = await fetchClubs([...allTmClubIds]);
  console.log(`[merge]   ${tmClubs.length} kulüp döndü`);

  // clubId → kulüp adı lookup (altyapı filtresi için: "Real Madrid U21" gibi)
  const clubNameById = new Map<string, string>();
  for (const tc of tmClubs) {
    clubNameById.set(tc.id, tc.name || tc.baseDetails.shortName || '');
  }

  // Doğum şehri geocode lookup (cache/geocode.json varsa)
  // Key: "{city}|{countryId}" → {lat, lng}
  const geocodeByKey = new Map<string, { lat: number; lng: number }>();
  const geocodeFile = join(CACHE_DIR, 'geocode.json');
  if (existsSync(geocodeFile)) {
    type GeoCacheEntry = { lat?: number; lng?: number; status: string };
    const geocodeCache = JSON.parse(await readFile(geocodeFile, 'utf8')) as Record<
      string,
      GeoCacheEntry
    >;
    for (const [key, entry] of Object.entries(geocodeCache)) {
      if (
        entry.status === 'matched' &&
        typeof entry.lat === 'number' &&
        typeof entry.lng === 'number'
      ) {
        geocodeByKey.set(key, { lat: entry.lat, lng: entry.lng });
      }
    }
    console.log(`[merge] geocode cache: ${geocodeByKey.size} şehir`);
  } else {
    console.log('[merge] geocode cache yok — birthLat/birthLng atlanacak');
  }

  // Honours (kupa adetleri) + competition-stats (turnuva maç/gol) lookup — varsa.
  // Bunlar opsiyonel: dosya yoksa player'lar bu alanlar olmadan üretilir.
  const honoursByTmId = new Map<number, TrophyCountsRaw>();
  const honoursFile = join(CACHE_DIR, 'honours.json');
  if (existsSync(honoursFile)) {
    const h = JSON.parse(await readFile(honoursFile, 'utf8')) as Record<string, TrophyCountsRaw>;
    for (const [id, c] of Object.entries(h)) honoursByTmId.set(Number(id), c);
    console.log(`[merge] honours cache: ${honoursByTmId.size} oyuncu`);
  } else {
    console.log('[merge] honours cache yok — trophies atlanacak');
  }

  const competitionByTmId = new Map<number, CompetitionStatsRaw>();
  const compFile = join(CACHE_DIR, 'competition-stats.json');
  if (existsSync(compFile)) {
    const c = JSON.parse(await readFile(compFile, 'utf8')) as Record<string, CompetitionStatsRaw>;
    for (const [id, s] of Object.entries(c)) competitionByTmId.set(Number(id), s);
    console.log(`[merge] competition-stats cache: ${competitionByTmId.size} oyuncu`);
  } else {
    console.log('[merge] competition-stats cache yok — competitions atlanacak');
  }

  // 4. Mevcut clubs.json'a ekle
  // TM kulüpleri her seferinde TAZE yazılır (manuel kulüpler — "galatasaray" gibi
  // slug id'liler — dokunulmaz). Bu sayede merge.ts'teki ülke kodu / koord düzeltmeleri
  // mevcut tm_ kayıtlarına da uygulanır.
  const seedClubs = (await readJson<Club[]>(SEED_CLUBS)) ?? [];
  const manualClubs = seedClubs.filter((c) => !c.id.startsWith('tm_'));
  const droppedTmClubs = seedClubs.length - manualClubs.length;
  const freshTmClubs = tmClubs.map(tmClubToClub);
  const finalClubs = [...manualClubs, ...freshTmClubs];
  await writeFile(SEED_CLUBS, JSON.stringify(finalClubs, null, 2) + '\n');
  console.log(
    `[merge] clubs.json: ${manualClubs.length} manuel + ${freshTmClubs.length} TM (önceki ${droppedTmClubs} TM yenilendi) = ${finalClubs.length}`,
  );

  // 5. Oyuncuları merge
  // Davranış:
  //   - default: TM-kaynaklı kayıtları taze üret; manuel kayıtlar korunur
  //   - --replace-manual: cache/manual-ids.json'da tmId'si bilinen manuel kayıtlar da
  //     TM'den taze üretilir (mevcut manuel slug'lar çıkar, TM versiyonu yenisinin yerini alır)
  const replaceManual = process.argv.includes('--replace-manual');

  const seedPlayers = (await readJson<Player[]>(SEED_PLAYERS)) ?? [];

  // Manuel ID mapping: { manualSlug: tmId } — bu turda TM'den yenilenen seed slug'larını izle
  const manualIdMap = await readJson<Record<string, { slug: string; tmId?: number; status: string }>>(
    join(CACHE_DIR, 'manual-ids.json'),
  );
  const replacedSlugs = new Set<string>();
  if (replaceManual && manualIdMap) {
    for (const entry of Object.values(manualIdMap)) {
      // Bu manuel oyuncunun TM versiyonu cache'te varsa, manuel kaydı çıkaracağız
      if (entry.tmId && entry.status === 'matched' && tmCache[String(entry.tmId)]) {
        replacedSlugs.add(entry.slug);
      }
    }
  }

  // Identity imzası: tmCache'teki her oyuncu için (name+birthDate+nationalityId).
  // Seed'de aynı imzaya sahip TÜM kayıtları çıkaracağız. Bu sayede:
  //   - clubs.length === 0 olsa bile eski stale slug'lar (örn. "diego-ribas-1978") temizlenir
  //   - aynı tmId 2-3 kez kaydedilmiş duplicate'lar tek seferde silinir
  const tmIdentityKeys = new Set<string>();
  for (const tm of Object.values(tmCache)) {
    const nm = (tm.meta.name || tm.meta.shortName || '').toLowerCase().trim();
    const birth = tm.meta.lifeDates?.dateOfBirth ?? '';
    const natId = tm.meta.nationalityDetails?.nationalities?.nationalityId ?? 0;
    if (nm && birth) {
      tmIdentityKeys.add(`${nm}|${birth}|${natId}`);
    }
  }
  // Seed identity hesaplayıcı (TM kayıtlarının normalize edilmiş halinden)
  function seedIdentityKey(p: Player): string {
    const nm = (p.name || p.displayName || '').toLowerCase().trim();
    const birth = p.birthDate ?? '';
    // nationalityCode → countryId reverse lookup (countryNameById üzerinden)
    let natId = 0;
    for (const [id, name] of countryNameById) {
      if (isoFromCountryName(name) === p.nationalityCode) {
        natId = id;
        break;
      }
    }
    return `${nm}|${birth}|${natId}`;
  }

  const droppedTmCount = seedPlayers.filter((p) =>
    p.clubs.some((s) => s.clubId.startsWith('tm_')),
  ).length;
  const droppedManualCount = seedPlayers.filter(
    (p) => !p.clubs.some((s) => s.clubId.startsWith('tm_')) && replacedSlugs.has(p.slug),
  ).length;
  let droppedIdentityCount = 0;

  const preservedPlayers = seedPlayers.filter((p) => {
    const isTmSourced = p.clubs.some((s) => s.clubId.startsWith('tm_'));
    if (isTmSourced) return false; // TM kayıtları her zaman taze üretilir
    if (replacedSlugs.has(p.slug)) return false; // bu turda manuel kayıt TM'den yenileniyor
    if (blockedSlugs.has(p.slug)) return false; // blocklist'teki manuel kayıtlar da çıkar
    // YENİ: tmCache'te aynı identity (name+birth+nat) varsa bu seed kaydı da çıkar
    // → "clubs.length === 0" olan stale duplicate'lar temizlenir
    if (tmIdentityKeys.has(seedIdentityKey(p))) {
      droppedIdentityCount++;
      return false;
    }
    return true;
  });

  console.log(`[merge] mevcut seed: ${seedPlayers.length} oyuncu`);
  if (droppedTmCount > 0) {
    console.log(`[merge]   ↳ ${droppedTmCount} önceki TM kaydı çıkarıldı, taze üretilecek`);
  }
  if (droppedManualCount > 0) {
    console.log(`[merge]   ↳ --replace-manual: ${droppedManualCount} manuel kayıt TM'den yenileniyor`);
  }
  if (droppedIdentityCount > 0) {
    console.log(`[merge]   ↳ ${droppedIdentityCount} stale duplicate (aynı identity) çıkarıldı`);
  }
  console.log(`[merge]   ↳ ${preservedPlayers.length} kayıt korunuyor`);
  console.log(`[merge] TM cache: ${Object.keys(tmCache).length} oyuncu`);

  // Korunan manuel slug'lar — TM cache'ten yeni slug aynısıysa çakışmasın
  const existingSlugs = new Set(preservedPlayers.map((p) => p.slug));
  // Ayrıca: bu turda yenilenen manuel slug'ları TM'nin ürettiği yeni slug ile MAP'lemek
  // gerekebilir (örn. seed slug "lionel-messi", TM shortName "L. Messi" → "l-messi"
  // farklı slug üretir; iki kayıt çakışmasın diye yeni slug seed'tekiyle aynı olsun).
  const tmIdToSeedSlug = new Map<number, string>();
  if (replaceManual && manualIdMap) {
    for (const entry of Object.values(manualIdMap)) {
      if (entry.tmId && replacedSlugs.has(entry.slug)) {
        tmIdToSeedSlug.set(entry.tmId, entry.slug);
      }
    }
  }
  const final: Player[] = [...preservedPlayers];
  let added = 0;
  let skippedExisting = 0;
  let skippedInvalid = 0;
  let collisionResolved = 0;

  // Slug çakışmalarını çözme stratejisi:
  //   - Manuel kayıt slug'ları (örn. "lionel-messi") VAR sayılır, hep kazanır.
  //   - TM kayıtları arasında aynı slug'lı 2 oyuncu varsa,
  //     ikincisinin slug'ına doğum yılı eklenir: "marquinhos" → "marquinhos-1994".
  //   - Hâlâ çakışırsa (aynı slug + aynı doğum yılı), tmId eklenir.
  let skippedBlocked = 0;
  for (const tm of Object.values(tmCache)) {
    // Blocklist filtresi — tmId bazında çift güvenlik (slug aşağıda)
    if (blockedTmIds.has(tm.tmId)) {
      skippedBlocked++;
      continue;
    }
    const slugOverride = tmIdToSeedSlug.get(tm.tmId);
    const player = tmToPlayer(tm, clubNameById, geocodeByKey, honoursByTmId, competitionByTmId, slugOverride);
    if (!player) {
      skippedInvalid++;
      continue;
    }
    // Slug bazında ikinci güvenlik (tmId blocklist'te değil ama slug match'lerse)
    if (blockedSlugs.has(player.slug)) {
      skippedBlocked++;
      continue;
    }
    if (existingSlugs.has(player.slug)) {
      // Doğum yılı ile yeni slug dene
      const birthYear = player.birthDate?.slice(0, 4);
      if (birthYear) {
        const altSlug = `${player.slug}-${birthYear}`;
        if (!existingSlugs.has(altSlug)) {
          player.slug = altSlug;
          player.id = `p_${altSlug}`;
          final.push(player);
          existingSlugs.add(altSlug);
          collisionResolved++;
          added++;
          continue;
        }
        // Aynı slug + aynı yıl → tmId ile dene (çok nadir)
        const tmSlug = `${player.slug}-${birthYear}-${tm.tmId}`;
        if (!existingSlugs.has(tmSlug)) {
          player.slug = tmSlug;
          player.id = `p_${tmSlug}`;
          final.push(player);
          existingSlugs.add(tmSlug);
          collisionResolved++;
          added++;
          continue;
        }
      }
      skippedExisting++;
      continue;
    }
    final.push(player);
    existingSlugs.add(player.slug);
    added++;
  }

  // ===== KALİTE FİLTRESİ (pozisyon-aware) =====
  //
  // Pozisyona göre minimum veri sağlanmamış oyuncuları çıkar.
  // İstisnalar (asla silinmez):
  //   - nationalityCode === 'TR' (Türk pazarı odağı)
  //   - maxTransferFeeEUR > 1M €
  //   - nationalCaps >= 10 (milli takım kimliği)
  //   - totalGoals >= 50 (yüksek gol katkısı)
  //   - totalApps >= 300 (uzun kariyer)
  //
  // Eşikler (Strateji C):
  //   - GK: apps < 80 → sil
  //   - DEF: apps < 100 → sil
  //   - MID: apps < 100 VEYA goals < 10 → sil
  //   - FWD: apps < 100 VEYA goals < 20 → sil
  //
  // Ayrıca "hayalet kayıt" (apps=0, clubs=0, nat=0) → sil
  function isQualityProtected(p: Player): boolean {
    if (p.nationalityCode === 'TR') return true;
    if ((p.stats.maxTransferFeeEUR ?? 0) > 1_000_000) return true;
    if (p.stats.nationalCaps >= 10) return true;
    if (p.stats.totalGoals >= 50) return true;
    if (p.stats.totalApps >= 300) return true;
    return false;
  }
  function failsQualityCheck(p: Player): boolean {
    // Hayalet kayıt
    if (
      p.stats.totalApps === 0 &&
      (p.clubs?.length ?? 0) === 0 &&
      p.stats.nationalCaps === 0
    ) {
      return true;
    }
    const apps = p.stats.totalApps;
    const goals = p.stats.totalGoals;
    switch (p.position) {
      case 'GK':
        return apps < 80;
      case 'DEF':
        return apps < 100;
      case 'MID':
        return apps < 100 || goals < 10;
      case 'FWD':
        return apps < 100 || goals < 20;
    }
    return false;
  }
  const beforeQuality = final.length;
  const qualityFiltered = final.filter((p) => {
    if (isQualityProtected(p)) return true;
    if (failsQualityCheck(p)) return false;
    return true;
  });
  const removedByQuality = beforeQuality - qualityFiltered.length;
  if (removedByQuality > 0) {
    console.log(`[merge]   ↳ kalite filtresi: ${removedByQuality} yetersiz veri oyuncu çıkarıldı`);
  }
  // qualityFiltered'i kullan, final'ı override et (sonraki adımlar için)
  final.length = 0;
  final.push(...qualityFiltered);

  // Final dedup — slug prefix bazlı (örn. "fontana", "fontana-1940", "fontana-1940-229674")
  // ve strict identity bazlı duplicate'leri seed'de tek bırak.
  function slugCanonicalPrefix(slug: string): string {
    const parts = slug.split('-');
    const last = parts[parts.length - 1];
    const beforeLast = parts[parts.length - 2];
    if (last && /^\d+$/.test(last) && beforeLast && /^\d{4}$/.test(beforeLast)) {
      return parts.slice(0, -2).join('-');
    }
    if (last && /^\d{4}$/.test(last)) {
      return parts.slice(0, -1).join('-');
    }
    return slug;
  }
  const beforeDedup = final.length;
  // Slug prefix bazlı dedup: aynı (canonicalPrefix, birthDate, nationalityCode) tek kalır
  const byPrefix = new Map<string, Player[]>();
  for (const p of final) {
    const key = `${slugCanonicalPrefix(p.slug)}|${p.birthDate}|${p.nationalityCode}`;
    (byPrefix.get(key) ?? byPrefix.set(key, []).get(key)!).push(p);
  }
  const dedupedFinal: Player[] = [];
  for (const [, list] of byPrefix) {
    // En kısa slug = canonical (en uygun aday)
    list.sort((a, b) => a.slug.length - b.slug.length);
    dedupedFinal.push(list[0]!);
  }
  const removedDupes = beforeDedup - dedupedFinal.length;

  await writeFile(SEED_PLAYERS, JSON.stringify(dedupedFinal, null, 2) + '\n');

  console.log(`\n[merge] result:`);
  console.log(`  total players: ${dedupedFinal.length}`);
  console.log(`  added from TM: ${added}`);
  console.log(`  ↳ slug collisions resolved: ${collisionResolved}`);
  if (removedDupes > 0) {
    console.log(`  ↳ duplicate cleanup: ${removedDupes} kayıt birleştirildi`);
  }
  console.log(`  skipped (blocklist): ${skippedBlocked}`);
  console.log(`  skipped (slug already in seed): ${skippedExisting}`);
  console.log(`  skipped (missing required fields): ${skippedInvalid}`);
  console.log(`\nNow run: pnpm --filter @futbol-kart/data-pipeline build`);
}

main().catch((err) => {
  console.error('[merge] fatal:', err);
  process.exit(1);
});
