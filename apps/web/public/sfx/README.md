# Ses efektleri (SFX)

Bu klasöre 4 kısa `.mp3` dosyası koyun. Ses varsayılan **kapalı**;
kullanıcı header'daki 🔊 düğmesiyle açar. Dosya yoksa oyun sessizce çalışır
(akış bozulmaz) — yani uygulamayı bozmadan sonradan ekleyebilirsiniz.

| Dosya | Olay | Hedef |
|---|---|---|
| `card-flip.mp3` | Kart açılışı (ROUND_REVEAL) | ~250ms, kuru whoosh |
| `round-win.mp3` | Tur kazanma (ROUND_RESULT) | ~700ms, ding + kısa tribün |
| `round-tie.mp3` | Tur beraberlik | ~150ms, nötr tık |
| `final-fanfare.mp3` | Maç sonu (FINAL) | ~2s, kısa görkemli fanfar |

Tüm dosyalar küçük olmalı (≤~30kb). Ses seviyeleri kodda ayarlı
(`apps/web/src/lib/useSfx.ts` → `SFX_VOLUME`).

## Üretim promptları (ElevenLabs SFX / benzeri)

```
card-flip:     Short, crisp paper/card whoosh swipe, premium UI sound,
               ~250ms, dry, no reverb, subtle high-frequency air.

round-win:     A bright confident 'point scored' chime — single warm bell
               ding with a quick rising sparkle — layered with a SHORT
               muffled stadium crowd swell that fades fast. ~700ms total.
               Sports broadcast feel, not childish, not arcade-y.

round-tie:     Neutral soft wooden tick / muted thud, ~150ms, no melody.

final-fanfare: A short triumphant orchestral-brass sting, modern cinematic
               sports trophy moment, ~2 seconds, rising then resolving, with
               a distant crowd roar underneath. Epic but tasteful. Ends clean.
```
