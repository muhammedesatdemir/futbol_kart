# Transfermarkt scrape pipeline

Top ~300 oyuncuyu Transfermarkt'tan otomatik çekip mevcut `seed/players.json`'a
ekler. Mevcut 50 manuel oyuncu (efsaneler) korunur, üzerine yazılmaz.

## Mimari — JSON API (yeni)

Transfermarkt sayfaları SPA + Web Components'a geçti; klasik HTML scrape (cheerio
ile `table.items`) artık leistungsdaten/transfers sayfalarında çalışmıyor.
Bunun yerine **TM'nin kendi JSON API endpoint'lerini** doğrudan çağırıyoruz:

| Endpoint | İçerik | Boyut/oyuncu |
| --- | --- | --- |
| `tmapi-alpha.transfermarkt.technology/players?ids[]={tmId}` | Tam metadata: `name`, `shortName`, `displayName` (tam ad), doğum tarih/yer/ülke, milliyet (1. + 2.), boy, ayak, pozisyon | ~2.5 KB |
| `tmapi-alpha.transfermarkt.technology/clubs?ids[]={cid}&ids[]=...` | Kulüp adı, şehir, **enlem/boylam**, ülke. Tek istekte tüm kariyer kulüpleri | ~3 KB/kulüp |
| `transfermarkt.com/ceapi/performance-game/{tmId}` | Kariyerin **her maçı**: gameId, seasonId, competitionId, clubId, gol, asist, dakika, forma no | ~50 KB – 1.4 MB (kıdeme göre) |

Auth/CSRF yok — sade `fetch` ile 200 OK döner (Chromium UA + Referer yeterli).
Kulüp koordinatları doğrudan gelir → ayrı geocode adımı **gereksiz**.

## Dosya yapısı

```
data-pipeline/scripts/scrape/
├── http.ts          # rate-limited fetch (2s delay, 3 retry, disk cache)
├── list.ts          # /spieler-statistik liste sayfasından tmId'leri çıkar (cheerio kalır)
├── tmApi.ts         # tmapi-alpha: players + clubs (JSON, tek istekte batched)
├── perfApi.ts       # ceapi/performance-game: maç maç → aggregate stats
├── players.ts       # her tmId için 3 endpoint'i çağırıp tek TmPlayer üret
├── merge.ts         # TmPlayer → Player + mevcut 50 manuel seed'i koru
└── README.md
```

## Komutlar

```bash
# 1. Liste sayfasını tara — sadece tmId + slug + name (cheerio, ~5 dk)
pnpm --filter @futbol-kart/data-pipeline scrape:list
# Çıktı: data-pipeline/cache/list.json

# 2. Her tmId için 3 JSON endpoint'i çek (~3-5 sn/oyuncu rate-limited)
pnpm --filter @futbol-kart/data-pipeline scrape:players
# Çıktı: data-pipeline/cache/players-raw.json
#        + cache içinde XHR yanıtları (resumable)

# 3. Birleştir → seed/players.json güncelle (mevcut 50 + yeni gelenler)
pnpm --filter @futbol-kart/data-pipeline scrape:merge
# Çıktı: data-pipeline/seed/players.json

# 4. Build → apps/web/public/data/players.json üret
pnpm --filter @futbol-kart/data-pipeline build

# 5. Şablon coverage raporu
pnpm --filter @futbol-kart/data-pipeline report
```

### Tek komutla hepsi

```bash
pnpm --filter @futbol-kart/data-pipeline scrape:all
```

`list + players + merge` zincirini sırayla çalıştırır. `geocode` artık yok.

## Veri akışı

```
list.json           tmId, slug, name
   │
   ▼
players-raw.json    TmPlayer { meta, clubs[], performance[] }
   │   • tmApi.players  → meta
   │   • tmApi.clubs    → clubs[] (koordinat dahil)
   │   • perfApi        → performance[] → aggregate stats
   ▼
seed/players.json   Player[]  (mevcut 50 + scrape)
   │
   ▼
public/data/        derlenmiş, runtime-ready JSON
```

## Şablon coverage

Bu mimariyle 30 şablondan **~25'i tam çalışır** (önceki sadece-profil scrape'inde 17):

| Şablon ailesi | Kaynak |
| --- | --- |
| Doğum tarihi/yeri/ülkesi (q06, q07, q22) | tmApi.players |
| Pozisyon, ayak, boy (q11, q12, q13, q23) | tmApi.players |
| Toplam gol/asist/maç (q02, q04, q10) | perfApi aggregate |
| Sezon başına gol (q03, q25) | perfApi groupBy season |
| Kulüp sayısı + ülke spread (q05, q14, q15, q16, q19, q20) | tmApi.clubs + perfApi |
| Milli takım maç/gol (q08, q09) | perfApi filter `isNationalGame` |
| Doğum yeri ekvator/koordinat (q21) | tmApi.players birthPlace |
| Kariyer yılları, debut (q18, q24) | perfApi min/max seasonId |
| Forma numarası (q01, q28) | perfApi `statistics.generalStatistics.shirtNumber` mode |
| Ad uzunluğu, sesli harf (q26, q27) | tmApi.players displayName (tam ad) |

**Hâlâ manuel/corrections.csv gerektiren:**
- UCL final, Dünya Kupası, Ballon d'Or başarıları (q29, q30 — TM API'sinde direkt yok, infobox/Wikidata daha iyi)

## Mevcut seed korunur

`scrape:merge` mevcut `seed/players.json`'daki slug'lara dokunmaz. Pele, Maradona,
Zidane gibi efsane oyuncular için manuel yazdığımız değerler korunur —
Transfermarkt'taki güncel veri eski oyuncularda zayıf.

## İsim alanları (önemli)

Önceki turda kritik bir karışıklık çözüldü:

| Player alanı | Kaynak | Kullanım |
| --- | --- | --- |
| `displayName` | `tmApi.players.shortName` ("Vinicius Junior") | **Kart üstünde görünen** kısa/bilinen ad |
| `name` | `tmApi.players.displayName` ("Vinicius José Paixão de Oliveira Junior") | Sadece q26 (ad uzunluğu) ve q27 (sesli harf) için |

Çift vatandaşlık (Mbappé France+Cameroon, Isak Sweden+Eritrea) artık temiz —
ilki birincil, ikincisi `nationality2` alanına (opsiyonel) düşer.

## Yasal durum

- Bu pipeline **build-time, kişisel/MVP** kullanım için
- İçerik **yeniden yayınlanmıyor** — sadece istatistik aggregation
- Rate limit (2 sn) + Chromium UA + Referer = TM trafik düzeyinde sıradan ziyaretçi
- TM ToS scraping'i yasaklar; ticari ölçeğe geçerken **lisans veya alternatif**
  (API-Football Pro, FBref) düşünülmeli

## Hata durumunda

- **Endpoint 403/429** → Rate limit'i `http.ts` içindeki `MIN_DELAY_MS` ile artır,
  veya 30 dk bekleyip tekrar dene. Aynı IP'den toplam istek hacmini düşür.
- **`success: false` JSON** → tmId yanlış veya oyuncu kaldırılmış. `cache/players-raw.json`'a
  `{ error: ... }` yazılır, sonraki tur atlanır.
- **Eksik alanlar** → corrections.csv ile manuel düzelt; özellikle UCL/Ballon d'Or.

## Geliştirme notları

- `cache/*.json` ve `cache/*.html` git'e commit edilmez (gitignore).
- `cache/xhr-samples/` — TM API yanıtlarının örnekleri, parser yazarken referans.
- Endpoint'lerin tepkilerinin yapısını değiştirmesi durumunda: `tmApi.ts`/`perfApi.ts`
  içindeki tipleri güncelle. `data` alanı `success: true` zarfından her zaman gelir.
