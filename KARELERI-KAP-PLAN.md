# "Kareleri Kap" Modu — Geliştirme Planı

> **Durum:** Tasarım / onay aşaması. Henüz kod yazılmadı.
> **Kural:** Mevcut 4 modun dosyalarına DOKUNULMAZ (sadece pattern okundu). Önce offline, sonra online.
> **Commit/push:** Kullanıcıda.

---

## 1. Mod kimliği

| | Değer |
|---|---|
| **İsim** | Kareleri Kap |
| **Route** | `/kareleri-kap/[gameId]` |
| **match.mode** | `'kareler'` |
| **Kardeş modlar** | Zincir Kur (B, sonra) · Ortak Kulüp (C, en son, eşzamanlı) |

## 2. Mekanik (kullanıcı kararları)

- **N×N kulüp matrisi** (5×5 başlangıç) — her hücre bir kulüp (logo + ad).
- Oyuncu bir **futbolcu ismi** yazar (autocomplete, havuzdan seçer — serbest metin değil).
- Sistem o futbolcunun matristeki kulüp hücrelerini bulur → **bitişik (4-yön: ↑↓←→) en büyük grubu** otomatik işaretler. **Kullanıcıya kulüp seçtirilmez** (UX kararı).
- O grubun büyüklüğü kadar **puan** + o kareler "kapanır" (o tarafın rengiyle).
- **Çeşitlilik kritik:** her tur farklı matris (kürasyonlu rastgele üretim — modun kalbi).

### Netleşen kurallar (kullanıcı kararı)
- **Matris boyutu: 5×5 SABİT** (25 kare).
- **Çalma YOK (MVP):** bir taraf kareyi kapatınca kilitlenir, rakip alamaz. Rakibin zinciri o kareyi atlayamaz (bitişiklik kırılır). → *V2 fikri: çalma mekaniği (bkz. §8).*
- **Kazanma: en çok kare + CAN sistemli** (Liste Doldur mantığı): sırayla tahmin, her tarafa 3 can (yanlış/pas can götürür), iki tarafın canı bitince VEYA matris dolunca en çok kare kapatan kazanır. Eşitlikte tie.
- **Bir oyuncunun matriste birden çok ayrık grubu varsa:** sadece EN BÜYÜK tek grup kapanır (kullanıcı: "en fazla kaça denk geliyorsa").

## 3. Çekirdek mühendislik — kürasyonlu matris üretimi (modun %70'i)

Saf rastgele dizilim → çözülemeyen/sıkıcı turlar. Algoritma (saf mantık, test edilebilir):

```
generateMatrix(seed, N):
  1. Havuzdan N×N kulüp seç:
     - clubPool.json (75 kulüp) kaynak
     - ÜLKE-TAVANLI: tek ülkeden max ~K kulüp (Türk-ağırlık dengesi — KRİTİK)
     - global yıldız kulüpleri (Barça/Real/Bayern/Milan...) öncelikli dahil
  2. Izgaraya yerleştir (seed'li PRNG)
  3. ÇÖZÜLEBİLİRLİK SKORU:
     - havuzdaki her oyuncu için: matristeki kulüplerini işaretle → BFS → en büyük bitişik grup
     - skor = kaç oyuncu ≥K'lık bitişik zincir kurabiliyor + max zincir uzunluğu
  4. Skor düşükse (ör. hiç ≥4 zincir yok) → AT, yeniden üret (rejection sampling)
  5. Yeterli matris bulunca döndür (stabil: aynı seed → aynı matris → online'da adalet)
```

**Veri gerçeği (ÖLÇÜLDÜ):**
- Havuzda 3+ kulüplü 1770 oyuncu, 4+ kulüplü 823. Eto'o 9 kulüple şampiyon.
- ⚠️ Türk-ağırlık: FB/GS/TS/BJK havuz zirvesinde + FB×GS 41 ortak (hepsi Türk). Kürasyon dengelemezse matris Türk-oyuncu cevaplı sıkıcı olur.

## 4. BFS / bitişik grup (saf mantık, düşük risk)

`largestAdjacentGroup(player, matrix)`:
- Oyuncunun `clubs[].clubId` → matriste hangi hücrelerde? → işaretle
- 4-yön flood-fill → bağlı bileşenler → en büyüğünü döndür (hücre listesi + boyut)
- Standart, küçük matris (≤7×7), saf fonksiyon, unit-testlenebilir.

## 5. Mimari katmanlar (pattern: Liste Doldur kardeşi)

| Katman | Dosya (YENİ) | Pattern kaynağı (sadece okundu) |
|---|---|---|
| Saf mantık | `apps/web/src/lib/squaresMode.ts` | `listMode.ts` |
| Sahneler | `components/scenes/Squares*Scene.tsx` (Reveal/Play/Result) | `List*Scene.tsx` |
| Sayfa (offline+online) | `app/kareleri-kap/[gameId]/page.tsx` | `liste-doldur/[gameId]/page.tsx` |
| Online motor | `lib/server/squaresMatchEngine.ts` | `listMatchEngine.ts` |
| Online uç | `app/api/match/[matchId]/squares-move/route.ts` | `list-move/route.ts` |
| Online köprü | `lib/useOnlineSquaresMatch.ts` | `useOnlineListMatch.ts` |

**Veri:** `clubPool.json` (havuz) + `clubs.json` (logo/renk lookup) + `players[].clubs[]` (eşleştirme). Hepsi hazır, ek çekim YOK.

**Spoiler koruması (online):** Matris açık (kulüpler görünür) ama "hangi oyuncu hangi zinciri açar" cevap havuzu sunucuda. Liste'nin gizli-cevap deseni uyar.

## 6. Aşamalar (önce offline)

1. **Saf mantık** (`squaresMode.ts`): matris üretimi + BFS + puanlama + bot. **+ Vitest** (çözülebilirlik garantisi, BFS doğruluğu).
2. **Offline UI**: matris bileşeni + tahmin (PlayerSearchBar) + reveal/play/result sahneleri + bota karşı.
3. **Arkadaşa karşı (offline hot-seat)**: sıra-tabanlı.
4. **Online**: sunucu motoru + uç + köprü + sayfa `?online=1` dalı (sıra-tabanlı, eşzamanlılık YOK).

Her aşama sonunda typecheck + build temiz; kullanıcı commit/push eder.

## 7. Kalan küçük kararlar (ilerledikçe)
- Tahmin süresi (offline/online sn) — Liste'den uyarlanır.
- Bot zorluğu (kaç kareyi "bilir") — listMode `botKnownRanks` mantığı uyarlanır.
- "Kapanan kare bitişikliği kırar" kuralının matris üretim çözülebilirlik skoruna etkisi (üretim aşamasında ayarlanır).

## 8. Gelecek planı — V2 fikirleri (bu modda)
- **Kare çalma:** Rakip, senin kapattığın kareyi içeren daha büyük bir zincir kurarsa kareyi çalar (renk değişir). MVP'de YOK; v2'de rekabeti artırır. Puanlama + bitişiklik yeniden hesabı gerekir.
- Zorluk seçilebilir matris boyutu (4×4 / 6×6).
