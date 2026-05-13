// Matches characters that are unsafe for filesystem paths and directory names.
// Note: space is intentionally NOT in this set — spaces are handled separately
// by the whitespace-collapse step so they become underscores rather than disappearing.
const FILESYSTEM_UNSAFE = /[/\\:*?"<>|]/g;
const WHITESPACE_RUN = /\s+/g;

const WINDOWS_RESERVED = new Set([
  "CON",
  "PRN",
  "AUX",
  "NUL",
  "COM1",
  "COM2",
  "COM3",
  "COM4",
  "COM5",
  "COM6",
  "COM7",
  "COM8",
  "COM9",
  "LPT1",
  "LPT2",
  "LPT3",
  "LPT4",
  "LPT5",
  "LPT6",
  "LPT7",
  "LPT8",
  "LPT9",
]);

export function isWindowsReservedName(s: string): boolean {
  return WINDOWS_RESERVED.has(s.toUpperCase());
}

export function sanitizeSlug(input: string): string {
  const normalized = input.normalize("NFC");
  const cleaned = normalized.replace(FILESYSTEM_UNSAFE, "").trim().replace(WHITESPACE_RUN, "_");
  if (cleaned.length === 0) {
    throw new Error(`Sanitized result is empty for input: ${JSON.stringify(input)}`);
  }
  return cleaned;
}

export function sanitizeTitle(input: string): string {
  const slug = sanitizeSlug(input);
  if (isWindowsReservedName(slug)) return `${slug}-novel`;
  return slug;
}
