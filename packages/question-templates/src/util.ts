export function isPrime(n: number): boolean {
  if (!Number.isInteger(n) || n < 2) return false;
  if (n === 2) return true;
  if (n % 2 === 0) return false;
  for (let i = 3; i * i <= n; i += 2) {
    if (n % i === 0) return false;
  }
  return true;
}

export function countVowels(s: string): number {
  return (s.match(/[aeiouAEIOUaeiouyAEIOUYaiueoIAUE]/g) ?? []).length;
}

export function nameLetterCount(s: string): number {
  return s.replace(/[^a-zA-Z]/g, '').length;
}

export function getByPath(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let cursor: unknown = obj;
  for (const p of parts) {
    if (cursor === null || cursor === undefined) return undefined;
    if (typeof cursor !== 'object') return undefined;
    cursor = (cursor as Record<string, unknown>)[p];
  }
  return cursor;
}
