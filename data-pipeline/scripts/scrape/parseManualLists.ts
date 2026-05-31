/**
 * Manuel toplanmış oyuncu .txt dosyalarını parse eder.
 *
 * Klasör: data-pipeline/manuel_toplanan_futbolcular/
 *
 * Beklenen formatlar:
 *   - "1. Alan Shearer"     (numara prefix'li, büyük lig dosyaları)
 *   - "Alex de Souza"        (düz isim, Türkiye dosyaları)
 *   - "Fenerbahçe:"          (bölüm başlığı — atlanır, ama bağlam tutulur)
 *   - "Not: ..."             (yorum — atlanır)
 *   - boş satır              (atlanır)
 *
 * Çıktı:
 *   cache/manual-names.json — { [normalizedKey]: { name, sourceFiles[], sourceContexts[] } }
 *
 * Aynı oyuncu birden fazla dosyada/bölümde olabilir; merge edilir.
 *
 * Kullanım:
 *   pnpm tsx scripts/scrape/parseManualLists.ts
 */
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PIPELINE_ROOT = join(__dirname, '..', '..');
const MANUAL_DIR = join(PIPELINE_ROOT, 'manuel_toplanan_futbolcular');
const CACHE_DIR = join(PIPELINE_ROOT, 'cache');
const OUT_FILE = join(CACHE_DIR, 'manual-names.json');

export interface ManualName {
  /** Görünür ad — ilk geçtiği yerden alınır */
  name: string;
  /** Normalize edilmiş arama anahtarı (latinleştirilmiş, lowercase) */
  normalizedKey: string;
  /** Bu ismin geçtiği dosya adları (unique) */
  sourceFiles: string[];
  /** Bağlam (kulüp/lig) bilgileri ("Fenerbahçe", "Premier League" vb.) */
  sourceContexts: string[];
}

/** Latinleştir + lowercase + boşluk normalize. */
export function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    // Türkçe özel
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    // Apostrof varyantları
    .replace(/['']/g, "'")
    // Tek boşluğa indir
    .replace(/\s+/g, ' ')
    .trim();
}

/** Dosya adından lig/grup bağlamı çıkar. */
function fileContext(filename: string): string {
  if (filename.includes('premier_league')) return 'Premier League';
  if (filename.includes('laliga')) return 'LaLiga';
  if (filename.includes('serie_a')) return 'Serie A';
  if (filename.includes('bundesliga')) return 'Bundesliga';
  if (filename.includes('ligue1')) return 'Ligue 1';
  if (filename.includes('dis_ligler')) return 'Global';
  if (filename.includes('fb_gs_ts_bjk_bursa_basak')) return 'Türkiye Büyük Kulüpler';
  if (filename.includes('turkiye_anadolu')) return 'Türkiye Anadolu';
  return filename;
}

/** Bir satırdaki ismi izole et. "1. Alan Shearer" → "Alan Shearer", "Fenerbahçe:" → null (başlık). */
function extractName(rawLine: string): string | null {
  const line = rawLine.trim();
  if (line.length === 0) return null;

  // Yorum/not satırı
  if (/^(Not|NOT|Note|note):/i.test(line)) return null;

  // Bölüm başlığı: "Fenerbahçe:", "Galatasaray:", "Bursa:" — sona iki nokta
  if (/^[A-ZŞÇİĞÜÖa-zışçğüö][A-ZŞÇİĞÜÖa-zışçğüö\s/]+:\s*$/.test(line)) return null;

  // Açıklama paragrafları (başlıkta tek olmayan uzun yazılar)
  // "Premier League / İngiltere ligi 1985-90 sonrası ağırlıklı..."
  // Bunlar baş tarafta — "/" veya çok uzunsa atla
  if (line.length > 80 && !line.match(/^\d+\.\s/)) return null;

  // Numara prefix'i temizle: "1. Alan Shearer" → "Alan Shearer"
  let name = line.replace(/^\d+\s*[\.\):\-]\s*/, '');

  // İçinde "(yıl)" varsa atla — örn. "Smith (1985-1992)"
  name = name.replace(/\s*\([^)]*\)\s*/g, ' ').trim();

  // Sonunda iki nokta olan başlıkları kaçırdıysak
  if (/^[A-ZŞÇİĞÜÖa-zışçğüö\s/]+:\s*$/.test(name)) return null;

  // Bir isim minimum 3 karakter
  if (name.length < 3) return null;

  // İsim 2+ kelime ya da tek kelimeli sahne adı (Pelé, Vinicius)
  return name;
}

async function parseFile(
  filename: string,
  filePath: string,
): Promise<Array<{ name: string; context: string }>> {
  const content = await readFile(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const context = fileContext(filename);
  let currentSubContext: string | null = null;
  const out: Array<{ name: string; context: string }> = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    // Bölüm başlığı kontrolü (Fenerbahçe: vb.) — bu önce çalışmalı çünkü
    // extractName başlıkları "null" döner ama biz bağlamı yine kaydetmeliyiz.
    const sectionMatch = line.match(/^([A-ZŞÇİĞÜÖa-zışçğüö][A-ZŞÇİĞÜÖa-zışçğüö\s/]+):\s*$/);
    if (sectionMatch) {
      currentSubContext = sectionMatch[1]!.trim();
      continue;
    }

    const name = extractName(line);
    if (!name) continue;

    // Sub-context (kulüp) varsa onu kullan, yoksa dosya bağlamı
    const ctx = currentSubContext ?? context;
    out.push({ name, context: ctx });
  }
  return out;
}

async function main() {
  await mkdir(CACHE_DIR, { recursive: true });

  // Hem .txt hem uzantısız dosyaları topla
  const allFiles = await readdir(MANUAL_DIR);
  const txtFiles = allFiles.filter(
    (f) => f.endsWith('.txt') || !f.includes('.'),
  );
  console.log(`[parseManualLists] ${txtFiles.length} dosya bulundu:`);
  for (const f of txtFiles) console.log(`  - ${f}`);

  // Tüm isimleri topla, normalizedKey ile birleştir
  const byKey = new Map<string, ManualName>();
  for (const filename of txtFiles) {
    const filePath = join(MANUAL_DIR, filename);
    const entries = await parseFile(filename, filePath);
    console.log(`\n[${filename}] ${entries.length} isim çıkarıldı`);

    for (const entry of entries) {
      const key = normalizeForMatch(entry.name);
      let existing = byKey.get(key);
      if (!existing) {
        existing = {
          name: entry.name,
          normalizedKey: key,
          sourceFiles: [],
          sourceContexts: [],
        };
        byKey.set(key, existing);
      }
      if (!existing.sourceFiles.includes(filename)) {
        existing.sourceFiles.push(filename);
      }
      if (!existing.sourceContexts.includes(entry.context)) {
        existing.sourceContexts.push(entry.context);
      }
    }
  }

  const result = [...byKey.values()];
  // Önce kaç dosyada geçtiğine göre sırala (popüler isimler önce — debug için)
  result.sort((a, b) => b.sourceFiles.length - a.sourceFiles.length);

  await writeFile(OUT_FILE, JSON.stringify(result, null, 2));

  // Özet
  console.log(`\n=== ÖZET ===`);
  console.log(`Toplam unique isim: ${result.length}`);
  console.log(`Birden fazla dosyada geçen: ${result.filter((r) => r.sourceFiles.length > 1).length}`);
  console.log(`Tek dosyada geçen: ${result.filter((r) => r.sourceFiles.length === 1).length}`);
  console.log(`Çıktı: ${OUT_FILE}`);

  // En çok geçenler (debug)
  console.log(`\nEn çok dosyada geçen 10 isim:`);
  for (const r of result.slice(0, 10)) {
    console.log(`  ${r.name.padEnd(30)} (${r.sourceFiles.length} dosya, ${r.sourceContexts.join(' / ')})`);
  }
}

main().catch((e) => {
  console.error('[parseManualLists] fatal:', e);
  process.exit(1);
});
