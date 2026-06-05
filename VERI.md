# VERI.md — Veri Çekimi Hazırlık & Süreç Rehberi

> **Amaç:** Tüm modların (aktif 3 + gelecek planları) veri ihtiyaçlarını, hangi scriptlerin
> hangi veriyi çekeceğini ve çekim sırasını tek yerde toplamak.
>
> Hazırlık tarihi: 2026-06-03. Tam mod analizleri: [PLAN.md](PLAN.md) §6, §14, §15, §16.

> ## ✅ ÇEKİM YAPILDI (2026-06-05)
> Kulüp-bazlı modların veri hazırlığı **tamamlandı ve çekildi**:
> - **Kulüp logoları + renkleri:** top 120 kulüp çekildi (crest 120/120, renk 117/120) → `clubs.json`.
> - **clubPool.json** (75 kulüp, logolu) + **clubPairs.json** (1308 çift, ≥3 cevap) üretildi.
> - Şemalara `crestUrl`/`colors` eklendi (schema.ts + shared-types). Tüm typecheck temiz.
> - **Oyuncu sayısı 8912 sabit** (veri kaybı yok). Süre: ~30 saniye (logo batch + lokal hesap).
>
> **Yapılmayanlar (bilinçli):** (1) Cache tazeleme — atlandı (çekilecek taze veri yok; players.ts
> mevcutları atlıyor, cache TTL geçerli). (2) +50 kulüp havuz genişletme — atlandı (ölçüldü: büyük
> kulüpler zaten 100-160 oyuncuyla dolu, çiftlerin %47'si ≥3 cevaplı → mevcut havuz yeterli).

---

## 0. Mevcut durum özeti (ölçülmüş)

| Veri | Kaynak | Mevcut durum |
|---|---|---|
| Oyuncu sayısı | `apps/web/public/data/players.json` | **8.912** |
| Kulüp sayısı | `apps/web/public/data/clubs.json` | **6.240** |
| `clubId → clubs.json` eşleşmesi | — | **%100** (56.839/56.839 stint) |
| Kulüp **logosu** (`crestUrl`) | TM `/clubs` | **✅ ÇEKİLDİ** (top 120 kulüp: 120/120) — 2026-06-05 |
| Kulüp **renkleri** (`colors`) | TM `/clubs` | **✅ ÇEKİLDİ** (top 120: 117/120) — 2026-06-05 |
| `maxTransferFeeEUR` (zirve değer) | TM `marketValueDetails.highest` | **⚠️ %80 dolu** (%20 NULL — TM eski oyuncuda tutmuyor, **fallback ile düzelmez**) |
| Kariyer kulüpleri (`clubs[]`) | TM `clubStints` | ✅ %97 oyuncu ≥2 kulüp, %82 ≥4 |
| Temel istatistik (gol/asist/maç/boy/forma) | TM | ✅ %87-98 dolu |
| `competitions.worldCupApps` | TM | ⚠️ %23 (targetMode'un tek kriteri buna dayanıyor!) |
| `competitions.uclApps` | TM | ⚠️ %41 |
| `individual.totalIndividual` (ödül) | TM honours | ⚠️ %28 |

### Mevcut veri pipeline mimarisi (DEĞİŞMEDİ)

```
TM API/scrape ──▶ cache/*.json ──▶ merge.ts ──▶ seed/players.json + seed/clubs.json
                                                          │
                                              build.ts (zod validate + dedup)
                                                          ▼
                                    apps/web/public/data/{players,clubs,meta}.json
```

- **HTTP client** (`scripts/scrape/http.ts`): cache + 2sn rate-limit + retry. Tüm scrape bunu kullanır.
- **TM API client** (`scripts/scrape/tmApi.ts`): `/players` (metadata, marketValue, clubAssignments,
  portraitUrl) ve `/clubs` (ad, konum, **`crestUrl`**, **`colors`**). Auth yok.
- Build-time çalışır; **production runtime'da TM'ye istek GİTMEZ** (statik JSON serve edilir).

---

## 1. Aktif 3 modun durumu — "çeşitlilik yok" sorunu

Kullanıcı: "kart kapışma dışındaki 3 modu sadece çalışır hale getirdik, veri çeşitliliği yok."

**Kök neden ÖLÇÜLDÜ — bu çoğunlukla bir VERİ değil, KRİTER (kod) sorunu:**

| Mod | Dosya | Mevcut kriter | Sorun |
|---|---|---|---|
| **Kart Kapışma** (referans) | `question-templates/templates.json` | **106 şablon** | ✅ Zaten çeşitli |
| **Liste Doldur** | `lib/listMode.ts` | ~1 kriter (`nationalCaps`) | Az kriter → her oyun aynı |
| **Hedefe Yaklaş** | `lib/targetMode.ts` | ~1 kriter (`worldCupApps`, hedef 60-80) | Az kriter + **worldCupApps %23 dolu** (zayıf veri) |
| **Kadro Kur** | `lib/squadMode.ts` | height + age | Az metrik |

**Sonuç — çeşitlilik iki ayrı işle artar:**
1. **Kod (veri çekmeden, hemen):** Mevcut DOLU alanlardan (totalGoals %96, assists %94, height %87,
   jersey %98, trophies %81, leagueGoals %93) yeni kriterler **tanımlamak**. Çoğu çeşitlilik buradan gelir.
2. **Veri (çekim):** Zayıf alanları (worldCupApps %23, uclApps %41, individual %28, marketValue %80)
   güçlendirmek — bunlar yeni kriterleri besler ama TM bazılarını eksik tuttuğu için tam dolmaz.

> **Not:** "Liste/Hedef'e daha çok kriter ekle" işi `lib/*Mode.ts` içinde, **veri çekmeden** yapılabilir.
> Bu VERI.md veri tarafına odaklanır; kriter ekleme ayrı (kod) bir görevdir.

---

## 2. Gelecek modların veri ihtiyaçları (PLAN.md §14-16)

| Mod | PLAN | Gereken veri | Durum |
|---|---|---|---|
| Kariyer Yolu | §14.1 | `clubs[]` (var) + kulüp **logosu** | ✅ Logo çekildi |
| 4'lü Kıyas / marquee filtre | §14.0/14.3 | `isMarquee` (caps/titles/awards/mv) | mv %80, gerisi var |
| **Futbol Çinko** (matris) | §15.1 | kulüp havuzu + **logo** + clubs[] | ✅ Logo + havuz hazır |
| **Rastgele 7** (bitişiksiz) | §15.2 | kulüp havuzu + **logo** + clubs[] | ✅ Logo + havuz hazır |
| **İki Takım Eşleşmesi** (online) | §15.3 | **clubPairs** (≥3 ortak) + logo | ✅ clubPairs üretildi |
| **Futbol İmposter** (Faz 2+) | §16 | marquee oyuncu + bulanık ipucu alanları (pozisyon/milliyet/dönem/kupa) | Hepsi MEVCUT — ek çekim yok |

**Kritik gözlem:** İmposter modu **ek VERİ gerektirmiyor** (ipucu alanları zaten var); onun engeli
realtime ALTYAPI (bkz. PLAN.md §16). Çinko/7'li/eşleşme modlarının ortak ihtiyacı (**kulüp logosu +
kürasyonlu havuz + çift tablosu**) **✅ tamamlandı** (2026-06-05 çekimi).

---

## 3. Hazırlanan scriptler (yazıldı + test edildi + çalıştırıldı)

Hepsi `data-pipeline/` altında. **2026-06-05'te gerçek çekim yapıldı** (enrich:marketvalues hariç).
`pnpm typecheck` (data-pipeline + web) **temiz geçer**.

### 3.1 `scripts/scrape/enrichClubLogos.ts` — kulüp logosu + renk ✅ ÇALIŞTIRILDI (120 kulüp)

- **Ne yapar:** `seed/clubs.json`'daki **popüler** kulüplere (players.json'da en çok oyuncu barındıran
  top-N) TM API'den `crestUrl` + `colors` ekler. Idempotent (mevcut logoyu atlar, `--force` ile yeniler).
- **Kapsam:** Tüm 6240 kulüp değil — default **top 120** (modlar top ~75 kullanır + tampon).
- **Çekilebilirlik:** `tm_<id>` formatlı kulüpler doğrudan; manuel slug'lar (galatasaray vb.)
  `SLUG_TO_TM_ID` map'inden (FB/GS/BJK/TS eklendi, gerekirse genişletilir).
- **ÇALIŞTIRMA SONUCU (2026-06-05, top 120):** **120/120 kulüp logosu (crest), 117/120 renk** çekildi
  → `seed/clubs.json` + `pnpm build` ile `public/clubs.json`. Örnek: Bayern (#DB072D), Werder (#00924A),
  FB (#FFED00/#002D72). Süre ~5sn (TM `/clubs` batch: 60 kulüp/istek = 2 istek). ✅
- **Komut:** `pnpm enrich:logos --top=120` · yenile: `--force` · plan: `--dry`

### 3.2 `scripts/buildClubPool.ts` — kürasyonlu kulüp havuzu ✅ ÜRETİLDİ (lokal)

- **Ne yapar:** Çinko/7'li/eşleşme modları için "en iyi ~75 Avrupa kulübü" havuzu üretir (popülerlik =
  kulüpteki farklı oyuncu sayısı). **Ülke başına tavan** (default 12) ile Türk-kulüp ağırlığını dengeler.
- **Çıktı:** `apps/web/public/data/clubPool.json` (`{id,name,country,crestUrl,playerCount,rank}`).
- **ÜRETİM SONUCU (2026-06-05):** 75 kulüp, 12 ülke, **logosu eksik 0/75**. Dağılım: Türkiye:12,
  Italy:12, England:12, Germany:12, France:9, Spain:8, NL:3, Portugal:3. İlk 10: FB, GS, TS, BJK,
  Milan, Inter, Juve, Barça, Marseille, Fiorentina. ✅ (3.1'den sonra çalıştığı için logolar dolu.)
- **Komut:** `pnpm build:clubpool` · varyant: `--size=50 --perCountry=8`

### 3.3 `scripts/buildClubPairs.ts` — iki-takım eşleşme tablosu ✅ ÜRETİLDİ (lokal)

- **Ne yapar:** Mod C (§15.3) için **≥3 ortak oyunculu** kulüp çiftlerini + kabul edilen cevap
  listelerini üretir. clubPool.json varsa onu, yoksa popülerlikten türetir.
- **Çıktı:** `apps/web/public/data/clubPairs.json` (`{minAnswers, pairs:[{a,b,aName,bName,count,answers}]}`).
- **ÜRETİM SONUCU (2026-06-05):** clubPool.json'u kullandı → 2775 çiftten **1308'i (%47) uygun**
  (≥3 cevap). En zengin: FB×GS (41), Milan×Fiorentina (40), Milan×Juve (37). Ortalama 7.7 cevap/çift.
  Dosya ~1.08 MB. ✅
- **Komut:** `pnpm build:clubpairs` · varyant: `--min=4 --pool=50`

### 3.4 `scripts/scrape/enrichMarketValues.ts` — market value fallback ⚠️ SINIRLI

- **Ne yapar:** NULL `maxTransferFeeEUR`'u `cache/list.json`'daki güncel `marketValueText` ile doldurmayı
  dener (lokal, scrape yok).
- **TEST SONUCU — DÜRÜST BULGU:** list.json'da yalnız **499 isimde** güncel değer var; NULL olan 1745
  oyuncudan sadece **1'i** eşleşti. **Fallback işe yaramıyor** çünkü NULL'lar (eski/emekli oyuncular)
  list.json'da da değersiz.
  → **Market value %20 NULL bu yöntemle düzeltilemez.** Çözüm: §14.0'daki **bileşik OR marquee skoruna
  gü​ven** (caps≥30 / titles≥5 / award≥1 ile efsaneler zaten yakalanıyor; market value tek-eşik değil).
- **Komut:** `pnpm enrich:marketvalues` (rapor) · `--apply` (seed'e yaz).

---

## 4. ÇEKİM SIRASI (istenince bu sırayla çalıştır)

> ⚠️ Her scrape adımı TM'ye 2sn aralıkla istek atar (rate-limit). Logo çekimi tek `/clubs` batch
> isteğiyle ~75 kulübü 1-2 istekte çeker → **çok hızlı** (dakikalar değil saniyeler).

> ✅ Adım 1, 3, 4, 5 **2026-06-05'te çalıştırıldı** (adım 2 atlandı — sınırlı fayda). Tekrar
> çalıştırılabilir (idempotent); logoyu yenilemek için `enrich:logos --force`.

```bash
cd data-pipeline

# 1) Kulüp logoları + renkleri (TM scrape — top 120 kulüp, hızlı batch)  ✅ YAPILDI
pnpm enrich:logos --top=120          # crest 120/120, renk 117/120

# 2) (opsiyonel) Market value fallback denemesi — sınırlı fayda          ⏭️ ATLANDI
pnpm enrich:marketvalues --apply     # NULL'ları list.json'dan doldurmayı dener (işe yaramıyor, §3.4)

# 3) Seed → public build (logolar public'e yansısın)                     ✅ YAPILDI
pnpm build                           # players=8912 (sabit), clubs=6240

# 4) Kürasyonlu kulüp havuzu (lokal — public/data/clubPool.json)         ✅ YAPILDI
pnpm build:clubpool                  # 75 kulüp, logosu eksik 0/75

# 5) İki-takım eşleşme tablosu (lokal — public/data/clubPairs.json)      ✅ YAPILDI
pnpm build:clubpairs                 # 1308 çift (≥3 ortak cevap)
```

**Daha çok oyuncu/kulüp çeşitliliği istenirse (opsiyonel, daha uzun scrape):**
```bash
# Daha fazla kulübün kadrosunu çekip oyuncu havuzunu genişlet (mevcut script):
pnpm tsx scripts/scrape/clubSquads.ts --clubs=<tmId listesi> --seasons=2025,2015,2005
# → list.json büyür → scrape:players → scrape:merge → build  (tam pipeline)
```

---

## 5. Şema değişiklikleri (logo için) — ✅ YAPILDI

Logo alanları public veriye girebilsin diye şemalara eklendi:

1. ✅ **`data-pipeline/scripts/schema.ts`** → `clubSchema`'ya `crestUrl` + `colors` eklendi.
2. ✅ **`packages/shared-types/src/club.ts`** → `Club` interface'ine `crestUrl?` + `colors?` eklendi.
3. ⏭️ **`data-pipeline/scripts/scrape/merge.ts`** `tmClubToClub()` → tam merge'de logo yazmak OPSİYONEL;
   şimdilik `enrichClubLogos.ts` ayrı script olarak seed'e ekliyor (merge değişmedi). Tam yeniden
   scrape yapılırsa merge'e de `crestUrl: tc.crestUrl` eklenebilir (ama gerek yok — enrich yeterli).

> Tüm typecheck (data-pipeline + web) bu değişikliklerle temiz geçiyor.

---

## 6. Açık notlar / kararlar

- **Logo telifi:** TM crestUrl'leri TM CDN'inden gelir. Kendi sunucumuzdan serve etmek yerine URL
  referansı tutulur (PLAN.md §10'daki "logo telifi" notuyla uyumlu — gerekirse bayrak+isim fallback).
- **Market value:** %20 NULL kalıcı (yukarı). Marquee filtresi OR skoruna dayanmalı (§14.0).
- **İmposter modu:** Ek veri gerektirmez; engeli realtime altyapı (§16). VERI.md kapsamı dışı.
- **clubPool/clubPairs** runtime'da da türetilebilir (saf JS), ama build-time JSON üretmek daha hızlı/
  deterministik — bu yüzden script olarak hazırlandı.
