/**
 * Türkçe yerelleştirme yardımcıları — milliyet (EN→TR) ve kulüp adı (Türkçe
 * karakter) düzeltmeleri. Veri İngilizce/karaktersiz tutuluyor (clubs.json/
 * players.json); bu katman UI'da gösterimde çevirir → veriye dokunmaz (mevcut
 * modlar etkilenmez). Eşleşme yoksa orijinal değer döner (güvenli fallback).
 */

/** Milliyet/ülke adı İngilizce → Türkçe. Eligible havuzdaki 98 milliyet kapsanır. */
const NATIONALITY_TR: Record<string, string> = {
  Albania: 'Arnavutluk',
  Algeria: 'Cezayir',
  Angola: 'Angola',
  Argentina: 'Arjantin',
  Armenia: 'Ermenistan',
  Australia: 'Avustralya',
  Austria: 'Avusturya',
  Belarus: 'Belarus',
  Belgium: 'Belçika',
  Benin: 'Benin',
  Bolivia: 'Bolivya',
  'Bosnia-Herzegovina': 'Bosna-Hersek',
  Brazil: 'Brezilya',
  Bulgaria: 'Bulgaristan',
  'Burkina Faso': 'Burkina Faso',
  Cameroon: 'Kamerun',
  Canada: 'Kanada',
  'Cape Verde': 'Cape Verde',
  'Central African Republic': 'Orta Afrika Cumhuriyeti',
  Chile: 'Şili',
  China: 'Çin',
  Colombia: 'Kolombiya',
  'Costa Rica': 'Kosta Rika',
  "Cote d'Ivoire": 'Fildişi Sahili',
  Croatia: 'Hırvatistan',
  Cyprus: 'Kıbrıs',
  'Czech Republic': 'Çekya',
  'DR Congo': 'Demokratik Kongo',
  Denmark: 'Danimarka',
  'Dominican Republic': 'Dominik Cumhuriyeti',
  Ecuador: 'Ekvador',
  Egypt: 'Mısır',
  England: 'İngiltere',
  Estonia: 'Estonya',
  Finland: 'Finlandiya',
  France: 'Fransa',
  Gabon: 'Gabon',
  Georgia: 'Gürcistan',
  Germany: 'Almanya',
  Ghana: 'Gana',
  Greece: 'Yunanistan',
  Guadeloupe: 'Guadeloupe',
  Guinea: 'Gine',
  'Guinea-Bissau': 'Gine-Bissau',
  Honduras: 'Honduras',
  Hungary: 'Macaristan',
  Iceland: 'İzlanda',
  Iran: 'İran',
  Ireland: 'İrlanda',
  Israel: 'İsrail',
  Italy: 'İtalya',
  Jamaica: 'Jamaika',
  Japan: 'Japonya',
  Kenya: 'Kenya',
  'Korea, South': 'Güney Kore',
  Kosovo: 'Kosova',
  Libya: 'Libya',
  Luxembourg: 'Lüksemburg',
  Mali: 'Mali',
  Mexico: 'Meksika',
  Moldova: 'Moldova',
  Montenegro: 'Karadağ',
  Morocco: 'Fas',
  Mozambique: 'Mozambik',
  Netherlands: 'Hollanda',
  'New Zealand': 'Yeni Zelanda',
  Nigeria: 'Nijerya',
  'North Macedonia': 'Kuzey Makedonya',
  'Northern Ireland': 'Kuzey İrlanda',
  Norway: 'Norveç',
  Panama: 'Panama',
  Paraguay: 'Paraguay',
  Peru: 'Peru',
  Poland: 'Polonya',
  Portugal: 'Portekiz',
  Romania: 'Romanya',
  Russia: 'Rusya',
  Scotland: 'İskoçya',
  Senegal: 'Senegal',
  Serbia: 'Sırbistan',
  Slovakia: 'Slovakya',
  Slovenia: 'Slovenya',
  'South Africa': 'Güney Afrika',
  Spain: 'İspanya',
  Sweden: 'İsveç',
  Switzerland: 'İsviçre',
  Tanzania: 'Tanzanya',
  Togo: 'Togo',
  'Trinidad and Tobago': 'Trinidad ve Tobago',
  Tunisia: 'Tunus',
  Türkiye: 'Türkiye',
  Turkey: 'Türkiye',
  Uganda: 'Uganda',
  Ukraine: 'Ukrayna',
  'United States': 'ABD',
  Uruguay: 'Uruguay',
  Uzbekistan: 'Özbekistan',
  Venezuela: 'Venezuela',
  Wales: 'Galler',
};

/** Milliyeti Türkçeye çevir (eşleşme yoksa orijinali döndür). */
export function nationalityTr(name: string | null | undefined): string {
  if (!name) return '';
  return NATIONALITY_TR[name] ?? name;
}

/**
 * Kulüp adı Türkçe karakter düzeltmeleri — veri ASCII tutuyor (Besiktas,
 * Basaksehir…). Yalnızca Türkçe karakteri "yenen" tanıdık kulüpler için map;
 * eşleşme yoksa orijinal ad döner. (Yabancı kulüpler zaten kendi dilinde doğru.)
 */
const CLUB_NAME_TR: Record<string, string> = {
  Besiktas: 'Beşiktaş',
  Basaksehir: 'Başakşehir',
  'Istanbul Basaksehir': 'İstanbul Başakşehir',
  Genclerbirligi: 'Gençlerbirliği',
  'C. Rizespor': 'Çaykur Rizespor',
  Rizespor: 'Rizespor',
  Goztepe: 'Göztepe',
  Kasimpasa: 'Kasımpaşa',
  Sivasspor: 'Sivasspor',
  Gaziantepspor: 'Gaziantepspor',
  Genclerbir: 'Gençlerbirliği',
  Eskisehirspor: 'Eskişehirspor',
  'Buyuksehir Bld.': 'Büyükşehir Bld.',
};

/** Kulüp adındaki Türkçe karakter eksiğini düzelt (eşleşme yoksa orijinal). */
export function clubNameTr(name: string | null | undefined): string {
  if (!name) return '';
  return CLUB_NAME_TR[name] ?? name;
}
