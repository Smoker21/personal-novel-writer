// Simple slug generator. Falls back to a random suffix when input is non-Latin
// (e.g. Chinese names) so we never produce empty slugs.
export function makeSlug(name: string): string {
  const ascii = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (ascii.length >= 2) return ascii;
  // Pure-CJK or empty → random short id
  const r = Math.random().toString(36).slice(2, 8);
  return `n-${r}`;
}
