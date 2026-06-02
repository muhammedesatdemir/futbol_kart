# Futbol Kart Oyunu

> Sürpriz sorularla futbolcu kartlarını karşılaştıran, hot-seat ve bota karşı oynanan bir dijital kart düellosu.

İki oyuncu kör seçimle **8'er kart** seçer, moderatör **106 farklı şablondan** rastgele bir soru sorar (forma numarası toplamı, doğum yeri ekvatora yakınlığı, kariyer toplam golü, "yaşı 30'a daha yakın" gibi parametrik sorular vb.), oyuncular ellerinden birer kart sürer, istatistik karşılaştırılır, kazanan o turu alır. **7 tur**, eşitlikte uzatma (4 kart × 3 tur), eşitlik sürerse penaltı atışı (1 kart × 1 soru). Bir turda değerler eşitse (Evet-Evet, Hayır-Hayır, 25-25) tur **berabere** biter — hiçbir tarafa keyfî/rastgele puan verilmez; eşitlik yalnızca uzatma ve penaltı fazlarıyla kırılır. Maç başında **3 zorunlu kategori** açılır; bu kategorilere atanan kartlar turunu kazanırsa **+2 puan** getirir (taktik katman).

---

## 🎯 Sayılarla

| Metrik | Değer |
|---|---|
| **Oyuncu** | 8,912 (Pelé'den Lamine Yamal'a, 107 yıllık tarih) |
| **Kulüp** | 6,240 (47 manuel + 6,193 TM) |
| **Soru şablonu** | 106 baz şablon (14 parametrik → ~740 benzersiz soru varyasyonu) |
| **Türk oyuncu** | 727 (Süper Lig kulüpleri + Anadolu kulüpleri + manuel efsaneler) |
| **Şablon sağlığı** | 106/106 şablon gerçek veri üzerinde denetlendi — 0 kırık ✅ |
| **Kapışmalı oran** | Şablonların ~%89'u karşılaştırmalı (max/min); Evet-Hayır soruları ~%10 azınlıkta |
| **Doğruluk** | 10/10 ünlü oyuncu Wikipedia ile %100 uyumlu (milli takım istatistikleri) |
| **Duplicate** | 0 (otomatik dedup + build-time validation) |

Detaylı veri raporu: [data-pipeline/FINAL_REPORT.md](data-pipeline/FINAL_REPORT.md)

---

## Durum

**Aktif geliştirme — MVP-hazır.** Oyun mantığı tamamen çalışır durumda, veri katmanı doğrulandı, sahne arka planları + atmosfer cilası tamamlandı, backend altyapısı (auth + DB + maç paylaşma) hazır ama Neon/Resend bağlanmadı.

### Tamamlananlar

#### Oyun motoru & UI
- ✅ **Oyun motoru** — Saf TypeScript, event-sourced reducer, seedable PRNG. Hot-seat + vs-bot.
- ✅ **106 soru şablonu** — 11 kategori (numeric, time, geo, club, position, name, fun, proximity, boolean, extreme, composite), 14'ü parametrik, Wikipedia ile doğrulu, tamamı gerçek veri üzerinde denetlendi. Şablonların ~%89'u karşılaştırmalı (kapışmalı) — Evet/Hayır soruları bilinçli olarak azınlıkta (~%10). **Turnuva/kupa/bireysel ödül verisiyle 26 yeni şablon** (UCL/UEL/lig/Dünya Kupası maç+gol+asist, toplam kupa, lig/yerel kupa/UCL şampiyonluğu, kaleci DK yediği gol, Ballon d'Or, gol krallığı, toplam bireysel ödül) eklendi.
- ✅ **Soru çözücü** — Şablon başına resolver + parametrik şablonlarda runtime değer üretimi + başlık interpolasyonu (`{targetApps}` → 500) + 50/50 Vitest testleri yeşil.
- ✅ **Adil beraberlik mantığı** — Değerler eşitse tur her zaman berabere; rastgele/keyfî kazanan asla belirlenmez. Eşitlik yalnızca uzatma → penaltı fazlarıyla kırılır.
- ✅ **Çeşitlilik garantisi** — Soru seçici üst üste aynı kategoriden soru sormaz (havuz daralmadıkça); 7 turlu simülasyonda ardışık tekrar oranı %0.
- ✅ **3 Zorunlu Kategori bonus mekaniği** — Ana maç başında (kart seçiminden sonra) 3 kategori-koşulu açılır; oyuncu 8 kartlık elinden 3'ünü bu koşullara atar. Bu kartlar turunu kazanırsa **+2 puan** (normal +1). Koşullar predicate motoruyla seçilir (33 koşul: pozisyon/milliyet/lig/kulüp/kupa/turnuva/istatistik), çatışma grubu farklı + her iki elde de **bipartite eşleştirmeyle fizibilite garantili** (deadlock imkansız). Round ekranında bonus kartlar "⭐ +2" rozeti + altın çerçeyle işaretlenir. Bot otomatik atar.
- ✅ **2 Joker (özel hamle)** — Maç boyu 1×/taraf, inline (yeni sahne yok), hot-seat + vs-bot (bot dahil). **Çarpan**: soru `max` ise kartının değerini ×2, `min` ise ÷2 yapar (yön soruya göre akıllı; bool/proximity'de uygun değil → buton disabled); ÷2 ham ondalık değerle karşılaştırılır. **İstatistiği Gör**: kart seçmeden kendi elinin o sorudaki değerlerini rozet olarak gösterir (rakibin eli gizli, saf görsel). Joker barı kalan-hak rozeti + "?" açıklama popover'ı ile sunulur. Resolve katmanında uygulanır (`resolveCards(doubleSide)`), resolver saf kalır. (Joker 3 — Transfer Hamlesi — yol haritasında.)
- ✅ **Uzatma + sudden death** — Eşitlikte otomatik faz geçişi.
- ✅ **Ses katmanı** — Kart flip, tur kazanma, beraberlik ve final fanfarı (native HTMLAudioElement, `useSfx`). `SoundToggle` ile aç/kapa; kapalıyken hiç indirme yapılmaz. Yeniden-oynamada tekrar-çalma bug'ı (prevScene guard) giderildi.
- ✅ **Frontend** — Next.js 14 App Router, sahne shell (mode → pick → handoff → **bonus** → round → final), Framer Motion animasyonlar, Zustand + sessionStorage persist, next-intl (TR).
- ✅ **Kart seçme ekranı v2** — Sticky üst panel + seçim chip'leri, **🎲 Rastgele** butonu (havuzdan rastgele 8 oyuncu), ⌘K ile odaklı çoklu-alan arama (ad/ülke/lig/takım/forma), pozisyon + ülke + çağ filtreleri, kürasyonlu varsayılan havuz (16 efsane + 16 güncel), IntersectionObserver ile paged yükleme (ilk 32, sonra +32).
- ✅ **Kart tasarımı** — FIFA UT tarzı edge-to-edge portre, foto %60 alan, agresif yüz crop (objectPosition + scale override sistemi), pozisyon bazlı renk teması (GK mor / DEF mavi / MID sarı / FWD kırmızı), holo conic gradient + shine band hover, 3D mouse tilt. Boyut sistemi: `default` (responsive), `sm`/`md` (sabit, taşmasız — bonus/el), `reveal` (VS ekranı).
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
- ✅ **Şablon sağlık denetimi** — `audit:templates` scripti her şablonu gerçek veri üzerinde simüle eder; karşılaştırılamayan/imkansız/duplike şablonları yakalar (kırık şablon bulursa exit-code 1). Bu denetimle imkansız/duplike şablonlar temizlendi, nadir bool sorular karşılaştırmalıya çevrildi ve birbirinin neredeyse aynısı olan şablonlar (ör. "doğum yılı büyük" ≈ "daha genç", "hece sayısı" = "sesli harf sayısı") elendi. Sonuç: 121 → 80 şablon, bool oranı %34'ten ~%14'e indi. Ardından turnuva/kupa/bireysel ödül verisiyle 26 yeni karşılaştırmalı şablon eklendi → **106 şablon**, bool ~%10.

### Tamamlanmamış

- ⏳ **Vercel deploy** — kod hazır, henüz publish edilmedi.
- ⏳ **Domain bağlama** — bir alan adı satın alınıp bağlanacak.
- ⏳ **Gerçek oyuncu fotoğrafları** — %87 TM portresi mevcut, kalan oyuncularda monogram fallback.
- ⏳ **Online multiplayer** — yol haritası dışı, hot-seat + bot ile sınırlı.
- ⏳ **Lisans / KVKK metni** — yayın öncesi.
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
│       │   │   ├── PlayerCard.tsx        FIFA UT tarzı kart (default/sm/md/reveal boyut)
│       │   │   ├── PlayerSearchBar.tsx   ⌘K odaklı arama
│       │   │   ├── PlayerFilterChips.tsx Pozisyon/ülke/çağ filtreleri
│       │   │   ├── SelectedCardsRail.tsx Sticky üst panel + 🎲 Rastgele
│       │   │   ├── SoundToggle.tsx       Ses aç/kapa
│       │   │   └── scenes/               sahne komponentleri (BonusAssignScene dahil)
│       │   └── lib/
│       │       ├── playerFilters.ts      Saf filtre/curate/arama fonksiyonları
│       │       ├── playersClient.ts      Client-side fetch + cache
│       │       ├── playerImageOverrides  Manuel crop sistem (scale + objectPosition)
│       │       ├── sessionMachine.ts     Event-sourced state machine (BONUS_ASSIGN dahil)
│       │       ├── bonusConditions.ts    Bonus koşul (predicate) kütüphanesi
│       │       ├── bonusSelection.ts     3-koşul seçimi + bipartite fizibilite
│       │       ├── useSfx.ts             SFX çalıcı (flip/win/tie/final)
│       │       └── valueFormat.ts        Tur sonu Türkçe + birim
│       ├── messages/tr.json              i18n metinleri
│       └── public/
│           ├── data/                     players.json, clubs.json (build çıktısı)
│           └── hero/                     Optimize edilmiş WebP arka planlar
├── packages/
│   ├── shared-types/                     Player, Club, GameState tipleri
│   ├── game-engine/                      Saf TS reducer + PRNG + bot
│   ├── question-templates/
│   │   ├── templates.json                106 şablon
│   │   ├── src/
│   │   │   ├── schema.ts                 Zod template + paramSpec
│   │   │   ├── resolver.ts               Custom compute case + param üretimi + başlık interpolasyonu
│   │   │   ├── util.ts                   Türkçe karakter, hece, palindrom, ...
│   │   │   ├── geo.ts                    Haversine, kapital şehirler
│   │   │   └── resolver.test.ts          50/50 Vitest (regression dahil)
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
│   │   ├── auditTemplates.ts             Şablon sağlık denetimi (gerçek veri simülasyonu)
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

# Gelecek modları için (yazıldı, henüz çalıştırılmadı — bkz. Yol Haritası)
honours.ts                Kupa + bireysel ödül sayıları (TM Erfolge → achievements.trophies)
competitionStats.ts       Turnuva maç/gol (cache'ten reprocess, scrape YOK)
rankedLists.ts            Sıralı listeler (ewige* → lists.json, Mod 3)
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
pnpm --filter @futbol-kart/question-templates test   # 50/50 Vitest

# DB
pnpm --filter @futbol-kart/db generate               # Drizzle migration SQL
pnpm --filter @futbol-kart/db migrate                # Uygula (Neon'a)
pnpm --filter @futbol-kart/db studio                 # Drizzle Studio

# Veri
pnpm --filter @futbol-kart/data-pipeline build           # players.json üret
pnpm --filter @futbol-kart/data-pipeline report          # Şablon coverage raporu
pnpm --filter @futbol-kart/data-pipeline audit:templates # Şablon sağlık denetimi (gerçek veri)
pnpm --filter @futbol-kart/data-pipeline scrape:list    # TM liste sayfası tara
pnpm --filter @futbol-kart/data-pipeline scrape:players # Her oyuncu için 3 endpoint
pnpm --filter @futbol-kart/data-pipeline scrape:merge   # Seed üret

# Veri — gelecek modları (henüz çalıştırılmadı; bkz. Yol Haritası)
pnpm --filter @futbol-kart/data-pipeline scrape:honours          # Kupa sayıları (TM Erfolge) — önce --limit=5 ile dene
pnpm --filter @futbol-kart/data-pipeline reprocess:competitions  # Turnuva maç/gol (cache'ten, scrape YOK)
pnpm --filter @futbol-kart/data-pipeline scrape:lists            # Sıralı listeler (Mod 3)

# Görsel optimizasyonu
node scripts/optimize-hero-images.mjs                # public/hero/*.png → *.webp
```

---

## Soru Şablon Sistemi

106 baz şablon, 11 kategoride:

| Kategori | Şablon | Örnek |
|---|---|---|
| **numeric** | 38 | "Şampiyonlar Ligi'nde daha fazla gol/asist yapan kazanır." / "Daha fazla takım kupası kazanan kazanır." |
| **proximity** | 15 | "Toplam kupa sayısı hedef değere daha yakın olan kazanır." (parametrik) |
| **geo** | 10 | "Doğum yeri İstanbul'a daha yakın olan kazanır." |
| **time** | 9 | "Daha küçük yaşta debüt yapmış olan kazanır." |
| **composite** | 8 | "Maç başına gol ortalaması daha yüksek olan kazanır." |
| **boolean** | 8 | "Avrupa / G.Amerika / Afrika / Asya'da doğmuş olan kazanır." |
| **name** | 8 | "Tam adında daha fazla sesli harf bulunan kazanır." |
| **club** | 5 | "Tek bir kulüpte en yüksek maç sayısına ulaşan kazanır." |
| **position** | 2 | "Resmî pozisyonu kaleci olan kazanır." |
| **extreme** | 2 | "Aktif oyuncular arasında piyasa değeri daha yüksek olan kazanır." |
| **fun** | 1 | "Forma numaralarından en az biri asal sayı olan kazanır." |

**Turnuva/kupa/bireysel şablonları (26 yeni, `w*`/`x*`):** UCL/UEL/lig/Dünya Kupası maç + gol + asist,
toplam kupa, lig/yerel kupa/UCL şampiyonluğu, kalecinin Dünya Kupası'nda yediği gol (az kazanır),
Ballon d'Or sayısı, gol krallığı sayısı, toplam bireysel ödül — hepsi karşılaştırmalı veya hedef-değer.
Yalnızca ilgili veriye sahip oyuncular havuza girer (`requiresFields` `+` soneki ile `>0` şartı). Az çeşitli
prestij şablonları (Ballon d'Or, UCL kupası) bilinçli olarak nadir sorulur (arada çıkar, berabere kalabilir).

**Kapışmalı tasarım:** Şablonların **~%89'u karşılaştırmalı** (max/min — "hangisi daha çok/az/yakın"). Evet/Hayır (bool) şablonları toplamın yalnızca **~%10'u** (11 şablon, bunların 4'ü doğum kıtası); iki tarafın da aynı cevabı verip turu sürekli berabere bırakmasını önlemek için bilinçli olarak azınlıkta tutuldu.

**Parametrik şablonlar** (14 adet): Runtime'de değer değişir. Örn. `x01_age_proximity` her oyunda 22–40 arası rastgele bir hedef yaş seçer; soru başlığındaki `{targetAge}` gibi placeholder'lar seçilen değerle doldurulur. Toplam **~700 benzersiz soru varyasyonu** üretilir.

**Şablon kalitesi:**
- Her şablonun `title.tr` (soru cümlesi) ve `formula.tr` (hesaplama açıklaması) ayrı yazılı — profesyonel Türkçe, sıfır kafa karışıklığı
- Her şablon `requiresFields` ile gereken veriyi bildirir → eksik veriyle soru üretilmez
- `minPoolCoverage` ile havuz alt sınırı esnek
- Parametrik şablonlarda hedef değer seed'e bağlı deterministik üretilir ve hem hesaplamada hem soru başlığında kullanılır
- Soru seçici üst üste aynı kategoriden soru sormaz (havuz daralmadıkça) — kategori çeşitliliği garanti
- Tüm şablonlar `audit:templates` ile gerçek veri üzerinde denetlendi — karşılaştırılamayan/imkansız/duplike şablonlar temizlendi → 106/106 sağlıklı ✅

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
   - 8 kart seç (veya 🎲 Rastgele) → "Maçı Başlat"
5. **Bonus tur (ana maç)** → 3 kategori-koşulu açılır; elinden 3 kart ata (her biri turunu kazanırsa +2)
6. **7 tur oyna**:
   - Round intro stinger (~750ms)
   - Soru reveal — 106 şablondan rastgele (ardışık aynı kategori gelmez), parametrik ise runtime değer atanıp başlığa işlenir
   - P1 kart oyna → (vs-bot: bot ~600ms düşünür) → P2 kart oyna; bonus kartlar "⭐ +2" rozetli
   - 3D flip + count-up + winner badge (~1450ms) + ses (flip/win/tie)
7. **Eşitlikte uzatma** (4 kart × 3 tur), eşitlik sürerse **penaltı** (1 kart × 1 soru)
8. **Final ekranı** — ŞAMPİYON başlığı + fanfar, gold/slate skor barı, "Tur detaylarını göster" collapsible
9. **Maçı paylaş** (DB bağlıysa) → `/mac/<shareId>` linkini paylaş

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

## 🗺️ Gelecek Planları (Yol Haritası)

Mevcut **VS Karşılaştırma** modu (oyuncu kartlarının istatistik düellosu) projenin ana iskeleti.
Aynı veri katmanı + kart sistemi üzerine oturan **ek oyun modları** planlanıyor. Her biri
bağımsız bir mod; ileride bir "karma" mod altında birleştirilebilir.

### ⭐ Öncelik — Joker 3: "Transfer Hamlesi" (kart VS)

İlk iki joker (Çarpı 2, İstatistiği Gör) **canlı**. Üçüncü joker — **Transfer Hamlesi** — denge ve
bilgi-sızıntısı riskleri nedeniyle ayrı bir tura bırakıldı.

**Mekanik:** Tur başında, **soru açıklanmadan önce** kullanılır. Oyuncu kendi elinden 1 kart verir,
rakibin elinden 1 kart alır (çalma değil **değiş-tokuş**). Soru sonrası kullanılamaz (rakibin en iyi
kartını sorulu seçmek aşırı güçlü olurdu). Son turda kullanılamaz; her oyuncu maçta 1×.

**Çözülmesi gereken tasarım soruları (uygulamadan önce):**
- **Bilgi sızıntısı (hot-seat):** Rakibin eli P1'e gizli. Çözüm: **kör transfer** — rakibin kartları
  kapalı gösterilir, oyuncu yalnızca pozisyon/ülke ipucuyla kör seçer. Hem hot-seat hem bot'ta çalışır.
- **Bonus mekaniğiyle etkileşim:** Maç başı atanan bonus kartlardan biri transfer edilirse bonus
  ataması bozulur → transfer edilen kart bonus slotundan otomatik düşürülmeli (veya bonus kartlar
  transfere kapalı olmalı). Karar uygulamada netleşecek.
- **Yeni sahne:** Diğer iki jokerin aksine (inline), transfer kör-seçim akışı tek opsiyonel sahne
  (`ROUND_TRANSFER`) gerektirir — yalnızca joker kullanılırsa girilir, kullanılmazsa atlanır.
- **Bot:** İlk transfer sürümünde bot düşük olasılıkla kör değiş-tokuş yapar.

### ✅ Tamamlandı — "3 Zorunlu Kategori" bonus mekaniği (kart VS)

> Bu özellik artık **canlı** (bkz. Tamamlananlar). Ana maç başında 3 kategori-koşulu açılır,
> oyuncu elinden 3 kart atar, o kartlar turunu kazanırsa +2 puan. Predicate motoru
> (`bonusConditions.ts`/`bonusSelection.ts`), `BONUS_ASSIGN` sahnesi ve bipartite fizibilite
> garantisi implement edildi; round ekranında "⭐ +2" rozetiyle işaretlenir.

**Diğer modlara uyarlama (aynı bonus omurgası, gelecek):** Kadro Kur'da her oyunda rastgele bir
"bonus mevki" (o mevkide kazanan +2); Liste Doldur'da rastgele bir "bonus sıra" (örn. 5.–7., doğru
bilen +2).

### Yeni oyun modları

#### 🟢 Mod 1 — Kadro Kur (ilk hedef, ek veri gerektirmez)
> "En X kadroyu kur": en uzun / en yaşlı / en genç / en golcü / en değerli / en kupalı kadro.
- Oyuncular bir formasyon (KL-DEF-ORT-FOR) için **pozisyon bazlı** kart seçer; sistem seçilen
  istatistiği toplar, iki taraf karşılaştırılır.
- **Challenge varyantı:** her tur bir kısıt — "sadece Süper Lig", "sadece Brezilyalı",
  "sadece bir kulüpten" — daha rekabetçi bir his verir.
- **Veri:** ✅ Tamamı mevcut (`heightCm`, `birthDate`, `totalGoals`, `maxTransferFeeEUR`,
  `position`, `clubs[]`, `nationalityCode`). Kupa kriteri için honours verisi gerekir (aşağıda).
- **Durum:** Mevcut `playerFilters.ts` (pozisyon/ülke/lig filtreleri) bu modun temelini zaten içeriyor.

#### 🟡 Mod 2 — Hedefe Yaklaş
> "5 futbolcuyla toplamı hedefe en çok yaklaştır": 70 Dünya Kupası maçı, 750 Süper Lig maçı,
> 500 Şampiyonlar Ligi maçı, 150 milli maç vb.
- **Veri:** Genel metrikler (toplam maç/gol/asist, milli maç) ✅ bugün mevcut. Turnuva-bazlı
  metrikler (ŞL maçı, Dünya Kupası maçı, lig maçı) **cache'lenmiş maç-maç verisinden türetilir** —
  yeni scrape gerekmez (bkz. `reprocess:competitions`). Messi'de doğrulandı: UCL 163 maç/129 gol,
  Dünya Kupası 26 maç/13 gol — Wikipedia ile birebir.

#### 🟡 Mod 3 — Liste Doldur
> Sıralı bir listeyi 1→10 tahmin et; üst sıralar (10. sıra = 10 puan) daha değerli.
> "Süper Lig'de en çok maça çıkan kaleciler", "Premier Lig'de en çok asist", "Dünya Kupası gol kralları",
> "2017 Ballon d'Or sıralaması".
- **Veri:** Lig/turnuva all-time listeleri TM'nin hazır `ewige*` sayfalarından çekilebilir
  (`scrape:lists`) — `leagueScorers.ts` ile aynı kalıp. **Ballon d'Or / yıl bazlı ödül arşivleri**
  farklı sayfa yapısında; ayrı bir parser veya manuel JSON gerektirir (TODO).

### Veri stratejisi (modları besleyen kaynaklar)

| Veri | Kaynak | Yöntem | Script | Durum |
|---|---|---|---|---|
| **Kupa + bireysel ödül sayıları** (UCL/UEL/lig/kupa/Dünya Kupası + Ballon d'Or/gol krallığı/yılın oyuncusu) | TM "Erfolge" (başarılar) sayfası | scrape (~5 saat, rate-limit'li) | `scrape:honours` | ✅ çekildi (9029 oyuncu) → kart VS'e 16 şablon |
| **Turnuva maç/gol/asist** (UCL/UEL/Dünya Kupası/lig/kupa) | cache'lenmiş `performance-game` | **reprocess (scrape YOK)** | `reprocess:competitions` | ✅ işlendi → kart VS'e 10 şablon |
| **Sıralı listeler** (lig/turnuva all-time + ödül arşivi) | TM `ewige*` + ödül sayfaları | yeni scrape | `scrape:lists` | ✅ 6 lig gol kralı (ödül arşivi sonraki tur) |

> **Tetikleme sırası (veri toplama günü):** `scrape:honours` → `reprocess:competitions` →
> `scrape:lists` → ardından `merge.ts` bu verileri `players.json` / `lists.json`'a katar →
> `build` → `audit:templates`. Honours scrape'i `--limit=5` ile önce küçük örnekte doğrulanmalı
> (parser TM HTML şablonuna hassas).

### ⛔ Şu an kapsam dışı (granüler / üçüncü-taraf veri gerektirir)

Aşağıdaki örnek sorular **oyuncu-bazlı TM verisinde yok**; ayrı ve maliyetli kaynaklar
(tarihsel lig tabloları, maç logları, takım-sezon istatistikleri) gerektirir. MVP sonrası değerlendirilecek:

- "Son takımın 24/25 sezonunda **yediği** gol" → takım-sezon defansif istatistik
- "En farklı **mağlubiyette** atılan gol" → maç sonuç logu
- "Doğduğu yıl ligin **7.'sinin puanı**" → tarihsel lig tablosu
- "En çok rakip olduğu oyuncuyla **son maçta** attığı gol" → maç-bazlı H2H
- "Son takımın **güncel yaş ortalaması**" → takım kadrosu yaşları
- "Son ligde **kiralık** forma giyen oyuncu sayısı" → transfer/kadro durumu

### 🧩 Kart VS'e uymayan ama diğer modlar için değerli veriler

Aşağıdaki istatistikler **oyuncu-bazlı kart düellosuna uymaz** (aynı kulüp/milliyetten iki oyuncu hep
aynı değeri alır → kapışma olmaz). Ama "Kadro Kur" / "Liste Doldur" / bonus modları için anlamlı —
küçük bir **manuel sabit-veri tablosu** ile ileride eklenebilir:

- **Oyuncunun (son) kulübünün toplam kazandığı Ballon d'Or sayısı** — kulüp-bazlı türetme (o kulüpte
  oynarken ödül alan oyuncu sayısı); oyuncu verisinde yok, çapraz toplama gerekir.
- **Milliyetin Dünya Kupası şampiyonluğu** (Brezilya 5, İtalya/Almanya 4 …) — ülke sabiti, ~10 ülke manuel.
- **Milliyetin kıta turnuvası şampiyonluğu** (Arjantin Copa América, Fransa EURO …) — ülke sabiti, ~15 ülke manuel.

> Not: Bireysel ödül verisi (Ballon d'Or, gol krallığı, yılın oyuncusu) zaten çekildi ve **oyuncu-bazlı**
> olduğu için kart VS'e eklendi (`w20`–`w22`). Yukarıdakiler **kulüp/ülke-bazlı toplama** olduğundan ayrı tutulur.

---

## Lisans

Henüz lisanslanmadı. MVP / fikir doğrulama aşamasında.
