import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import {
  joinMatchmaking,
  leaveMatchmaking,
  findActiveMatchFor,
  ONLINE_MODES,
  type OnlineMode,
} from '@/lib/server/matchmaking';

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
  const modeParam = new URL(req.url).searchParams.get('mode');
  const mode = ONLINE_MODES.includes(modeParam as OnlineMode)
    ? (modeParam as OnlineMode)
    : undefined;
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
