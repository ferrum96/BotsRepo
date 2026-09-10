import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  API_PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.string().default('info'),
  DEFAULT_TIMEZONE: z.string().default('Europe/Moscow'),
  SEND_JITTER_MIN_SECONDS: z.coerce.number().default(60),
  SEND_JITTER_MAX_SECONDS: z.coerce.number().default(180),
  MESSAGING_PROVIDER: z.enum(['stub', 'amochats']).default('stub'),
  AMOCRM_MODE: z.enum(['stub', 'live']).default('stub'),
  AMOCRM_RATE_LIMIT_RPS: z.coerce.number().default(5),
  UPLOAD_DIR: z.string().default('uploads'),
});

export type AppConfig = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = schema.safeParse(env);

  if (!parsed.success) {
    // Падаем на старте: неверная конфигурация не должна проявляться в рантайме.
    throw new Error(`Invalid configuration: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`);
  }

  return parsed.data;
}
