/**
 * Ably realtime — sunucu tarafı.
 *
 * Her maç bir kanal: `match:<id>`. Sunucu doğrulanmış her durum değişikliğini
 * bu kanala yayar; iki client dinler ve anında güncellenir.
 *
 * ABLY_API_KEY yoksa (ör. geliştirmede key kurulmadan) publish sessizce
 * atlanır — client polling'e düşer (matchmaking'deki gibi). Böylece Ably
 * kurulmadan da akış test edilebilir. Bkz ONLINE-YOL-HARITASI.md (Faz 3).
 */
import Ably from 'ably';

const apiKey = process.env.ABLY_API_KEY;

let restClient: Ably.Rest | null = null;

/** Tekil REST client (publish + token üretimi için). Key yoksa null. */
function getAblyRest(): Ably.Rest | null {
  if (!apiKey) return null;
  if (!restClient) {
    restClient = new Ably.Rest({ key: apiKey });
  }
  return restClient;
}

/** Ably yapılandırılmış mı? (client'a flag olarak verilebilir.) */
export function isAblyEnabled(): boolean {
  return Boolean(apiKey);
}

/** Bir maç kanalının adı. */
export function matchChannelName(matchId: string): string {
  return `match:${matchId}`;
}

/**
 * Maç kanalına bir olay yayar. Key yoksa no-op (sessizce atlar).
 * Hata olursa yutar — realtime kritik değil, polling yedek var.
 */
export async function publishMatchEvent(
  matchId: string,
  name: string,
  data: unknown,
): Promise<void> {
  const rest = getAblyRest();
  if (!rest) return;
  try {
    await rest.channels.get(matchChannelName(matchId)).publish(name, data);
  } catch {
    // realtime yayını başarısız — polling devreye girer, sessizce geç
  }
}

/**
 * Belirli bir kullanıcı için kısa ömürlü Ably token isteği üretir.
 * Client bu token'la bağlanır (API key client'a ASLA gitmez). Token yalnızca
 * verilen maç kanalını dinlemeye yetkilidir (capability kısıtlı).
 */
export async function createMatchToken(
  matchId: string,
  userId: string,
): Promise<Ably.TokenRequest | null> {
  const rest = getAblyRest();
  if (!rest) return null;
  const channel = matchChannelName(matchId);
  return rest.auth.createTokenRequest({
    clientId: userId,
    capability: { [channel]: ['subscribe', 'presence'] },
  });
}
