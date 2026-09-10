const EMAIL_RE = /^[^\s@,;<>()[\]]+@[^\s@,;<>()[\]]+\.[a-z]{2,}$/i;

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const cleaned = value
    .trim()
    .replace(/^mailto:/i, '')
    // Значения вида "Имя <mail@example.com>" встречаются в выгрузках.
    .replace(/^.*<([^>]+)>$/, '$1')
    .trim()
    .toLowerCase();

  if (!EMAIL_RE.test(cleaned)) return null;

  return cleaned;
}
