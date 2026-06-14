'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { nanoid } from 'nanoid';
import { motion } from 'framer-motion';
import { useSession } from '@/lib/authClient';
import { useSfx } from '@/lib/useSfx';
import { BallLoader } from '@/components/BallLoader';
import { cn } from '@/lib/cn';

type Phase =
  | 'checking-auth'
  | 'choose' // online'a girince: rastgele mi, arkadaş davet mi?
  | 'searching'
  | 'inviting' // davet eden: link paylaşıldı, arkadaş bekleniyor
  | 'found'
  | 'invite-expired' // davete katılan: davet yok/süresi dolmuş
  | 'error';

/**
 * Online oynanabilen modlar + her birinin eşleşince gidilecek oyun route'u.
 * Mod-özel kuyruk: matchmaking_queue `mode` ile filtreler → yalnız aynı modu
 * bekleyenler eşleşir. Yeni mod buraya + ONLINE_MODES (matchmaking.ts) eklenir.
 */
const MODE_ROUTES: Record<string, (matchId: string) => string> = {
  'vs-duello': (id) => `/oyna/${id}?online=1`,
  hedef: (id) => `/hedefe-yaklas/${id}?online=1`,
  kadro: (id) => `/kadro/${id}?online=1`,
  liste: (id) => `/liste-doldur/${id}?online=1`,
  kareler: (id) => `/kareleri-kap/${id}?online=1`,
  zincir: (id) => `/zincir/${id}?online=1`,
  ortak: (id) => `/ortak-bul/${id}?online=1`,
  kariyer: (id) => `/kariyer/${id}?online=1`,
  kiyas: (id) => `/4lu-kiyas/${id}?online=1`,
  imposter: (id) => `/imposter/${id}?online=1`,
};
/** Bilinmeyen/eksik mod → VS Düello (geri uyumluluk). */
const DEFAULT_MODE = 'vs-duello';
/** Bekleme yoklaması aralığı (ms). */
const POLL_MS = 2000;
/** "Rakip bulundu" ekranının gösterim süresi (ms) — sonra maça geçilir. */
const FOUND_SHOW_MS = 4000;

interface FoundInfo {
  matchId: string;
  p1Name: string;
  p2Name: string;
  yourSide: 'P1' | 'P2';
  /** LOBİ modu (imposter): N oyuncu adı (varsa 2-kart yerine N-kart gösterilir). */
  playerNames?: string[];
  /** LOBİ modu: bu kullanıcının index'i (SEN rozeti için). */
  yourIndex?: number;
}

/**
 * Online eşleşme akışı. İKİ giriş şekli:
 *
 *  A) Normal (mod seçiminden): `joinCode` YOK. Giriş kontrolünden sonra SEÇİM
 *     ekranı (`choose`) gösterilir — rastgele rakip mi, arkadaş davet mi?
 *       • Rastgele → kuyruğa gir, eşleşene kadar bekle + yokla.
 *       • Davet et → component bir kod üretir, `inviting` ekranı (link + bekleme).
 *
 *  B) Davet linkinden (`/davet/<kod>`): `joinCode` DOLU gelir. Seçim atlanır,
 *     doğrudan o kodla davete KATILMA denenir (giriş yoksa returnTo ile /giris).
 *
 * EŞLEŞİNCE: "Rakip bulundu" ekranı ~4sn → maça geç (mod-özel route).
 */
export function OnlineMatchmaking({
  onCancel,
  mode = DEFAULT_MODE,
  joinCode,
}: {
  onCancel: () => void;
  /** Hangi modda eşleşilecek (vs-duello | hedef | …). Varsayılan vs-duello. */
  mode?: string;
  /** Davet linkinden gelindiyse (/davet/<kod>) o kod. Verilirse direkt katılma. */
  joinCode?: string;
}) {
  const router = useRouter();
  const { data: sessionData, isPending } = useSession();
  const [phase, setPhase] = useState<Phase>('checking-auth');
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<FoundInfo | null>(null);
  // Davet eden "Arkadaşını davet et" seçince üretilen kod (component-içi → URL
  // navigasyonu/remount derdi yok). joinCode (linkten gelen) bundan ayrı.
  const [myInviteCode, setMyInviteCode] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const handledRef = useRef(false); // eşleşme bir kez işlensin
  // Giriş kontrolü + ilk faz kararı YALNIZ BİR KEZ verilsin. Better-Auth periyodik
  // session refresh'i `sessionData` referansını tazeleyince giriş-kontrolü effect'i
  // yeniden çalışıp phase'i 'choose'a SIFIRLIYORDU → kullanıcı 'searching'/'inviting'
  // iken seçim ekranına geri atılıyor, polling duruyor, eşleşmeyi kaçırıyordu (bug).
  const initDoneRef = useRef(false);

  // Geçersiz mod gelirse VS Düello'ya düş (route haritasında yoksa).
  const safeMode = MODE_ROUTES[mode] ? mode : DEFAULT_MODE;
  const routeFor = MODE_ROUTES[safeMode]!;

  // Eşleşme bulununca: maç bilgisini çek, "rakip bulundu" göster, sonra git.
  const onMatched = useCallback(
    async (matchId: string) => {
      if (handledRef.current) return;
      handledRef.current = true;
      if (pollRef.current) clearInterval(pollRef.current);
      try {
        const res = await fetch(`/api/match/${matchId}`);
        const data = await res.json();
        // İsim kaynağı moda göre değişir: çoğu mod `state`, Kariyer/İmposter maskeli
        // `view` döner. İkisine de bak (hangisi doluysa) → "Oyuncu 1/2" fallback'i
        // yalnız gerçekten isim yoksa görünür.
        const named = data.state ?? data.view ?? {};
        // LOBİ modu (imposter): view.playerNames[] + sayısal yourSide → N-kart.
        const playerNames: string[] | undefined = Array.isArray(named.playerNames)
          ? named.playerNames
          : undefined;
        setFound({
          matchId,
          p1Name: named.p1Name || playerNames?.[0] || 'Oyuncu 1',
          p2Name: named.p2Name || playerNames?.[1] || 'Oyuncu 2',
          yourSide: typeof data.yourSide === 'number' ? 'P1' : (data.yourSide ?? 'P1'),
          playerNames,
          yourIndex: typeof data.yourSide === 'number' ? data.yourSide : undefined,
        });
        setPhase('found');
      } catch {
        // Bilgi çekilemese de maça geç (sade).
        router.push(routeFor(matchId));
      }
    },
    [router, routeFor],
  );

  // "Rakip bulundu" gösterildikten sonra maça geç (mod-özel route).
  useEffect(() => {
    if (phase !== 'found' || !found) return;
    const t = setTimeout(() => {
      router.push(routeFor(found.matchId));
    }, FOUND_SHOW_MS);
    return () => clearTimeout(t);
  }, [phase, found, router, routeFor]);

  // Rastgele eşleşmeyi başlat (kullanıcı "Rastgele rakip" seçti).
  const startRandom = useCallback(async () => {
    setPhase('searching');
    try {
      const res = await fetch('/api/matchmaking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: safeMode }),
      });
      if (!res.ok) throw new Error('Eşleşme başlatılamadı.');
      const data = await res.json();
      if (data.matched && data.matchId) {
        void onMatched(data.matchId);
      }
      // matched değilse zaten 'searching' fazında → polling devralır.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bir hata oluştu.');
      setPhase('error');
    }
  }, [safeMode, onMatched]);

  // Davet aç (kullanıcı "Arkadaşını davet et" seçti): kod üret + kuyruğa kodla gir.
  const startInvite = useCallback(async () => {
    const code = generateClientInviteCode();
    setMyInviteCode(code);
    setPhase('inviting');
    try {
      const res = await fetch('/api/matchmaking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: safeMode, action: 'create', inviteCode: code }),
      });
      if (!res.ok) throw new Error('Davet oluşturulamadı.');
      const data = await res.json();
      if (data.matched && data.matchId) {
        void onMatched(data.matchId);
      }
      // matched değilse 'inviting' fazında → link gösterilir, polling devralır.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bir hata oluştu.');
      setPhase('error');
    }
  }, [safeMode, onMatched]);

  // 1) Giriş kontrolü → seçim ekranı (normal) VEYA davete katılma (link).
  //    YALNIZ BİR KEZ çalışır (initDoneRef): sonraki session-refresh'ler phase'i
  //    sıfırlamasın (yoksa searching/inviting iken choose'a düşer — bkz. initDoneRef).
  useEffect(() => {
    if (isPending) return;
    if (initDoneRef.current) return;
    if (!sessionData?.user) {
      // Giriş/kayıt sonrası kullanıcı buraya geri dönsün: bulunduğu sayfayı
      // (mod seçimi + ?mode=… veya /davet/<kod>) returnTo ile taşı.
      const here =
        typeof window !== 'undefined'
          ? window.location.pathname + window.location.search
          : '/online';
      router.push(`/giris?returnTo=${encodeURIComponent(here)}`);
      return;
    }

    // Buradan sonrası (davet katılımı / choose) yalnız bir kez kararlaştırılır.
    initDoneRef.current = true;

    // Davet linkinden gelindiyse: seçim YOK, doğrudan o kodla katılmayı dene.
    if (joinCode) {
      let cancelled = false;
      (async () => {
        try {
          const res = await fetch('/api/matchmaking', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mode: safeMode,
              action: 'join',
              inviteCode: joinCode,
            }),
          });
          if (!res.ok) throw new Error('Davete katılınamadı.');
          const data = await res.json();
          if (cancelled) return;
          if (data.matched && data.matchId) {
            void onMatched(data.matchId);
          } else {
            // Davet yok/süresi dolmuş/yanlış kod.
            setPhase('invite-expired');
          }
        } catch (e) {
          if (!cancelled) {
            setError(e instanceof Error ? e.message : 'Bir hata oluştu.');
            setPhase('error');
          }
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    // Normal giriş: kullanıcıya seçim sun (rastgele / davet).
    setPhase('choose');
  }, [isPending, sessionData, router, onMatched, joinCode, safeMode]);

  // 2) Bekleme: kısa aralıklarla yokla (rakip bizi kapmış / arkadaş davete
  //    katılmış olabilir). Hem rastgele (searching) hem davet eden (inviting)
  //    için aynı yoklama — ikisi de "bana maç kuruldu mu?" diye bakar.
  useEffect(() => {
    if (phase !== 'searching' && phase !== 'inviting') return;
    pollRef.current = setInterval(async () => {
      try {
        // MOD-ÖZEL yokla: yalnız bu modda aktif maça yönlen (başka moddaki eski
        // maç bu eşleşmeye karışmasın).
        const res = await fetch(`/api/matchmaking?mode=${encodeURIComponent(safeMode)}`, {
          method: 'GET',
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.matched && data.matchId) {
          void onMatched(data.matchId);
        }
      } catch {
        // geçici hata — bir sonraki yoklamada tekrar
      }
    }, POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [phase, onMatched, safeMode]);

  const handleCancel = useCallback(async () => {
    if (pollRef.current) clearInterval(pollRef.current);
    try {
      await fetch('/api/matchmaking', { method: 'DELETE' });
    } catch {
      // sessizce geç
    }
    onCancel();
  }, [onCancel]);

  if (phase === 'error') {
    return (
      <section className="flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center">
        <h2 className="text-2xl font-black text-side-red">Eşleşme hatası</h2>
        <p className="text-sm text-white/65">{error}</p>
        <button type="button" onClick={handleCancel} className="btn-ghost">
          Geri dön
        </button>
      </section>
    );
  }

  if (phase === 'found' && found) {
    return <MatchFound found={found} />;
  }

  if (phase === 'invite-expired') {
    return (
      <section className="flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center">
        <h2 className="text-2xl font-black text-accent-goldHi">
          Davet bulunamadı
        </h2>
        <p className="max-w-sm text-sm text-white/65">
          Bu davetin süresi dolmuş ya da iptal edilmiş olabilir. Arkadaşından
          yeni bir davet linki iste — ya da rastgele bir rakiple oyna.
        </p>
        <button type="button" onClick={handleCancel} className="btn-ghost">
          Geri dön
        </button>
      </section>
    );
  }

  // Seçim ekranı: rastgele rakip mi, arkadaş davet mi?
  if (phase === 'choose') {
    return (
      <ChooseScreen
        onRandom={startRandom}
        onInvite={startInvite}
        onCancel={onCancel}
      />
    );
  }

  if (phase === 'inviting' && myInviteCode) {
    return (
      <InvitingScreen
        code={myInviteCode}
        mode={safeMode}
        onCancel={handleCancel}
      />
    );
  }

  // searching (ve diğer yükleme anları)
  return (
    <section className="flex min-h-[60vh] flex-col items-center justify-center gap-8 text-center">
      <BallLoader
        size={64}
        label="Rakip aranıyor…"
        sub="Seninle eşleşecek bir oyuncu bekleniyor. Bu birkaç saniye sürebilir."
      />
      <button type="button" onClick={handleCancel} className="btn-ghost">
        Vazgeç
      </button>
    </section>
  );
}

/**
 * Online'a girince ilk ekran: iki büyük seçim kartı.
 *  - Rastgele rakip: kuyruğa girer, kim çıkarsa onunla eşleşir.
 *  - Arkadaşını davet et: paylaşılabilir link üretir, sadece o arkadaşla eşleşir.
 */
function ChooseScreen({
  onRandom,
  onInvite,
  onCancel,
}: {
  onRandom: () => void;
  onInvite: () => void;
  onCancel: () => void;
}) {
  return (
    <section className="flex min-h-[70vh] flex-col items-center justify-center gap-8 text-center">
      <motion.h2
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-2xl font-black text-white sm:text-3xl"
      >
        Nasıl oynamak istersin?
      </motion.h2>

      <div className="grid w-full max-w-md grid-cols-1 gap-4 sm:grid-cols-2">
        <ChoiceCard
          emoji="🎲"
          title="Rastgele rakip"
          sub="Çevrimiçi birini bul, hemen eşleş"
          onClick={onRandom}
          delay={0.05}
        />
        <ChoiceCard
          emoji="🔗"
          title="Arkadaşını davet et"
          sub="Link gönder, birlikte oynayın"
          onClick={onInvite}
          delay={0.12}
        />
      </div>

      <button type="button" onClick={onCancel} className="btn-ghost">
        Geri dön
      </button>
    </section>
  );
}

function ChoiceCard({
  emoji,
  title,
  sub,
  onClick,
  delay,
}: {
  emoji: string;
  title: string;
  sub: string;
  onClick: () => void;
  delay: number;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, type: 'spring', stiffness: 260, damping: 22 }}
      whileHover={{ y: -4, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={cn(
        'glass-panel-strong flex flex-col items-center gap-2 rounded-2xl p-6',
        'border border-white/10 transition hover:border-accent-gold/50',
      )}
    >
      <span className="text-4xl">{emoji}</span>
      <span className="text-base font-black text-white">{title}</span>
      <span className="text-xs text-white/55">{sub}</span>
    </motion.button>
  );
}

/** Client tarafı davet kodu (URL-güvenli, 10 karakter). Sunucu kodu doğrular. */
function generateClientInviteCode(): string {
  return nanoid(10);
}

/**
 * Davet eden bekleme ekranı: paylaşılabilir link + kopyala/paylaş + "arkadaşın
 * bekleniyor". Arkadaş katılınca üst component polling'de maçı görüp geçiş yapar.
 */
function InvitingScreen({
  code,
  mode,
  onCancel,
}: {
  code: string;
  mode: string;
  onCancel: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const link =
    typeof window !== 'undefined'
      ? `${window.location.origin}/davet/${code}?mode=${encodeURIComponent(mode)}`
      : '';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard yoksa kullanıcı input'tan elle seçer
    }
  };

  const share = async () => {
    // Web Share API (mobil) — yoksa kopyalamaya düş.
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: 'DerbyGoal — birlikte oynayalım',
          text: 'Beni DerbyGoal maçına davet ediyorsun! Linke tıkla:',
          url: link,
        });
        return;
      } catch {
        // kullanıcı paylaşımı iptal etti / desteklenmiyor → kopyalamaya düş
      }
    }
    void copy();
  };

  return (
    <section className="flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center">
      <div className="flex flex-col items-center gap-3">
        <BallLoader size={52} label="Arkadaşın bekleniyor…" />
        <p className="max-w-sm text-sm text-white/65">
          Aşağıdaki linki arkadaşına gönder. Linke tıklayıp giriş yapınca
          otomatik olarak eşleşeceksiniz.
        </p>
      </div>

      {/* Link kutusu — belirgin bir panel: link + yanında kopyala butonu. */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel-strong w-full max-w-md rounded-2xl p-4"
      >
        <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
          Davet linkin
        </span>
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={link}
            onClick={(e) => (e.target as HTMLInputElement).select()}
            className={cn(
              'flex-1 rounded-xl border border-white/10 bg-black/40 px-3 py-2.5',
              'text-xs text-white/90 outline-none focus:border-accent-gold/60',
            )}
          />
          <button
            type="button"
            onClick={copy}
            className={cn(
              'shrink-0 rounded-xl px-4 py-2.5 text-xs font-bold transition',
              copied
                ? 'bg-emerald-500/25 text-emerald-300 ring-1 ring-emerald-400/40'
                : 'bg-accent-gold/20 text-accent-goldHi ring-1 ring-accent-gold/40 hover:bg-accent-gold/30',
            )}
          >
            {copied ? 'Kopyalandı ✓' : 'Kopyala'}
          </button>
        </div>
        <button
          type="button"
          onClick={share}
          className="btn-primary mt-3 w-full justify-center"
        >
          Paylaş
        </button>
      </motion.div>

      <p className="text-xs text-white/40">
        Davet ~15 dakika geçerli. Kullanılmazsa otomatik kapanır.
      </p>

      <button type="button" onClick={onCancel} className="btn-ghost">
        Vazgeç
      </button>
    </section>
  );
}

/**
 * "Rakip bulundu" ekranı — iki oyuncu yan yana (P1 sol/kırmızı, P2 sağ/mavi),
 * üzerinde ad/mail. "SEN" rozeti kendi tarafında. VS ortada. 3.5sn sonra maça geçer.
 */
function MatchFound({ found }: { found: FoundInfo }) {
  const playSfx = useSfx();

  // "Rakip bulundu" anı — ekran görünür görünmez bir kez (VS girişini taçlandırır).
  useEffect(() => {
    playSfx('matchFound');
  }, [playSfx]);

  // LOBİ modu (imposter): N oyuncu → N-kart tek satır, aralarına "vs".
  const isLobby = Array.isArray(found.playerNames) && found.playerNames.length > 2;

  return (
    <section className="flex min-h-[70vh] flex-col items-center justify-center gap-10">
      <motion.h2
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-3xl font-black text-accent-goldHi sm:text-4xl"
      >
        {isLobby ? 'Lobi dolu! 🕵️' : 'Rakip bulundu! 🎯'}
      </motion.h2>

      {isLobby ? (
        <div className="flex w-full max-w-5xl items-center justify-center gap-2 px-2 sm:gap-3">
          {found.playerNames!.map((nm, i) => (
            <div key={i} className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
              <LobbyUserCard
                name={nm || `Oyuncu ${i + 1}`}
                colorIndex={i}
                isYou={found.yourIndex === i}
                count={found.playerNames!.length}
                delay={0.08 * i}
              />
              {i < found.playerNames!.length - 1 && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.4 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2 + 0.05 * i, type: 'spring', stiffness: 300, damping: 18 }}
                  className="shrink-0 text-base font-black text-white/80 drop-shadow sm:text-xl"
                >
                  vs
                </motion.span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-4 sm:gap-10">
          <UserCard name={found.p1Name} side="P1" isYou={found.yourSide === 'P1'} delay={0.1} />
          <motion.div
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3, type: 'spring', stiffness: 300, damping: 18 }}
            className="flex flex-col items-center"
          >
            <span className="text-4xl font-black text-white drop-shadow-[0_2px_12px_rgba(255,215,107,0.5)] sm:text-5xl">
              VS
            </span>
          </motion.div>
          <UserCard name={found.p2Name} side="P2" isYou={found.yourSide === 'P2'} delay={0.18} />
        </div>
      )}

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="text-sm font-semibold text-white/55"
      >
        {isLobby ? 'Oyun başlıyor…' : 'Maç başlıyor…'}
      </motion.p>
    </section>
  );
}

/** Lobi (imposter) için N-kart — UserCard'ın renk-paletli, otomatik-küçülen sürümü. */
const LOBBY_COLORS = [
  { glow: 'rgba(220,38,38,0.5)', grad: 'from-side-red/90 via-side-red/40' },
  { glow: 'rgba(37,99,235,0.5)', grad: 'from-side-blue/90 via-side-blue/40' },
  { glow: 'rgba(16,185,129,0.5)', grad: 'from-emerald-500/90 via-emerald-500/40' },
  { glow: 'rgba(245,158,11,0.5)', grad: 'from-amber-500/90 via-amber-500/40' },
  { glow: 'rgba(168,85,247,0.5)', grad: 'from-purple-500/90 via-purple-500/40' },
];

function LobbyUserCard({
  name,
  colorIndex,
  isYou,
  count,
  delay,
}: {
  name: string;
  colorIndex: number;
  isYou: boolean;
  count: number;
  delay: number;
}) {
  const c = LOBBY_COLORS[colorIndex % LOBBY_COLORS.length]!;
  const initial = name.charAt(0).toUpperCase();
  // 3-4 kart geniş, 5 kart biraz dar → her zaman tek satır.
  const widthCls = count >= 5 ? 'max-w-[112px]' : 'max-w-[150px]';

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.85 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, type: 'spring', stiffness: 240, damping: 20 }}
      className={cn('group relative aspect-[2/3] min-w-0 flex-1 select-none', widthCls)}
    >
      {isYou && (
        <span className="absolute -top-2.5 left-1/2 z-40 -translate-x-1/2 rounded-full bg-accent-gold px-3 py-0.5 text-[10px] font-black tracking-wide text-[#1f1500] shadow-lg">
          SEN
        </span>
      )}
      <div
        className="relative flex h-full w-full flex-col overflow-hidden rounded-xl shadow-card"
        style={{ boxShadow: `0 0 24px -6px ${c.glow}` }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-900 to-zinc-950" />
        <div className={`absolute inset-x-0 top-0 h-[62%] bg-gradient-to-b ${c.grad} to-transparent`} />
        <div className="relative z-20 flex flex-1 items-center justify-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-2xl font-black text-zinc-900 shadow-lg sm:h-14 sm:w-14">
            {initial}
          </span>
        </div>
        <div className="relative z-20 border-t border-white/10 bg-black/45 px-1.5 py-2 text-center backdrop-blur-sm">
          <div className="truncate text-xs font-bold text-white sm:text-sm">{name}</div>
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Kullanıcı kimlik kartı — gerçek oyuncu kartı (PlayerCard) estetiğinde:
 * pozisyon-gradient yerine taraf rengi (P1 kırmızı / P2 mavi), futbolcu fotosu
 * yerine baş-harf monogramı, altta ad + Ev Sahibi/Konuk. Holo + shine + iç
 * çerçeve aynı. Kullanıcı adı eklenince `name` otomatik onu gösterir.
 */
function UserCard({
  name,
  side,
  isYou,
  delay,
}: {
  name: string;
  side: 'P1' | 'P2';
  isYou: boolean;
  delay: number;
}) {
  const theme =
    side === 'P1'
      ? {
          grad: 'from-side-red/90 via-side-red/40',
          glow: 'rgba(220,38,38,0.55)',
          border: 'rgba(220,38,38,0.5)',
          light: '#fca5a5',
          dark: '#7f1d1d',
        }
      : {
          grad: 'from-side-blue/90 via-side-blue/40',
          glow: 'rgba(37,99,235,0.55)',
          border: 'rgba(37,99,235,0.5)',
          light: '#93c5fd',
          dark: '#1e3a8a',
        };
  const initial = name.charAt(0).toUpperCase();

  return (
    <motion.div
      initial={{ opacity: 0, x: side === 'P1' ? -40 : 40, scale: 0.85, rotateY: side === 'P1' ? -15 : 15 }}
      animate={{ opacity: 1, x: 0, scale: 1, rotateY: 0 }}
      transition={{ delay, type: 'spring', stiffness: 240, damping: 20 }}
      whileHover={{ y: -6, scale: 1.03 }}
      className="group relative aspect-[2/3] w-40 select-none sm:w-52"
      style={{ perspective: 900 }}
    >
      {isYou && (
        <span className="absolute -top-3 left-1/2 z-40 -translate-x-1/2 rounded-full bg-accent-gold px-3.5 py-1 text-[11px] font-black tracking-wide text-[#1f1500] shadow-lg">
          SEN
        </span>
      )}

      <div
        className="relative flex h-full w-full flex-col overflow-hidden rounded-xl shadow-card"
        style={{ boxShadow: `0 0 28px -4px ${theme.glow}` }}
      >
        {/* Koyu base */}
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-900 to-zinc-950" />
        {/* Taraf gradyanı (üst) */}
        <div className={`absolute inset-x-0 top-0 h-[62%] bg-gradient-to-b ${theme.grad} to-transparent`} />
        {/* Üst parıltı */}
        <div
          className="pointer-events-none absolute inset-0 z-10 opacity-40 mix-blend-overlay"
          style={{
            backgroundImage:
              'radial-gradient(ellipse at 50% 8%, rgba(255,255,255,0.85), transparent 55%)',
          }}
        />
        {/* Holo conic */}
        <div
          className="pointer-events-none absolute inset-0 z-10 opacity-[0.18] mix-blend-color-dodge"
          style={{
            backgroundImage:
              'conic-gradient(from 210deg at 50% 50%, rgba(255,80,120,0.6), rgba(255,200,80,0.6), rgba(120,255,160,0.6), rgba(80,180,255,0.6), rgba(220,120,255,0.6), rgba(255,80,120,0.6))',
          }}
        />
        {/* Shine band — hover */}
        <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden>
          <div className="absolute inset-y-0 w-[35%] -translate-x-full -skew-x-12 bg-gradient-to-r from-transparent via-white/55 to-transparent opacity-0 mix-blend-screen transition-all duration-700 ease-out group-hover:translate-x-[260%] group-hover:opacity-100" />
        </div>
        {/* İç çerçeve */}
        <div
          className="pointer-events-none absolute inset-[3px] z-20 rounded-[10px] border"
          style={{ borderColor: `${theme.border}` }}
        />

        {/* Monogram alanı (futbolcu fotosu yerine) */}
        <div className="relative z-0 h-[72%] w-full overflow-hidden rounded-t-[inherit]">
          <div
            className="absolute inset-0 opacity-50 blur-md"
            style={{
              background: `radial-gradient(circle at 50% 35%, ${theme.light}, transparent 70%)`,
            }}
          />
          <div
            className="relative flex h-full w-full items-center justify-center text-6xl font-black sm:text-7xl"
            style={{ color: '#fff', textShadow: `0 4px 24px ${theme.glow}` }}
          >
            {initial}
          </div>
          {/* Alt karartma */}
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3"
            style={{ background: `linear-gradient(to bottom, transparent, ${theme.dark}cc)` }}
          />
        </div>

        {/* Ad + rol */}
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-2 pb-2 pt-1.5">
          <div
            className="mb-1 h-px w-[55%]"
            style={{ background: `linear-gradient(to right, transparent, ${theme.light}aa, transparent)` }}
          />
          <div
            className="line-clamp-1 break-all text-center text-[13px] font-black leading-tight tracking-wide text-white"
            title={name}
          >
            {name}
          </div>
          <div
            className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.18em]"
            style={{ color: theme.light }}
          >
            {side === 'P1' ? 'Ev Sahibi' : 'Konuk'}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
