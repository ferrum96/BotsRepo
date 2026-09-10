const TRACKING_PARAMS = /^(utm_|fbclid|gclid|yclid|_openstat|ref|from)/i;

/**
 * Канонический вид URL: https, хост в нижнем регистре без www,
 * без трекинговых параметров, без хвостового слэша и без фрагмента.
 * Нужен именно канонический вид — иначе один и тот же профиль
 * попадёт в реестр идентификаторов несколько раз.
 */
export function normalizeUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const cleaned = value.trim();
  if (cleaned.length === 0) return null;

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!url.hostname.includes('.')) return null;

  url.protocol = 'https:';
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  url.hash = '';

  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();

  const pathname = url.pathname.replace(/\/+$/, '');
  const search = url.searchParams.toString();

  return `https://${url.hostname}${pathname}${search ? `?${search}` : ''}`;
}
