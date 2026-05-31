# Futbol Kart Oyunu

> Sürpriz sorularla futbolcu kartlarını karşılaştıran, hot-seat ve bota karşı oynanan bir dijital kart düellosu.

İki oyuncu kör seçimle **8'er kart** seçer, moderatör **121 farklı şablondan** rastgele bir soru sorar (forma numarası toplamı, doğum yeri ekvatora yakınlığı, kariyer toplam golü, "yaşı 30'a daha yakın" gibi parametrik sorular vb.), oyuncular ellerinden birer kart sürer, istatistik karşılaştırılır, kazanan o turu alır. **7 tur**, eşitlikte uzatma (4 kart × 3 tur), eşitlik sürerse penaltı atışı (1 kart × 1 soru).

---

## 🎯 Sayılarla

| Metrik | Değer |
|---|---|
| **Oyuncu** | 8,912 (Pelé'den Lamine Yamal'a, 107 yıllık tarih) |
| **Kulüp** | 6,240 (47 manuel + 6,193 TM) |
| **Soru şablonu** | 121 baz şablon (14 parametrik → ~750 benzersiz soru varyasyonu) |
| **Türk oyuncu** | 727 (Süper Lig kulüpleri + Anadolu kulüpleri + manuel efsaneler) |
| **Şablon kapsama** | 121/121 şablon kendi havuz eşiğini geçti ✅ |
| **Doğruluk** | 10/10 ünlü oyuncu Wikipedia ile %100 uyumlu (milli takım istatistikleri) |
| **Duplicate** | 0 (otomatik dedup + build-time validation) |

Detaylı veri raporu: [data-pipeline/FINAL_REPORT.md](data-pipeline/FINAL_REPORT.md)

---

## Durum

**Aktif geliştirme — MVP-hazır.** Oyun mantığı tamamen çalışır durumda, veri katmanı doğrulandı, sahne arka planları + atmosfer cilası tamamlandı, backend altyapısı (auth + DB + maç paylaşma) hazır ama Neon/Resend bağlanmadı.

### Tamamlananlar

#### Oyun motoru & UI
- ✅ **Oyun motoru** — Saf TypeScript, event-sourced reducer, seedable PRNG. Hot-seat + vs-bot.
- ✅ **121 soru şablonu** — 11 kategori (numeric, time, geo, club, position, name, fun, proximity, boolean, extreme, composite), 14'ü parametrik, Wikipedia ile doğrulu.
- ✅ **Soru çözücü** — Şablon başına resolver + tiebreaker zinciri + 30/30 Vitest testleri yeşil.
- ✅ **Uzatma + sudden death** — Eşitlikte otomatik faz geçişi.
- ✅ **Frontend** — Next.js 14 App Router, sahne shell (mode → pick → handoff → round → final), Framer Motion animasyonlar, Zustand + sessionStorage persist, next-intl (TR).
- ✅ **Kart seçme ekranı v2** — Sticky üst panel + seçim chip'leri, ⌘K ile odaklı çoklu-alan arama (ad/ülke/lig/takım/forma), pozisyon + ülke + çağ filtreleri, kürasyonlu varsayılan havuz (16 efsane + 16 güncel), IntersectionObserver ile paged yükleme (ilk 32, sonra +32).
- ✅ **Kart tasarımı** — FIFA UT tarzı edge-to-edge portre, foto %60 alan, agresif yüz crop (objectPosition + scale override sistemi), pozisyon bazlı renk teması (GK mor / DEF mavi / MID sarı / FWD kırmızı), holo conic gradient + shine band hover, 3D mouse tilt.
- ✅ **Atmosfer cilası** — Saha temalı arka plan (PitchBackground), 6 sahne için AI üretimli WebP arka planlar, hero Ken Burns + altın partiküller, broadcast tarzı skorboard, sahne içi cross-fade.
- ✅ **Final ekranı** — Gold/slate semantik, data-driven skor barı (kazanan baskın), count-up reveal, ŞAMPİYON başlığı, glass paneller transparan.
- ✅ **Backend iskeleti** — Drizzle ORM + Neon Postgres + Better-Auth (magic-link) + Resend mail. API routes (`POST /api/games`, `GET /api/games/[shareId]`). Paylaşılabilir maç sayfası (`/mac/[shareId]`).
- ✅ **Performans** — Görseller WebP (-%88 boyut), kritik sahnelerin preload'u, sayfa geçişleri 200ms. Web bundle `/oyna/[gameId]` = 20.1 kB.

#### Veri pipeline'ı
- ✅ **TM JSON API mimarisi** — Transfermarkt'ın resmi (açık) JSON API'leri (`tmapi-alpha/players`, `tmapi-alpha/clubs`, `ceapi/performance-game`) kullanılarak ~34,000 HTTP isteği ile 8,912 oyuncuya ait detaylı veri çekildi.
- ✅ **5 aşamalı veri toplama** — Top değerli 540 + 32 lig top scorer + Süper Lig 5 kulüp × 5 sezon + 75 kürate efsane + 5,249 manuel isim listesi.
- ✅ **Doğum koordinatı** — Nominatim (OSM) ile 4,334 unique şehir geocode edildi; tarihsel ülkeler (CSSR, UdSSR, East Germany) modern ülke adına eşlendi. %97 kapsama.
- ✅ **Doğruluk doğrulaması** — Milli takım istatistik bug fix: Pirlo 166→116, Ronaldinho 125→97, Çalhanoğlu 147→104. 10/10 oyuncu Wikipedia uyumlu.
- ✅ **Kalite filtreleri** — Pozisyon-aware (GK<80 maç, FWD<100 maç veya <20 gol vb.) + 5 istisna kuralı (TR vatandaşı, 50+ gol, 300+ maç, 10+ milli cap, 1M+ değer). 102 yetersiz veri kayıt çıkarıldı.
- ✅ **Duplicate koruması** — Identity-bazlı + slug prefix dedup; build-time validation; merge'de built-in.
- ✅ **Blocklist** — `seed/blocklist.json` ile 8 oyuncu (hukuki süreç) sistemden çıkarıldı.

### Tamamlanmamış

- ⏳ **Vercel deploy** — kod hazır, henüz publish edilmedi.
- ⏳ **Domain bağlama** — bir alan adı satın alınıp bağlanacak.
- ⏳ **Gerçek oyuncu fotoğrafları** — %87 TM portresi mevcut, kalan oyuncularda monogram fallback.
- ⏳ **Online multiplayer** — yol haritası dışı, hot-seat + bot ile sınırlı.
- ⏳ **Lisans / KVKK metni** — yayın öncesi.
- ⏳ **Ses katmanı** — kart flip, kalabalık, score hit (sonraki tur).
- ⏳ **Eksik veri kapsama iyileştirmesi** — boy %86, ayak %82 (eski oyuncular). Wikipedia infobox veya manuel `corrections.csv` ile genişletilebilir.

---

## Stack

| Katman | Teknoloji |
|---|---|
| Frontend | Next.js 14 (App Router) + TypeScript + Tailwind CSS |
| State | Zustand (event-sourced session machine + sessionStorage persist) |
| Animasyon | Framer Motion |
| i18n | next-intl (TR, çoğul dile genişlemeye hazır) |
| Şablon sistemi | Zod schema + parametrik şablon + custom compute resolver |
| DB | Neon Postgres (serverless) + Drizzle ORM |
| Auth | Better-Auth (magic-link / şifresiz email) |
| Mail | Resend |
| Hosting | Vercel (önerilen) — Cloudflare Pages alternatifi mümkün |
| Veri kaynakları | Transfermarkt JSON API + Nominatim (OSM) geocode |
| Workspace | pnpm workspaces |

---

## Proje yapısı

```
futbol-kart/
├── apps/
│   └── web/                              Next.js uygulaması
│       ├── src/
│       │   ├── app/                      App Router (page, layout, api)
│       │   ├── components/
│       │   │   ├── PlayerCard.tsx        FIFA UT tarzı kart
│       │   │   ├── PlayerSearchBar.tsx   ⌘K odaklı arama
│       │   │   ├── PlayerFilterChips.tsx Pozisyon/ülke/çağ filtreleri
│       │   │   ├── SelectedCardsRail.tsx Sticky üst panel
│       │   │   └── scenes/               6 sahne komponenti
│       │   └── lib/
│       │       ├── playerFilters.ts      Saf filtre/curate/arama fonksiyonları
│       │       ├── playersClient.ts      Client-side fetch + cache
│       │       ├── playerImageOverrides  Manuel crop sistem (scale + objectPosition)
│       │       ├── sessionMachine.ts     Event-sourced state machine
│       │       └── valueFormat.ts        Tur sonu Türkçe + birim
│       ├── messages/tr.json              i18n metinleri
│       └── public/
│           ├── data/                     players.json, clubs.json (build çıktısı)
│           └── hero/                     Optimize edilmiş WebP arka planlar
├── packages/
│   ├── shared-types/                     Player, Club, GameState tipleri
│   ├── game-engine/                      Saf TS reducer + PRNG + bot
│   ├── question-templates/
│   │   ├── templates.json                121 şablon
│   │   ├── src/
│   │   │   ├── schema.ts                 Zod template + paramSpec
│   │   │   ├── resolver.ts               100+ custom compute case
│   │   │   ├── util.ts                   Türkçe karakter, hece, palindrom, ...
│   │   │   ├── geo.ts                    Haversine, kapital şehirler
│   │   │   └── resolver.test.ts          30/30 Vitest
│   │   └── package.json
│   └── db/                               Drizzle schema + Neon client
├── data-pipeline/
│   ├── seed/
│   │   ├── players.json                  8,912 oyuncu seed
│   │   ├── clubs.json                    6,240 kulüp seed
│   │   ├── blocklist.json                Hukuki süreç oyuncuları
│   │   └── legend-candidates.json        Kürate efsane listesi
│   ├── manuel_toplanan_futbolcular/      8 .txt — 5,249 unique isim
│   ├── corrections.csv                   Manuel düzeltmeler (Pelé/Maradona vb.)
│   ├── scripts/
│   │   ├── build.ts                      Validation + dedup + yazma
│   │   ├── report.ts                     Şablon coverage raporu
│   │   └── scrape/                       (detaylar aşağıda)
│   └── FINAL_REPORT.md                   Veri kalitesi raporu (v5)
├── scripts/
│   └── optimize-hero-images.mjs          PNG → WebP optimizasyon
├── PLAN.md                               Karar günlüğü ve yol haritası
├── .env.example                          Env vars şablonu
└── package.json                          pnpm workspace root
```

### Scrape pipeline scriptleri (`data-pipeline/scripts/scrape/`)

```
http.ts                   Rate-limited fetch + JSON helper + cache
list.ts                   Top değerli oyuncu listesi (cheerio)
tmApi.ts                  TM JSON API (players + clubs + countries)
perfApi.ts                Performans aggregate (A milli filtreli)
players.ts                Ana scrape döngüsü (3 endpoint × tmId)
search.ts                 TM search endpoint (isim → tmId)
clubSquads.ts             Kulüp kadrosu (sezon × kulüp)
leagueScorers.ts          32 lig top scorers
resolveLegends.ts         Kürate efsane → TM ID eşleme
resolveManualIds.ts       Manuel seed oyuncuları → TM ID
parseManualLists.ts       .txt dosyalarını birleştirme
resolveMissing.ts         Manuel listede eksik → TM search
diffManualNames.ts        Mevcut veriyle çapraz match
mergeManualIdsToList.ts   Manuel ID'leri list.json'a entegre
mergeMissingToList.ts     Eksik ID'leri list.json'a entegre
geocodeBirthCities.ts     Nominatim 1. tur
geocodeRetry.ts           Nominatim 2. tur (format fix)
qualityAudit.ts           Veri kalite denetimi (raporlar)
qualityFilter.ts          Pozisyon-aware kalite önizleme
qualityFilterAggressive.ts Strateji A/B/C/D karşılaştırma
duplicateReport.ts        Strict + slug + identity dedup tarama
reprocessAggregate.ts     Cache'den yeniden aggregate (TM'ye istek YOK)
merge.ts                  TmPlayer → Player + dedup + kalite filtresi
```

---

## Geliştirme

### Önkoşullar

- Node.js 20+
- pnpm 10+

### 1. Bağımlılıklar

```bash
pnpm install
```

### 2. Ortam değişkenleri

```bash
cp .env.example .env.local
# .env.local'i kendi değerlerinle doldur
```

**Minimum geliştirme için (auth/DB olmadan da çalışır):**

| Variable | Açıklama |
|---|---|
| `DATABASE_URL` | Neon connection string (free tier — https://console.neon.tech) |
| `BETTER_AUTH_SECRET` | 32+ karakter rastgele |
| `BETTER_AUTH_URL` | `http://localhost:3000` |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` |
| `RESEND_API_KEY` | Opsiyonel — boş bırakırsan magic-link konsola yazılır |
| `EMAIL_FROM` | `onboarding@resend.dev` (doğrulanmış domain yoksa) |

**Sadece hot-seat / bot oynamak için** auth ve DB gerekmez; uygulama bu env'ler boş olsa da çalışır. Sadece `/giris`, `/mac/[shareId]` ve "Maçı paylaş" butonu DB ister.

### 3. Veritabanı kurulumu (auth + paylaş için)

```bash
pnpm --filter @futbol-kart/db generate
pnpm --filter @futbol-kart/db migrate
```

### 4. Oyuncu verisini hazırla

```bash
pnpm --filter @futbol-kart/data-pipeline build
```

`apps/web/public/data/players.json` ve `clubs.json` üretilir. Mevcut seed (8,912 oyuncu + 6,240 kulüp) yeterli — yeniden scrape gerekmez.

**Veriyi sıfırdan yeniden çekmek için (Transfermarkt scrape):**

```bash
# 1. Liste sayfasını tara (top 540 değerli)
pnpm --filter @futbol-kart/data-pipeline scrape:list --pages=40

# 2. Her oyuncunun detayını çek (~3 endpoint × oyuncu)
pnpm --filter @futbol-kart/data-pipeline scrape:players

# 3. seed/players.json + clubs.json üret
pnpm --filter @futbol-kart/data-pipeline scrape:merge -- --replace-manual

# 4. Build (validation + dedup)
pnpm --filter @futbol-kart/data-pipeline build

# 5. Coverage raporu
pnpm --filter @futbol-kart/data-pipeline report
```

Detaylar: [data-pipeline/scripts/scrape/README.md](data-pipeline/scripts/scrape/README.md)

### 5. Çalıştır

```bash
pnpm dev
```

http://localhost:3000

---

## Komutlar

```bash
# Dev
pnpm dev                                              # Next.js dev server

# Production
pnpm build                                            # Tüm paketler + Next.js build
pnpm --filter @futbol-kart/web start                 # Production preview

# Kalite
pnpm -r typecheck                                    # Tüm paketlerde tsc --noEmit
pnpm --filter @futbol-kart/question-templates test   # 30/30 Vitest

# DB
pnpm --filter @futbol-kart/db generate               # Drizzle migration SQL
pnpm --filter @futbol-kart/db migrate                # Uygula (Neon'a)
pnpm --filter @futbol-kart/db studio                 # Drizzle Studio

# Veri
pnpm --filter @futbol-kart/data-pipeline build       # players.json üret
pnpm --filter @futbol-kart/data-pipeline report      # Şablon coverage raporu
pnpm --filter @futbol-kart/data-pipeline scrape:list    # TM liste sayfası tara
pnpm --filter @futbol-kart/data-pipeline scrape:players # Her oyuncu için 3 endpoint
pnpm --filter @futbol-kart/data-pipeline scrape:merge   # Seed üret

# Görsel optimizasyonu
node scripts/optimize-hero-images.mjs                # public/hero/*.png → *.webp
```

---

## Soru Şablon Sistemi

121 baz şablon, 11 kategoride:

| Kategori | Şablon | Örnek |
|---|---|---|
| **numeric** | 16 | "Toplam gol sayısı daha fazla olan kazanır." |
| **boolean** | 29 | "Kuzey yarımkürede doğmuş olan kazanır." |
| **time** | 14 | "Daha küçük yaşta debüt yapmış olan kazanır." |
| **proximity** | 11 | "Yaşı 30'a daha yakın olan kazanır." (parametrik 22-40) |
| **geo** | 10 | "Doğum yeri İstanbul'a daha yakın olan kazanır." |
| **extreme** | 10 | "Boyu 200 cm ve üzerinde olan kazanır." |
| **name** | 9 | "Tam adında daha fazla sesli harf bulunan kazanır." |
| **composite** | 8 | "Maç başına gol ortalaması daha yüksek olan kazanır." |
| **position** | 7 | "Resmî pozisyonu kaleci olan kazanır." |
| **club** | 5 | "Tek bir kulüpte en az 10 yıl forma giymiş olan kazanır." |
| **fun** | 2 | "#10 numaralı formayı giymiş olan kazanır." (1-11) |

**Parametrik şablonlar** (14 adet): Runtime'de değer değişir. Örn. `x01_age_proximity` her oyunda 22–40 arası rastgele bir hedef yaş seçer. Toplam **~750 benzersiz soru varyasyonu** üretilir.

**Şablon kalitesi:**
- Her şablonun `title.tr` (soru cümlesi) ve `formula.tr` (hesaplama açıklaması) ayrı yazılı — profesyonel Türkçe, sıfır kafa karışıklığı
- Her şablon `requiresFields` ile gereken veriyi bildirir → eksik veriyle soru üretilmez
- `minPoolCoverage` ile havuz alt sınırı esnek (örn. `e04_500_plus_goals` için %0.5 yeter)
- 121/121 şablon kendi eşiğini geçti ✅

---

## Vercel'e deploy

1. **Neon Postgres hesabı aç** — https://console.neon.tech
   - Free tier, kredi kartı gerektirmez
   - Region: `aws-eu-central-1` (Türkiye'ye yakın)
   - "Pooled connection" string'i kopyala

2. **Resend hesabı aç** — https://resend.com
   - Free tier 3,000 mail/ay, kart yok
   - API key oluştur
   - Kendi domain'ini doğrulamadan önce sadece **kendi e-postana** mail gidebilir (`onboarding@resend.dev`)

3. **GitHub'a push et**:
   ```bash
   git init
   git add -A
   git commit -m "feat: initial MVP"
   git branch -M main
   git remote add origin git@github.com:<user>/futbol-kart.git
   git push -u origin main
   ```

4. **Vercel'de proje aç** — https://vercel.com/new
   - GitHub repo'yu seç
   - Framework: Next.js (otomatik algılar)
   - **Root directory:** `apps/web`
   - **Build command:** `cd ../.. && pnpm --filter @futbol-kart/web build`
   - **Install command:** `cd ../.. && pnpm install`

5. **Environment variables ekle** (Vercel project → Settings → Environment Variables):
   ```
   DATABASE_URL=<Neon pooled connection>
   BETTER_AUTH_SECRET=<32+ chars random>
   BETTER_AUTH_URL=https://your-domain.com
   NEXT_PUBLIC_APP_URL=https://your-domain.com
   RESEND_API_KEY=<resend key>
   EMAIL_FROM=onboarding@resend.dev
   ```

6. **Migration'ları uygula** (lokal terminalden, prod DATABASE_URL ile):
   ```bash
   DATABASE_URL=<prod url> pnpm --filter @futbol-kart/db migrate
   ```

7. **Domain bağla** (opsiyonel) — Vercel project → Settings → Domains.

---

## Test akışı

`pnpm dev` çalışırken:

1. **Ana sayfa** açılır → stadyum hero görseli + altın partiküller + "Hemen Oyna" CTA
2. **Hemen Oyna** → `/oyna/<rastgele-id>` → mod seçim (👥 Arkadaşına Karşı / 🤖 Bota Karşı)
3. **Mod seç** → isim modal'i (sessionStorage'a kaydedilir)
4. **Kart seç** → 8,912 oyuncu havuzunda:
   - Varsayılan: 16 efsane + 16 güncel kürasyonlu görünüm
   - ⌘K ile arama (ad/ülke/lig/takım/forma)
   - Pozisyon (FW/MID/DEF/GK), ülke, çağ (aktif/modern/efsane) filtreleri
   - 8 kart seç → "Maçı Başlat"
5. **7 tur oyna**:
   - Round intro stinger (~750ms)
   - Soru reveal — 121 şablondan rastgele, parametrik ise runtime değer atanır
   - P1 kart oyna → (vs-bot: bot ~600ms düşünür) → P2 kart oyna
   - 3D flip + count-up + winner badge (~1450ms)
6. **Eşitlikte uzatma** (4 kart × 3 tur), eşitlik sürerse **penaltı** (1 kart × 1 soru)
7. **Final ekranı** — ŞAMPİYON başlığı, gold/slate skor barı, "Tur detaylarını göster" collapsible
8. **Maçı paylaş** (DB bağlıysa) → `/mac/<shareId>` linkini paylaş

---

## Veri kalitesi & doğrulama

| Alan | Kapsama | Not |
|---|---|---|
| Ad, doğum tarihi, milliyet, pozisyon | %100 | — |
| Doğum şehri, ülke | %98 | — |
| Doğum koord (lat/lng) | %97 | Nominatim 2. tur ile +%10 |
| Forma numaraları | %97 | Mode-bazlı tek seçim |
| Toplam gol | %96 | Kalecilerde 0 |
| Toplam maç, kariyer yılı | %99.9 | — |
| Kulüp stintleri | %99.7 | Altyapı (U17-U23) hariç tutuldu |
| Foto (imageUrl) | %87 | TM portresi |
| Boy | %86 | Eski oyuncularda eksik |
| Milli takım maç | %84 | Sadece A milli (U23/U20/U17 hariç) |
| Ayak tercihi | %82 | Eski oyuncularda eksik |
| Piyasa değeri | %80 | — |

**Wikipedia doğrulaması:** 10 ünlü oyuncu (Messi, CR7, Pelé, Maradona, Zidane, Pirlo, Buffon, Ronaldinho, Çalhanoğlu, Tugay) için **doğum tarihi, boy, ayak, milli takım istatistikleri %100 uyumlu**.

Detaylı analiz: [data-pipeline/FINAL_REPORT.md](data-pipeline/FINAL_REPORT.md)

---

## Lisans

Henüz lisanslanmadı. MVP / fikir doğrulama aşamasında.
