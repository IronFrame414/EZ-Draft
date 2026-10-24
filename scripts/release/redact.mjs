// EZD-023c Step 3 (vault/plans/EZD-023c.md): pure redaction helpers. EZD-025 imports both.

/**
 * Replaces the password of every `<scheme>://<user>:<password>@` with `***`. The password runs to the last `@`
 * of the same whitespace-free run, so a bare `@` inside it does not leak its tail (EZD-025 Step 4a; Q-0257 (a)).
 */
export function redactUrl(text) {
  return String(text).replace(/([a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\s:/@]*:)[^\s]*@/g, '$1***@');
}

/** Redacted lines, minus any holding a masked value, at most the last 20. */
export function safeLines(lines, maskedValues) {
  const masked = (maskedValues ?? []).filter((v) => typeof v === 'string' && v !== '');
  return lines
    .map((l) => redactUrl(l))
    .filter((l) => !masked.some((v) => l.includes(v)))
    .slice(-20);
}
