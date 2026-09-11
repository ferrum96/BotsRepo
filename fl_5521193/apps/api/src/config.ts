import { z } from 'zod';
import { DEFAULT_UPLOAD_DIR, DEFAULT_WEB_DIST } from './paths';

const schema = z
  .object({
    DATABASE_URL: z.string().optional(),
    API_PORT: z.coerce.number().default(5521),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z.string().default('info'),
    DEFAULT_TIMEZONE: z.string().default('Europe/Moscow'),
    SEND_JITTER_MIN_SECONDS: z.coerce.number().default(60),
    SEND_JITTER_MAX_SECONDS: z.coerce.number().default(180),
    MESSAGING_PROVIDER: z.enum(['stub', 'amochats']).default('stub'),
    AMOCRM_MODE: z.enum(['stub', 'live']).default('stub'),
    AMOCRM_BASE_URL: z.string().optional(),
    AMOCRM_CLIENT_ID: z.string().optional(),
    AMOCRM_CLIENT_SECRET: z.string().optional(),
    AMOCRM_REDIRECT_URI: z.string().optional(),
    AMOCRM_TOKEN_FILE: z.string().optional(),
    AMOCRM_PIPELINE_ID: z.preprocess(
      (value) => (value === '' || value === undefined ? undefined : value),
      z.coerce.number().optional(),
    ),
    AMOCRM_STATUS_ID: z.preprocess(
      (value) => (value === '' || value === undefined ? undefined : value),
      z.coerce.number().optional(),
    ),
    AMOCRM_RATE_LIMIT_RPS: z.coerce.number().default(5),
    UPLOAD_DIR: z.string().default(DEFAULT_UPLOAD_DIR),
    DEMO_MODE: z
      .string()
      .optional()
      .transform((value) => value === 'true' || value === '1'),
    WEB_DIST: z.string().default(DEFAULT_WEB_DIST),
  })
  .refine((value) => value.DEMO_MODE || Boolean(value.DATABASE_URL), {
    message: 'DATABASE_URL обязателен, если DEMO_MODE выключен',
  })
  .refine(
    (value) =>
      value.AMOCRM_MODE !== 'live' ||
      Boolean(value.AMOCRM_BASE_URL && value.AMOCRM_CLIENT_ID && value.AMOCRM_CLIENT_SECRET && value.AMOCRM_REDIRECT_URI),
    { message: 'AMOCRM_MODE=live требует BASE_URL, CLIENT_ID, CLIENT_SECRET, REDIRECT_URI' },
  );

export type AppConfig = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = schema.safeParse(env);

  if (!parsed.success) {
    // Падаем на старте: неверная конфигурация не должна проявляться в рантайме.
    throw new Error(`Invalid configuration: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`);
  }

  return parsed.data;
}
