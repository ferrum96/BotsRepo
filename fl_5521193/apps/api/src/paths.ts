import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** `fl_5521193/` — корень пакета, не монорепо BotsRepo. */
export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

export const FIXTURE_CSV = join(REPO_ROOT, 'fixtures', 'astro-base-sample.csv');
export const TZ_SOURCE = join(REPO_ROOT, 'docs', 'tz-source.txt');
export const CRITICAL_DOC = join(REPO_ROOT, 'docs', '02-critical.md');
export const DEFAULT_UPLOAD_DIR = join(REPO_ROOT, 'uploads');
export const DEFAULT_WEB_DIST = join(REPO_ROOT, 'apps', 'web', 'dist');
