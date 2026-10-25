// EZD-103a Step 5 (vault/plans/EZD-103a.md Decided "Initials"; S15 Data shown "avatar initials"; B15 "JB"):
// two initials from the first and last word of the name, one from a one-word name, else the email's first.
const firstCodePoint = (s: string): string => Array.from(s)[0] ?? '';

export function initialsFor(name: string | null, email: string): string {
  const words = (name ?? '')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  if (words.length >= 2) {
    return (firstCodePoint(words[0]) + firstCodePoint(words[words.length - 1])).toUpperCase();
  }
  if (words.length === 1) return firstCodePoint(words[0]).toUpperCase();
  return firstCodePoint(email).toUpperCase();
}
