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

function isoFromCountryName(name: string | undefined): string | undefined {
  if (!name) return undefined;
  return COUNTRY_CODE[name];
}

function isoFromCountryId(id: number | undefined): string | undefined {
  if (id === undefined) return undefined;
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

function mapPosition(s: string | undefined): Position {
  if (!s) return 'MID';
  const lower = s.toLowerCase();
  if (lower.includes('goalkeeper') || lower === 'gk') return 'GK';
  if (lower.includes('back') || lower.includes('defender') || lower.includes('def')) return 'DEF';
  if (lower.includes('midfield') || lower === 'mid') return 'MID';
  if (lower.includes('forward') || lower.includes('winger') || lower.includes('striker') || lower === 'fwd') return 'FWD';
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

function tmToPlayer(tm: TmPlayer, slugOverride?: string): Player | null {
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

  const position: Position = mapPosition(m.attributes?.position?.shortName ?? m.attributes?.positionGroup);
  const preferredFootRaw = m.attributes?.preferredFoot?.name;
  const preferredFoot = preferredFootRaw === 'left' ? 'L'
    : preferredFootRaw === 'right' ? 'R'
    : preferredFootRaw === 'both' ? 'B'
    : undefined;

  const heightCm = typeof m.attributes?.height === 'number'
    ? Math.round(m.attributes.height * 100)
    : undefined;

  // ClubStints: agg → ClubStint (milli takımları hariç tut; bunlar ayrı kavram)
  // jerseyNo 0 ise yok say (TM bazı altyapı kayıtlarında 0 verir; pozitif olmalı)
  const clubs: ClubStint[] = tm.stats.clubStints
    .filter((s) => !s.isNational)
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

  // jerseyNumbers: stint'lerdeki tüm forma no'ları unique
  // TM bazı altyapı maçlarında 0 verir; geçerli forma değil — filtrele.
  const jerseyNumbers = [...new Set(
    tm.stats.clubStints
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
    // birthLat/birthLng: TM API'sinde yok — corrections veya manuel mapping gerekir
    nationality,
    nationalityCode,
    position,
    preferredFoot,
    heightCm,
    isActive: !m.lifeDates?.dateOfDeath,
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
    },
    achievements: {
      // TM API'sinde direkt yok — corrections.csv ile manuel
      hasUCLFinal: false,
      hasWorldCup: false,
    },
    imageUrl: m.portraitUrl,
  };
}

async function main() {
  const tmCache = await readJson<Record<string, TmPlayer>>(PLAYERS_RAW);
  if (!tmCache) {
    console.error('[merge] cache/players-raw.json yok. Önce scrape:players çalıştır.');
    process.exit(1);
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

  const droppedTmCount = seedPlayers.filter((p) =>
    p.clubs.some((s) => s.clubId.startsWith('tm_')),
  ).length;
  const droppedManualCount = seedPlayers.filter(
    (p) => !p.clubs.some((s) => s.clubId.startsWith('tm_')) && replacedSlugs.has(p.slug),
  ).length;

  const preservedPlayers = seedPlayers.filter((p) => {
    const isTmSourced = p.clubs.some((s) => s.clubId.startsWith('tm_'));
    if (isTmSourced) return false; // TM kayıtları her zaman taze üretilir
    if (replacedSlugs.has(p.slug)) return false; // bu turda manuel kayıt TM'den yenileniyor
    return true;
  });

  console.log(`[merge] mevcut seed: ${seedPlayers.length} oyuncu`);
  if (droppedTmCount > 0) {
    console.log(`[merge]   ↳ ${droppedTmCount} önceki TM kaydı çıkarıldı, taze üretilecek`);
  }
  if (droppedManualCount > 0) {
    console.log(`[merge]   ↳ --replace-manual: ${droppedManualCount} manuel kayıt TM'den yenileniyor`);
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

  for (const tm of Object.values(tmCache)) {
    // Manuel kayıttan yenilenen oyuncular için seed'teki orijinal slug'ı koru
    const slugOverride = tmIdToSeedSlug.get(tm.tmId);
    const player = tmToPlayer(tm, slugOverride);
    if (!player) {
      skippedInvalid++;
      continue;
    }
    if (existingSlugs.has(player.slug)) {
      skippedExisting++;
      continue;
    }
    final.push(player);
    existingSlugs.add(player.slug);
    added++;
  }

  await writeFile(SEED_PLAYERS, JSON.stringify(final, null, 2) + '\n');

  console.log(`\n[merge] result:`);
  console.log(`  total players: ${final.length}`);
  console.log(`  added from TM: ${added}`);
  console.log(`  skipped (slug already in seed): ${skippedExisting}`);
  console.log(`  skipped (missing required fields): ${skippedInvalid}`);
  console.log(`\nNow run: pnpm --filter @futbol-kart/data-pipeline build`);
}

main().catch((err) => {
  console.error('[merge] fatal:', err);
  process.exit(1);
});
