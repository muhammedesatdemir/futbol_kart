# Futbol-Kart — Online Mod Yol Haritası & Mimari Dökümanı

> **Durum:** Uygulama başladı — temel altyapı kuruldu (aşağıda "İlerleme" bölümü).
> **Tarih:** 2026-06-05
> **Kapsam:** (1) Canlıya alma için ön-koşul olan 25MB veri sorunu, (2) Online karşılıklı eşleşme modu.
> **Pilot mod:** VS Düello (`/oyna/[gameId]`).

---

## İlerleme (güncel)

✅ **Tamamlanan:**
- **DB şeması** — `match`, `match_move`, `matchmaking_queue`, `user_rating` tabloları eklendi (`packages/db/src/schema.ts`). Migration üretildi (`packages/db/drizzle/0000_*.sql`) — *henüz canlıya uygulanmadı.*
- **Google OAuth** — Better-Auth'a Google eklendi (env varsa aktif), login sayfasına "Google ile devam et" butonu (`apps/web/src/lib/auth.ts`, `apps/web/src/app/giris/page.tsx`, `.env.example`).
- **Oyun motoru ortak pakete taşındı** — Gerçek oyun mantığı (sessionMachine, gameFlow, gameConstants, jokers, bonusConditions, bonusSelection) `apps/web/src/lib/` → `packages/game-engine/` taşındı. Eski ölü taslak (reducer/validate/events/bot) silindi. 16 dosyada import güncellendi. **Tek kural seti** artık web+sunucu+mobil için hazır. Tüm workspace typecheck temiz.
- **Sunucu-otoriteli motor (kavram ispatı)** — `apps/web/src/lib/server/matchEngine.ts` (game-engine'i sunucuda çalıştırıp hamleyi doğrular/çözer, doğru cevabı sızdırmaz) + `apps/web/src/app/api/match/[matchId]/move/route.ts` (yetki + doğrulama + DB yazımı + güvenli yanıt). Typecheck temiz.

- **Online mod (GameMode 'online')** — reducer eşzamanlı akış için uyarlandı (el seçimi + bonus eşzamanlı, HANDOFF yok). `game.ts` GameMode.
- **Matchmaking** — `lib/server/matchmaking.ts` (kuyruk, FIFO eşleştirme, maç oluşturma) + `api/matchmaking` (POST/GET/DELETE).
- **Deterministik soru seçimi** — game-engine'e FlowState serileştirme (`serializeFlowState`/`restoreFlowState`, PRNG getState/setState). `match.flowState` jsonb kolonu. Soru seçimi sunucu-otoriteli + kaldığı yerden devam (replay yok).
- **Genişletilmiş move API** — action-tabanlı (`submit-hand` / `play-card`), otomatik tur başlatma + çözüm, audit log, Ably publish.
- **Ably realtime** — `lib/server/ably.ts` (publish + token) + `api/match/[id]/ably-token`. Key yoksa polling'e düşer (graceful).
- **Online UI** — mod seçiminde "🌐 Online" kartı → `/online` (eşleşme bekleme) → eşleşince `/oyna-online/[matchId]`.
- **Online maç sayfası** — `/oyna-online/[matchId]` + `useOnlineMatch` hook (maç yükle, move gönder, Ably/polling dinle). Temel dilim: el seçimi → kart oynama → tur sonucu. **Production build geçiyor.**

- **Online jokerler (Çarpan + İstatistik-Gör)** — sunucu-otoriteli. Move API'ye `use-multiplier` / `use-reveal` action'ları. Çarpan: kart oynamadan önce pendingMultiplier set eder, çözümde uygulanır. İstatistik-Gör: kendi elinin değerlerini SUNUCUDA hesaplar, YALNIZCA o oyuncuya döner (rakibinki sızmaz — hile koruması). `useOnlineMatch` + online maç sayfasında joker barı + reveal rozetleri. Build geçiyor.

- **Transfer jokeri (online)** — sunucu-otoriteli tek-atımlık takas. `applyTransferJoker` (doğrula+swap), move API `transfer` action, `transfer-options` endpoint (rakibin transfer-edilebilir kartlarını AÇMA anında verir). Kurallar: kart oynamadan önce, ilk-gelen-kazanır (turda tek transfer), fazın son turunda kapalı. Tabela her iki tarafa açık (`TransferBoard`). **Reducer:** online'da TRANSFER_EXECUTE → ROUND_PLAY'de kalır (ara sahne yok).
- **🔒 Rakip eli gizliliği** — `GET /api/match` artık rakibin elini MASKELER (kart id'leri gizli, sadece sayısı). Düz oyunda F12'den kart sayma engellendi. Rakip eli yalnızca transfer açılınca `transfer-options`'tan (transfer-edilebilir kartlarla sınırlı) gelir.

⏳ **Sıradaki:**
- **Senin kurulumun:** Neon DB (`DATABASE_URL`) → migration uygula; Google OAuth env; Ably key (opsiyonel).
- Uçtan uca canlı test (iki tarayıcı, gerçek eşleşme) — DB bağlanınca.
- Bonus mekaniği (3 zorunlu kategori), faz geçişleri (uzatma/sudden), süre/deadline.
- Reconnect/kopma dayanıklılığı, rating hesabı (Elo), diğer modlara yayma.

> **3 jokerin hepsi online'da hazır:** Çarpan (×2/÷2), İstatistiği Gör (gizli, sadece kendi eli), Transfer (açık takas). Hepsi sunucu-otoriteli + hile-korumalı.

> **Akıcılık iyileştirmeleri (2026-06-07):**
> - **Render gürültüsü kesildi:** Poll'de state değişmediyse `setState` atlanır (yeni obje referansı üretilmez) → 1.5sn'lik tüm-sayfa re-render'ı yok, framer-motion animasyonları kasmaz.
> - **Aksiyon bloklaması kalktı:** `sendMove` artık POST sonrası `await refresh()` yapmaz (ateşle-unut) → her "Hazırım"/kart/kategori ~200ms hızlandı.
> - **Optimistic UI:** Kategori atama (`BonusAssignScene`) ve kart oynama (`RoundScene` `optimisticPlayed` + 4sn watchdog) tıklama anında tepki verir; sunucu yanıtı gelince senkronlanır. `HandDisplay` artık `React.memo`'lu.
> - **Geç/çift hamle dayanıklılığı:** `sendMove` 422'yi (geç play-card vb.) yutar (throw etmez → dev overlay çökmesi yok); `handleCardPlay` sahne ROUND_PLAY değilse veya zaten oynanmışsa POST göndermez.
> - **🏗️ Versiyon-tabanlı GET (mimari):** GET `/api/match/[id]` artık `?v=<version>` alır. Sürüm değişmemiş VE timeout tetiklenmemişse minik `{ unchanged, version, turnDeadline }` döner → `computeQuestionTitle` (loadGameData + şablon tarama) + maskeleme + tam state serileştirme ATLANIR. Değişmeyen poll'ler (GET'lerin çoğu) neredeyse bedava. Yanıta `version` eklendi; client `versionRef`'te tutar. POST/Ably sonrası sürüm uyuşmazlığı tam state'i tetikler (doğru).
> - **🏗️ HİBRİT PUSH (mimari, 2026-06-07 — diğer modlara ŞABLON):** Ably bağlıyken poll 1.5sn→5sn'ye iner (yalnızca "ekrandan bağımsız ilerleme" güvenlik nabzı). Anlık güncellemeyi Ably getirir: hamle olunca rakip mesajı ANINDA alır → hemen ucuz `?v=` GET → maskeli tam state → render (~100-150ms). **Maskeleme SUNUCUDA kalır** (Ably mesajı gizli veri taşımaz; rakip eli sızmaz) → hile koruması tam + sunucu TEK otorite. Ably yokken poll 1.5sn'de kalır (tek kaynak). Dayanıklılık: `connection.on('connected')`→yavaş poll, `'disconnected'/'suspended'`→hızlı poll + anında refresh. **Karar gerekçesi:** "tam push + client maskeleme" (~50ms daha hızlı) REDDEDİLDİ çünkü tek-otorite ilkesini deler + 4 modda 4 kat state-birleştirme hata yüzeyi; ~50ms fark oyun hissinde fark edilmez. Sonuç: GET fırtınası biter, Neon/bant ~%70 düşer, ücretsiz katmanlar korunur (Ably 6M mesaj/ay = ~100k maç/ay; mesaj içeriği değil ADEDİ ücretlenir, state 4-8KB tek mesaj sınır altı).

⚠️ **Bilinen sınırlar / notlar:**
- Sunucu motoru `loadGameData()` ile 25MB players.json'u `fs`'ten okuyor (cache'li ama ağır) → **Faz 0** ile maç-başına ince veri yüklemeye geçilecek.
- Kavram-ispatı route'unda realtime yayın (Ably) ve süre/deadline zorlaması YOK — Faz 3/5'te eklenecek.
- `match_move`'da resolve event'i `side: 'P1'` ile işaretli (gerçekte 'system') — audit detayı, sonra netleştirilebilir.

---

## 0. Verilen Kararlar (özet)

Bu karar bloğu, dökümanın geri kalanının dayanağıdır. Sonradan değişirse buradan güncellenir.

| Karar | Seçim | Gerekçe |
|---|---|---|
| **Sıralama** | Önce mimari, sonra domain/Vercel | Domain bağlamak 1 saatlik geri-alınabilir iş; yanlış online mimari baştan yazılır |
| **Oynanış tipi** | Gerçek zamanlı + sunucu-otoriteli + kopmaya dayanıklı | Süreye karşı oynama heyecanı canlı olmayı gerektirir; durum sunucuda tutulunca kopma sorunsuz |
| **Hile koruması** | Tam koruma (cevap client'a gitmez) + süre baskısı | Motor zaten sunucuda çalışabildiği için "bedava"; süre, dışarıdan aratmayı etkisiz kılar |
| **Realtime altyapısı** | **Ably** (ücretsiz katman) | 6M mesaj/ay, 200 eşzamanlı bağlantı, kredi kartı yok — en cömert ücretsiz katman |
| **Backend tabanı** | Mevcut korunur: **Neon Postgres + Better-Auth** | Şema ve auth çalışıyor; söküp Supabase'e göçmek zaman israfı + uyku tuzağı |
| **Pilot mod** | VS Düello | En olgun, en içerikli mod; şablon burada kurulursa diğerleri kolay uyarlanır |
| **Kayıt/giriş** | **Google + e-posta** (Better-Auth) | Google tek-tık ana yol (en az sürtünme), e-posta magic-link yedek; rating için sağlam kimlik |
| **Kimlik akışı** | Online kutusuna ilk tıkta kısa kayıt → sonra direkt giriş; ortak backend, her cihazda aynı hesap | Bot/offline misafir kalır; online yalnızca girişli kullanıcıya |
| **Rating** | **Şimdi şema yeri aç, hesabı sonra doldur** | Sonradan göç derdi olmasın; MVP'de herkes 1000'le başlar, görünmez |
| **Maliyet** | Başlangıçta **0 TL** | Neon + Better-Auth + Ably + Vercel Hobby hepsi ücretsiz katman |

---

## 1. Mevcut Mimari — Online İçin Güçlü ve Zayıf Yanlar

### 1.1 Güçlü yanlar (online'ı kolaylaştıran)

- **Event-sourced reducer** — Oyun, ayrık olayların dizisi: `MODE_CHOSEN`, `CARD_PLAYED`, `ROUND_RESOLVED`, vb. (`apps/web/src/lib/sessionMachine.ts:154`). Online'ın temeli: her hamle = bir event, sunucuya gider, doğrulanır, karşıya iletilir.
- **Deterministik PRNG** — `seed` aynıysa soru sırası aynı (`apps/web/src/lib/gameFlow.ts:37`). İki oyuncu aynı seed'le aynı maçı görür; sunucu hile kontrolü için aynı hesabı tekrarlar.
- **Saf TS oyun motoru** — `packages/game-engine/` framework'ten bağımsız; aynı kod hem client hem sunucuda çalışır → server-authoritative neredeyse bedava.
- **Veritabanı + auth hazır** — Neon Postgres + Drizzle + Better-Auth (magic-link) kurulu (`packages/db/src/schema.ts`, `apps/web/src/lib/auth.ts`).
- **Maç kaydı altyapısı** — `games` tablosu + `/api/games` snapshot kaydı mevcut (`apps/web/src/app/api/games/route.ts`). Online maç sonuçları aynı boruyu kullanabilir.

### 1.2 Zayıf yanlar (canlıya engel)

- 🔴 **25MB client-side veri** — `apps/web/public/data/players.json` tek başına 25MB. Her açılışta indiriliyor. Binlerce kullanıcıda yavaş açılış + yüksek bant maliyeti. **Online'dan bağımsız, zaten çözülmeli.**
- 🟡 **Gerçek kullanıcı kimliği yok** — Oyuncu isimleri localStorage'da (`profileStore.ts`). Online eşleşme için kalıcı kimlik şart (auth altyapısı var, kullanılmıyor).
- 🟡 **Vercel serverless WebSocket tutamaz** — Mimari kısıt (para değil). Realtime için ayrı katman (Ably) zorunlu.
- 🟡 **Tüm doğru cevaplar client'ta** — Online'da F12 ile görülebilir. Sunucu-otoriteli motor bunu çözer.

---

## 2. Hedef Mimari (Online)

```
┌─────────────┐         ┌──────────────────────┐         ┌─────────────┐
│   Web /      │  HTTP   │  Next.js API Routes   │  SQL    │    Neon      │
│   Mobil      │◄───────►│  (Vercel serverless)  │◄───────►│  Postgres    │
│   Client     │         │  - auth (Better-Auth) │         │  - user      │
│              │         │  - matchmaking kuyruğu│         │  - match     │
│  (oyun UI,   │         │  - hamle doğrulama    │         │  - moves     │
│   render)    │         │  - sunucu-otoriteli   │         │  - rating    │
│              │         │    motor (game-engine)│         └─────────────┘
└──────┬───────┘         └──────────┬───────────┘
       │                            │
       │  WebSocket (kalıcı)        │  publish (event)
       ▼                            ▼
┌──────────────────────────────────────────────┐
│                    ABLY                        │
│  - her maç = bir "channel" (match:<id>)        │
│  - sunucu event publish eder, client dinler    │
│  - kopma/yeniden bağlanma Ably'de yönetilir    │
└──────────────────────────────────────────────┘
```

### 2.1 Akışın özü (server-authoritative)

1. **Client sadece "niyet" gönderir:** `POST /api/match/<id>/move { cardId }`. Doğru cevabı bilmez.
2. **Sunucu doğrular ve hesaplar:** `game-engine` reducer'ını sunucuda çalıştırır. Geçersiz hamleyi reddeder. Sonucu hesaplar.
3. **Sunucu durumu DB'ye yazar** (kaynak-doğru = source of truth).
4. **Sunucu Ably'ye publish eder:** `match:<id>` kanalına yeni event. Her iki client de anında görür.
5. **Client render eder.** Client'ın tuttuğu durum yalnızca görsel; otorite sunucuda.

> **Kritik kural:** Doğru cevap / kazanan, hamle yapılana kadar client'a **hiç** gönderilmez. Reveal anında sunucu gönderir.

---

## 3. Süre & Hile Modeli

| Hile türü | Önlem |
|---|---|
| **Cevabı F12'den görme** | Sunucu, doğru değeri/kazananı reveal'a kadar göndermez (server-authoritative) |
| **Dışarıdan aratma (Google/Transfermarkt)** | **Tur süresi 10–15 sn.** Aratıp dönmeye vakit yetmez. Süre = hem mekanik hem koruma |
| **Sahte "kazandım" mesajı** | Kazananı yalnızca sunucu hesaplar; client mesajına güvenilmez |
| **Süreyi durdurma / geç hamle** | Süre **sunucuda** sayılır; süre dolunca sunucu otomatik "pas/rastgele" uygular |
| **Çoklu hesapla kendine karşı oynama (rating farming)** | İleride: rating sistemi + IP/cihaz sinyali (MVP'de ertelenebilir) |

> Süre sunucu tarafında otoriter olmalı. Client'taki geri sayım yalnızca görsel; gerçek "süre doldu" kararını sunucu verir (client saatine güvenilmez).

---

## 4. Veritabanı Şeması — Yeni Tablolar

Mevcut `user`, `session`, `account`, `verification`, `games` korunur. Eklenecekler:

```
match
  id              text PK
  mode            text          -- 'vs-duello' (pilot), sonra diğerleri
  seed            text          -- deterministik PRNG seed (iki oyuncu aynı maçı görür)
  status          text          -- 'matchmaking'|'active'|'finished'|'abandoned'
  p1_user_id      text FK user
  p2_user_id      text FK user
  current_scene   text          -- sunucu-otoriteli mevcut sahne
  state           jsonb         -- sunucudaki kaynak-doğru SessionState
  turn_deadline   timestamptz   -- aktif turun sunucu-otoriteli bitiş anı
  winner_side     text          -- 'P1'|'P2'|'tie'|null
  created_at      timestamptz
  updated_at      timestamptz

match_move        -- event log (audit + reconnect + replay)
  id              text PK
  match_id        text FK match
  seq             integer       -- sıra no (idempotent uygulama için)
  side            text          -- 'P1'|'P2'
  event           jsonb         -- SessionEvent (CARD_PLAYED vb.)
  created_at      timestamptz

matchmaking_queue -- bekleyenler
  user_id         text PK FK user
  mode            text
  rating          integer       -- eşleştirme için (MVP'de sabit 1000 olabilir)
  enqueued_at     timestamptz

user_rating       -- ŞEMA ŞİMDİ açılır, hesap SONRA doldurulur (karar)
  user_id         text FK user
  mode            text
  rating          integer       -- DEFAULT 1000 (Elo başlangıcı, Lichess benzeri)
  games_played    integer       -- DEFAULT 0
  wins            integer       -- DEFAULT 0
  losses          integer       -- DEFAULT 0
  draws           integer       -- DEFAULT 0
  updated_at      timestamptz
  PRIMARY KEY (user_id, mode)
```

> **Rating kararı:** Tablo şimdiden oluşturulur ki sonradan göç gerekmesin. Online maç bitince satır oluşur/güncellenir (en azından `games_played`/`wins`). Elo **hesabı** (K-faktörü, beklenen skor) MVP sonrası eklenir; o ana kadar herkes 1000'de durur, UI'da gösterilmez.

> `match.state` (jsonb) = kaynak-doğru. `match_move` = audit/replay/reconnect kaydı. Reconnect: client `match.state`'i çeker, kaldığı yerden devam.

---

## 5. Yol Haritası — Fazlar

Her faz bağımsız olarak test edilebilir ve "çalışan ürün" bırakır. Veri sorunu (Faz 0) online'dan bağımsız olduğu için paralel yürüyebilir.

### Faz 0 — Veri ağırlığını çöz (canlıya ön-koşul, online'dan bağımsız)

**Sorun:** 25MB `players.json` her açılışta iniyor.

> **✅ Hızlı kazanç yapıldı (2026-06-05):** Ölçüm bulgusu — players.json ham 26MB ama gzip'le **2.4MB**, brotli'yle **1.3MB** (JSON çok sıkışıyor). Asıl sorun boyut değil, `Cache-Control: max-age=0` idi: tarayıcı **her açılışta yeniden indiriyordu**. `next.config.mjs`'e `/data/*` için `max-age=86400, stale-while-revalidate=604800` eklendi → bir kez inip cache'lenir. Dev gzip sunuyor; Vercel prod otomatik brotli (~1.3MB) sunar. **Mimari değişiklik yapılmadı.**
>
> **Alan analizi (lazy-load için, henüz UYGULANMADI):** `stats` (%30) kalmalı — kart seçim/filtreleme tüm oyuncularda kullanıyor. `achievements` (%22.6) ve `clubs` dizisi (%35) **çıkarılabilir** — yalnızca tur çözümünde (2 kart) kullanılıyor, maç anında çekilebilir → ek ~%45-50 tasarruf. Risk: resolver + matchEngine'i etkiler, dikkatli test gerekir. **İleride değerlendir.**

**Adımlar:**
- [ ] **0.1** Veriyi ölç: hangi alanlar gerçekten oyun anında lazım? Çoğu oyuncu metası (koordinat, başarılar) yalnızca bazı sorularda gerekir.
- [ ] **0.2 (Hızlı kazanç)** İki katmana böl:
  - **`players-core.json`** — id, isim, pozisyon, kulüp, temel istatistik (oyunun %90'ı). Küçük, bundle/CDN.
  - Ağır alanlar (koordinat, detaylı kariyer) → **API'den tur bazlı çek** veya ayrı parçalar.
- [ ] **0.3** Statik dosyaları **gzip/brotli** ile sun + uzun cache header. (Vercel otomatik yapar ama doğrula.)
- [ ] **0.4 (İdeal)** Oyun anında lazım olan veriyi sunucudan ver: VS Düello'da maç başında yalnızca o maçtaki ~14 kartın detayı gönderilir; tüm 8912 oyuncu değil.
- [ ] **0.5** Hedef: ilk açılış indirme **< 1–2MB**.

> Online server-authoritative olunca bu zaten doğal çözülür: sunucu maçtaki kartların verisini bilir, client'a yalnızca gerekenini yollar.

### Faz 1 — Kimlik & Hesap (online'ın ön-koşulu)

**Akış (kullanıcı kararı):** Online kutusuna ilk tıkta kısa kayıt/giriş ekranı → "Google ile devam et" (tek tık) **veya** e-posta. Ortak backend olduğu için kullanıcı her cihaz/platformda aynı hesapla girer. Bot/offline modlar misafir kalır.

- [ ] **1.1** Better-Auth'a **Google OAuth** ekle (`socialProviders.google`). `account` tablosu zaten OAuth alanlarına sahip — yeni tablo gerekmez, sadece config + `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` env.
- [ ] **1.2** E-posta magic-link akışını uçtan uca canlı et (Resend) — yedek yol.
- [ ] **1.3** Online giriş kapısı: online kutusuna tıklayınca girişli değilse kayıt/giriş modalı; girişliyse direkt eşleşme.
- [ ] **1.4** `profileStore` (localStorage isim) ile `user` hesabını köprüle: giriş yapınca görünen ad hesaba bağlanır.
- [ ] **1.5** Görünen ad (display name) + benzersizlik kuralı (rating tabloları/sıralama için lazım olacak).
- [ ] **1.6** "Misafir olarak oyna" (bot/offline) korunur; **online yalnızca girişli** kullanıcıya.

### Faz 2 — Sunucu-Otoriteli Motor (online'ın kalbi)

- [ ] **2.1** `game-engine` reducer'ını sunucuda çağrılabilir hale getir (zaten saf TS; API route'tan import).
- [ ] **2.2** Soru seçimini (`pickQuestion`) ve çözümü (`resolveCards`) sunucuya taşı; doğru cevap sunucuda kalır.
- [ ] **2.3** `match.state` + `match_move` ile durum kalıcılığı: her hamle → doğrula → state güncelle → DB yaz.
- [ ] **2.4** Idempotent hamle uygulama (`seq` ile çift gönderim/yeniden bağlanma güvenli).
- [ ] **2.5** Sunucu-otoriteli tur süresi: `turn_deadline`; süre dolunca otomatik çözüm.

### Faz 3 — Realtime Kanal (Ably)

- [ ] **3.1** Ably hesabı + ücretsiz katman; API key'i env'e (`ABLY_API_KEY`).
- [ ] **3.2** Token auth: client Ably'ye doğrudan key'le değil, `/api/ably-token` üzerinden kısa-ömürlü token'la bağlanır (key sızmasın).
- [ ] **3.3** Her maç bir kanal: `match:<id>`. Sunucu publish eder, iki client subscribe olur.
- [ ] **3.4** Olay tipleri: `opponent_moved`, `round_revealed`, `turn_changed`, `match_ended`, `opponent_disconnected`.
- [ ] **3.5** Reconnect: client bağlantı kopunca `match.state`'i HTTP ile çeker, kanala yeniden bağlanır.

### Faz 4 — Matchmaking (eşleşme)

- [ ] **4.1** "Online oyna" → `matchmaking_queue`'ya ekle.
- [ ] **4.2** Eşleştirici: kuyrukta 2 uygun oyuncu → `match` oluştur (seed üret), ikisine de Ably ile haber ver. (MVP: ratingsiz, FIFO eşleşme.)
- [ ] **4.3** Kuyruk timeout: kimse bulunamazsa "bot ile oyna?" teklifi (mevcut bot moduna düşür — güzel fallback).
- [ ] **4.4** Eşleşme ekranı UI ("rakip aranıyor...").
- [ ] **4.5 (sonra)** Rating tabanlı eşleştirme (`user_rating`) — şema hazır, Elo hesabı eklenince devreye girer.

### Faz 5 — Bağlantı/Kopma Dayanıklılığı & Kenar Durumlar

- [ ] **5.1** Rakip kopunca: bekleme süresi → dönerse devam, dönmezse hükmen sonuç.
- [ ] **5.2** Sayfa yenileme / uygulama kapanıp açılma → `match.state`'ten devam.
- [ ] **5.3** Çift sekme / aynı kullanıcı iki cihaz: tek aktif maç kuralı.
- [ ] **5.4** Süre dolması, iki oyuncunun da kopması, sunucu hatası senaryoları.

### Faz 6 — Yük Testi & Canlıya Hazırlık

- [ ] **6.1** Eşzamanlı maç simülasyonu (örn. 100 sahte maç) — Ably/Neon/Vercel limitleri içinde mi?
- [ ] **6.2** Neon compute-saat tüketimini gözle (ücretsiz: 100 CU-saat/ay).
- [ ] **6.3** Ably mesaj sayımını gözle (ücretsiz: 6M/ay, 200 eşzamanlı bağlantı).
- [ ] **6.4** Hata izleme (Sentry vb. ücretsiz katman) + temel metrik.

### Faz 7 — Domain & Canlı

- [ ] **7.1** Vercel projesi + domain bağlama (DNS).
- [ ] **7.2** Env'ler production'da (DATABASE_URL, BETTER_AUTH_*, ABLY_API_KEY, RESEND_API_KEY).
- [ ] **7.3** `BETTER_AUTH_URL` / `NEXT_PUBLIC_APP_URL` domain'e güncelle.
- [ ] **7.4** Pilot (VS Düello online) ile soft-launch; küçük kitleyle gerçek test.

### Faz 8 — Diğer Modlara Yayma

- [ ] VS Düello şablonu kanıtlanınca Kadro / Hedefe Yaklaş / Liste Doldur'a uyarla. Çoğu altyapı (match, move, queue, Ably) mod-agnostik; mod-özel olan yalnızca reducer/scene akışı.

---

## 6. Ücretsiz Katman Bütçesi (öğrenci dostu)

| Servis | Ücretsiz limit | Yenilenme | Tuzak |
|---|---|---|---|
| **Vercel (Hobby)** | Web hosting, serverless fonksiyon | — | WebSocket tutamaz (bu yüzden Ably) |
| **Neon Postgres** | 0.5GB, 100 compute-saat/ay | Aylık | Scale-to-zero (cold start ~1sn, sorun değil) |
| **Better-Auth** | Kod (ücretsiz) | — | E-posta için Resend gerekir |
| **Resend (e-posta)** | ~3000 e-posta/ay | Aylık | Magic-link için yeterli |
| **Ably** | 6M mesaj/ay, 200 eşzamanlı bağlantı | Aylık | — |

**"200 eşzamanlı bağlantı az mı?"** Hayır. = aynı **anda** oyunda 200 kişi = ~100 eşzamanlı maç. Toplam kayıtlı kullanıcı binlerce olabilir; hepsi aynı saniyede online olmaz. Ücretsiz katman, oyun tutana kadar fazlasıyla yeter; ilk darboğaza ulaşmak "başarı" işaretidir.

**Toplam başlangıç maliyeti: 0 TL.** İlk ödeme ancak ciddi kullanıcıya ulaşınca.

---

## 7. İlk Somut Adım (öneri)

Mimariye dokunmadan en yüksek değer/risk oranı:

1. **Faz 1.1** — Magic-link auth'u uçtan uca canlı et (online'ın ön-koşulu, küçük iş).
2. **Faz 2.1–2.2** — `game-engine`'i bir API route'tan sunucuda çalıştırıp tek bir hamleyi sunucu-otoriteli doğrula (kavramı ispatla).
3. Paralelde **Faz 0.2** — `players-core.json` ayır (veri ağırlığını düşür).

Bu üçü tamamlanınca online'ın iskeleti kanıtlanmış olur; gerisi bu iskelete event/kanal/kuyruk eklemek.

---

## 8. Açık Sorular (ilerledikçe netleşecek)

- Tur süresi tam kaç saniye? (10 mu 15 mi — oyun hissine göre ayarlanır)
- ~~Rating/ELO MVP'de mi, sonra mı?~~ **Karar verildi:** şema şimdi, Elo hesabı sonra.
- Google OAuth için Google Cloud Console'da proje + OAuth consent screen kurulumu (env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`).
- Mobil: PWA mı, React Native mi? (game-engine paylaşımlı olduğu için ikisi de mümkün; ayrı karar)
- Sıralama tablosu / arkadaş daveti / özel oda? (MVP sonrası özellikler)
```
