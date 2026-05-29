import { readFileSync, existsSync } from 'node:fs';

export interface Correction {
  slug: string;
  field: string;
  value: unknown;
  sourceNote?: string;
}

function parseValue(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === '') return '';
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

export function loadCorrections(csvPath: string): Correction[] {
  if (!existsSync(csvPath)) return [];
  const text = readFileSync(csvPath, 'utf8');
  const out: Correction[] = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#') || t.toLowerCase().startsWith('slug,')) continue;
    const cols = splitCsv(t);
    if (cols.length < 3) continue;
    const [slug, field, value, sourceNote] = cols;
    if (!slug || !field) continue;
    out.push({ slug, field, value: parseValue(value ?? ''), sourceNote });
  }
  return out;
}

function splitCsv(line: string): string[] {
  const result: string[] = [];
  let buf = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"' && line[i + 1] === '"') {
      buf += '"';
      i++;
    } else if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(buf);
      buf = '';
    } else {
      buf += ch;
    }
  }
  result.push(buf);
  return result.map((s) => s.trim());
}

export function applyCorrection<T extends Record<string, unknown>>(
  obj: T,
  field: string,
  value: unknown,
): void {
  const parts = field.split('.');
  let cursor: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    const next = cursor[key];
    if (next === undefined || next === null || typeof next !== 'object') {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]!] = value;
}
