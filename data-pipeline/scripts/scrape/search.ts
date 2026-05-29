/**
 * Transfermarkt arama endpoint'i: isim → tmId.
 *
 * URL: /schnellsuche/ergebnis/schnellsuche?query={name}
 * Yanıt: HTML — cheerio ile parse, ilk birkaç oyuncu adayını dön.
 *
 * Doğrulama (doğum yılı match) merge tarafında yapılır.
 */
import * as cheerio from 'cheerio';
import { fetchHtml } from './http.js';

export interface SearchHit {
  tmId: number;
  /** "/lionel-messi/profil/spieler/28003" */
  profilePath: string;
  /** Arama sonucunda görünen ad */
  name: string;
  /** Mevcut kulüp (kısa) */
  clubName?: string;
  /** Pozisyon kısaltma (varsa) */
  position?: string;
  /** Doğum yılı (HTML'de gözüküyorsa) */
  birthYear?: number;
}

const BASE = 'https://www.transfermarkt.com';

export async function search(query: string, limit = 5): Promise<SearchHit[]> {
  const url = `${BASE}/schnellsuche/ergebnis/schnellsuche?query=${encodeURIComponent(query)}&Spieler_page=1`;
  const html = await fetchHtml(url, { ttlDays: 90 });
  const $ = cheerio.load(html);

  const hits: SearchHit[] = [];

  // TM arama sonucu: <table class="items"> içinde her satır bir oyuncu.
  // Alternatif şablonda: <a class="spielprofil_tooltip"> içinde sırasıyla profile + ad.
  // En güvenilir: profil URL pattern'ini doğrudan ara.
  const seenIds = new Set<number>();

  // 1. Yeni şablon: liste tablosunda <a href="/{slug}/profil/spieler/{id}">
  $('table.items tbody tr').each((_, row) => {
    if (hits.length >= limit) return false;
    const anchor = $(row).find('a[href*="/profil/spieler/"]').first();
    const href = anchor.attr('href');
    if (!href) return;
    const m = href.match(/\/profil\/spieler\/(\d+)/);
    if (!m) return;
    const tmId = parseInt(m[1]!, 10);
    if (!Number.isFinite(tmId) || seenIds.has(tmId)) return;
    seenIds.add(tmId);

    const name = anchor.text().trim() || anchor.attr('title')?.trim() || '';
    // Diğer hücreler: pozisyon, kulüp, vs.
    const cells = $(row).find('td').map((_, td) => $(td).text().trim().replace(/\s+/g, ' ')).get();
    // Pozisyon, takım, doğum yılı genelde td'lerin içinde yayılı
    const all = cells.join(' | ');
    const yearMatch = all.match(/\b(19|20)\d{2}\b/);
    const birthYear = yearMatch ? parseInt(yearMatch[0], 10) : undefined;

    hits.push({
      tmId,
      profilePath: href.replace(/^https?:\/\/[^/]+/, ''),
      name,
      birthYear,
    });
    return undefined;
  });

  // 2. Eğer table.items boşsa, doğrudan tüm profile linklerini topla (fallback)
  if (hits.length === 0) {
    $('a[href*="/profil/spieler/"]').each((_, a) => {
      if (hits.length >= limit) return false;
      const href = $(a).attr('href');
      if (!href) return;
      const m = href.match(/\/profil\/spieler\/(\d+)/);
      if (!m) return;
      const tmId = parseInt(m[1]!, 10);
      if (!Number.isFinite(tmId) || seenIds.has(tmId)) return;
      seenIds.add(tmId);
      hits.push({
        tmId,
        profilePath: href.replace(/^https?:\/\/[^/]+/, ''),
        name: $(a).text().trim() || $(a).attr('title')?.trim() || '',
      });
      return undefined;
    });
  }

  return hits;
}
