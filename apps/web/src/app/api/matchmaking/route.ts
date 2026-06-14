import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import {
  joinMatchmaking,
  joinImposterLobby,
  pollImposterLobby,
  leaveMatchmaking,
  findActiveMatchFor,
  createInvite,
  joinInvite,
  pruneStaleInvites,
  isLobbyMode,
  ONLINE_MODES,
  type OnlineMode,
} from '@/lib/server/matchmaking';
import { enforceRateLimit } from '@/lib/server/rateLimit';

// DB + game-engine (fs) → Node runtime şart.
export const runtime = 'nodejs';

/**
 * POST /api/matchmaking  — Eşleşmeye gir.
 * Body: { mode: 'vs-duello' }
 * Yanıt: { matched: true, matchId } | { matched: false, queued: true }
 *
 * Client bunu çağırır; queued dönerse kısa aralıklarla GET ile yoklar
 * (ileride Ably ile push'a çevrilecek — Faz 3).
 */
export async function POST(req: Request) {
  const userId = await requireUser();
  if (!userId) {
    return NextResponse.json({ error: 'Giriş gerekli.' }, { status: 401 });
  }

  // Flood koruması — eşleşmeye gir/yokla (GET polling 2sn → 60sn'de ~30). 90 bol.
  const limited = enforceRateLimit(`matchmaking:${userId}`, 90, 60_000);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Geçersiz JSON.' }, { status: 400 });
  }
  const mode = parseMode(body);
  if (!mode) {
    return NextResponse.json({ error: 'Geçersiz mod.' }, { status: 400 });
  }

  // ÖZEL DAVET mi, rastgele mi? Body'de action + inviteCode varsa davet yolu.
  const action = parseAction(body);
  const inviteCode = parseInviteCode(body);

  if (action === 'create') {
    if (!inviteCode) {
      return NextResponse.json({ error: 'Davet kodu eksik.' }, { status: 400 });
    }
    // Yeni davet açarken bayat davetleri ara sıra temizle (ucuz, yan etki).
    void pruneStaleInvites().catch(() => {});
    // LOBİ modu (imposter): davet eden de aynı kodlu lobiye girer (N kişi toplanır).
    const result = isLobbyMode(mode)
      ? await joinImposterLobby(userId, mode, inviteCode)
      : await createInvite(userId, mode, inviteCode);
    return NextResponse.json(result);
  }

  if (action === 'join') {
    if (!inviteCode) {
      return NextResponse.json({ error: 'Davet kodu eksik.' }, { status: 400 });
    }
    // LOBİ modu (imposter): katılan da aynı kodlu lobiye girer (5/5 veya 30sn+3).
    const result = isLobbyMode(mode)
      ? await joinImposterLobby(userId, mode, inviteCode)
      : await joinInvite(userId, mode, inviteCode);
    return NextResponse.json(result);
  }

  // Varsayılan: rastgele eşleşme (mevcut davranış — 2-kişi; imposter lobi dalına
  // joinMatchmaking içinde yönlenir).
  const result = await joinMatchmaking(userId, mode);
  return NextResponse.json(result);
}

/**
 * GET /api/matchmaking?mode=kadro  — Bekleme durumunu yokla.
 * Yanıt: { matched: true, matchId } (rakip bizi kaptıysa) | { matched: false }
 *
 * MOD-ÖZEL: `?mode=` ile yalnızca O MODDAKİ aktif maça bakar. Yoksa kullanıcının
 * başka moddaki eski/zombi maçı yanlış sayfada açılır (gözlenen bug). Mode yoksa
 * mod-agnostik (geri uyumluluk).
 */
export async function GET(req: Request) {
  const userId = await requireUser();
  if (!userId) {
    return NextResponse.json({ error: 'Giriş gerekli.' }, { status: 401 });
  }

  // Flood koruması — POST ile aynı kovayı paylaşır (kullanıcının matchmaking trafiği).
  const limited = enforceRateLimit(`matchmaking:${userId}`, 90, 60_000);
  if (limited) return limited;

  const url = new URL(req.url);
  const modeParam = url.searchParams.get('mode');
  const mode = ONLINE_MODES.includes(modeParam as OnlineMode)
    ? (modeParam as OnlineMode)
    : undefined;

  // LOBİ modu (imposter): poll'de lobi oluşturmayı DA dene (30sn+≥3 tetikleyici
  //  yalnız POST'ta değil poll'de de çalışsın; aksi halde herkes susunca lobi
  //  hiç kurulmaz). joinImposterLobby idempotent (enqueuedAt korunur, re-upsert).
  if (mode && isLobbyMode(mode)) {
    // GET-poll: HAFİF yoklama (kuyruğa yeniden YAZMAZ — oyuncu POST'ta girdi).
    const code = url.searchParams.get('invite');
    const result = await pollImposterLobby(userId, mode, code && code.length >= 4 ? code : null);
    return NextResponse.json(result);
  }

  const matchId = await findActiveMatchFor(userId, mode);
  if (matchId) {
    return NextResponse.json({ matched: true, matchId });
  }
  return NextResponse.json({ matched: false });
}

/**
 * DELETE /api/matchmaking  — Eşleşmeden vazgeç (kuyruktan çık).
 */
export async function DELETE() {
  const userId = await requireUser();
  if (!userId) {
    return NextResponse.json({ error: 'Giriş gerekli.' }, { status: 401 });
  }
  await leaveMatchmaking(userId);
  return NextResponse.json({ ok: true });
}

async function requireUser(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user?.id ?? null;
}

function parseMode(body: unknown): OnlineMode | null {
  if (!body || typeof body !== 'object') return null;
  const m = (body as Record<string, unknown>).mode;
  return ONLINE_MODES.includes(m as OnlineMode) ? (m as OnlineMode) : null;
}

/** Davet aksiyonu: 'create' (davet aç) | 'join' (davete katıl) | null (rastgele). */
function parseAction(body: unknown): 'create' | 'join' | null {
  if (!body || typeof body !== 'object') return null;
  const a = (body as Record<string, unknown>).action;
  return a === 'create' || a === 'join' ? a : null;
}

/** Davet kodu — yalnız makul uzunlukta alfanümerik/URL-güvenli kabul edilir. */
function parseInviteCode(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const c = (body as Record<string, unknown>).inviteCode;
  if (typeof c !== 'string') return null;
  const trimmed = c.trim();
  if (trimmed.length < 4 || trimmed.length > 32) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) return null;
  return trimmed;
}
