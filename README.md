# Futbol Kart Oyunu

> Sürpriz sorularla futbolcu kartlarını karşılaştıran, hot-seat ve bota karşı oynanan bir dijital kart düellosu.

İki oyuncu kör seçimle **8'er kart** seçer, moderatör 30 farklı şablondan rastgele bir soru sorar (forma numarası toplamı, doğum yeri ekvatora yakınlığı, kariyer toplam golü vb.), oyuncular ellerinden birer kart sürer, istatistik karşılaştırılır, kazanan o turu alır. **7 tur**, eşitlikte uzatma (4 kart × 3 tur), eşitlik sürerse penaltı atışı (1 kart × 1 soru).

---

## Durum

**Aktif geliştirme — MVP-hazır iskelet.** Oyun mantığı tamamen çalışır durumda, sahne arka planları ve atmosfer cilası tamamlandı, backend altyapısı (auth + DB + maç paylaşma) hazır ama Neon/Resend bağlanmamış.

### Tamamlananlar

- ✅ **Oyun motoru** — Saf TypeScript, event-sourced reducer, seedable PRNG. Hot-seat + vs-bot.
- ✅ **Veri katmanı** — 50 oyuncu, 47 kulüp, 30 soru şablonu. Manuel seed + Zod validation.
- ✅ **Soru çözücü** — 30 şablonun her biri için resolver + tiebreaker zinciri + Vitest fixture testleri.
- ✅ **Uzatma + sudden death** — Eşitlikte otomatik faz geçişi.
- ✅ **Frontend** — Next.js 14 App Router, tek route'lu sahne shell (mode → pick → handoff → round → final), Framer Motion animasyonlar, Zustand + sessionStorage persistence, next-intl (TR).
- ✅ **Atmosfer cilası** — Saha temalı arka plan (PitchBackground), 6 sahne için AI üretimli arka plan görselleri, hero Ken Burns + altın partiküller, broadcast tarzı skorboard, sahne içi cross-fade.
- ✅ **Kart tasarımı** — Pozisyon bazlı renk teması (GK mor / SAV mavi / ORT sarı / FOR kırmızı), holo conic gradient + shine band hover, 3D mouse tilt, monogram + ülke bayrağı emoji.
- ✅ **Final ekranı** — Gold/slate semantik (kırmızı/mavi kalktı), data-driven skor barı (kazanan baskın), count-up reveal, ŞAMPİYON başlığı, glass paneller transparan.
- ✅ **Backend iskeleti** — Drizzle ORM + Neon Postgres + Better-Auth (magic-link) + Resend mail. API routes (`POST /api/games`, `GET /api/games/[shareId]`). Paylaşılabilir maç sayfası (`/mac/[shareId]`).
- ✅ **Performans** — Görseller WebP (-%88 boyut), kritik sahnelerin preload'u, sayfa geçişleri 200ms.

### Tamamlanmamış

- ⏳ **Vercel deploy** — kod hazır, henüz publish edilmedi.
- ⏳ **Domain bağlama** — bir alan adı satın alınıp bağlanacak.
- ⏳ **Gerçek oyuncu fotoğrafları / illüstrasyonlar** — şu an monogram fallback.
- ⏳ **Online multiplayer** — yol haritası dışı, hot-seat + bot ile sınırlı.
- ⏳ **Lisans / KVKK metni** — yayın öncesi.
- ⏳ **Ses katmanı** — kart flip, kalabalık, score hit (sonraki tur).

---

## Stack

| Katman | Teknoloji |
|---|---|
| Frontend | Next.js 14 (App Router) + TypeScript + Tailwind CSS |
| State | Zustand (event-sourced session machine + sessionStorage persist) |
| Animasyon | Framer Motion |
| i18n | next-intl (TR, çoğul dile genişlemeye hazır) |
| DB | Neon Postgres (serverless) + Drizzle ORM |
| Auth | Better-Auth (magic-link / şifresiz email) |
| Mail | Resend |
| Hosting | Vercel (önerilen) — Cloudflare Pages alternatifi mümkün |
| Workspace | pnpm workspaces |

---

## Proje yapısı

```
futbol-kart/
├── apps/
│   └── web/                       Next.js uygulaması
│       ├── src/
│       │   ├── app/               App Router (page, layout, api)
│       │   ├── components/        UI bileşenleri (kart, sahneler, hero, vb.)
│       │   └── lib/               Store, session machine, gameFlow, data
│       ├── messages/tr.json       i18n metinleri
│       └── public/
│           ├── data/              players.json, clubs.json (build çıktısı)
│           └── hero/              Optimize edilmiş WebP arka planlar
├── packages/
│   ├── shared-types/              Player, Club, Question, GameState tipleri
│   ├── game-engine/               Saf TS reducer + PRNG + bot
│   ├── question-templates/        30 şablon JSON + resolver + Vitest
│   └── db/                        Drizzle schema + Neon client + migration
├── data-pipeline/                 Seed JSON + corrections.csv + build script
├── scripts/
│   └── optimize-hero-images.mjs   PNG → WebP optimizasyon scripti
├── PLAN.md                        Karar günlüğü ve yol haritası
├── .env.example                   Env vars şablonu
└── package.json                   pnpm workspace root
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

**Sadece hot-seat / bot oynamak için** auth ve DB gerekmez; uygulama bu env'ler boş olsa da çalışır. Sadece `/giris`, `/mac/[shareId]` sayfaları ve "Maçı paylaş" butonu DB ister.

### 3. Veritabanı kurulumu (auth + paylaş için)

```bash
# Schema migration üret
pnpm --filter @futbol-kart/db generate

# Migration'ı uygula
pnpm --filter @futbol-kart/db migrate
```

### 4. Oyuncu verisini hazırla

```bash
pnpm --filter @futbol-kart/data-pipeline build
```

`apps/web/public/data/players.json` ve `clubs.json` üretilir (50 oyuncu, 47 kulüp).

### 5. Çalıştır

```bash
pnpm dev
```

http://localhost:3000

---

## Komutlar

```bash
# Dev
pnpm dev                                          # Next.js dev server

# Production
pnpm build                                        # Tüm paketler + Next.js build
pnpm --filter @futbol-kart/web start             # Production preview

# Kalite
pnpm -r typecheck                                # Tüm paketlerde tsc --noEmit
pnpm --filter @futbol-kart/question-templates test  # Resolver Vitest testleri

# DB
pnpm --filter @futbol-kart/db generate           # Drizzle migration SQL üret
pnpm --filter @futbol-kart/db migrate            # Uygula (Neon'a)
pnpm --filter @futbol-kart/db studio             # Drizzle Studio (browser DB explorer)

# Veri
pnpm --filter @futbol-kart/data-pipeline build   # players.json üret
pnpm --filter @futbol-kart/data-pipeline report  # Şablon coverage raporu

# Görsel optimizasyonu
node scripts/optimize-hero-images.mjs            # public/hero/*.png → *.webp + *.jpg
```

---

## Vercel'e deploy

1. **Neon Postgres hesabı aç** — https://console.neon.tech
   - Free tier, kredi kartı gerektirmez
   - Region: `aws-eu-central-1` (Türkiye'ye yakın)
   - "Pooled connection" string'i kopyala

2. **Resend hesabı aç** — https://resend.com
   - Free tier 3000 mail/ay, kart yok
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
4. **8 kart seç** → "Maçı Başlat"
5. **7 tur oyna**:
   - Round intro stinger (~750ms)
   - Soru reveal
   - P1 kart oyna → (vs-bot: bot ~600ms düşünür) → P2 kart oyna
   - 3D flip + count-up + winner badge (~1450ms)
6. **Eşitlikte uzatma** (4 kart × 3 tur), eşitlik sürerse **penaltı** (1 kart × 1 soru)
7. **Final ekranı** — ŞAMPİYON başlığı, gold/slate skor barı, "Tur detaylarını göster" collapsible
8. **Maçı paylaş** (DB bağlıysa) → `/mac/<shareId>` linkini paylaş

---

## Lisans

Henüz lisanslanmadı. MVP / fikir doğrulama aşamasında.
