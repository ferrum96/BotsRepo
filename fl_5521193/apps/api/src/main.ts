import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { seedReferenceData, type Db } from '@astrostone/db';
import { AppModule } from './app.module';
import { loadConfig } from './config';
import { DB } from './infrastructure.module';

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const adapter = new FastifyAdapter({ logger: false, bodyLimit: 10 * 1024 * 1024 });

  await adapter.register(multipart as never, {
    limits: { fileSize: 100 * 1024 * 1024, files: 1 },
  });

  if (existsSync(join(config.WEB_DIST, 'index.html'))) {
    await adapter.register(fastifyStatic as never, {
      root: config.WEB_DIST,
      prefix: '/',
    });
  }

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    logger: ['error', 'warn', 'log'],
  });

  app.enableCors({ origin: true, credentials: true });
  app.setGlobalPrefix('api', { exclude: ['health'] });
  app.enableShutdownHooks();

  const db = app.get<Db>(DB);
  await seedReferenceData(db);

  await app.listen({ port: config.API_PORT, host: '0.0.0.0' });

  new Logger('bootstrap').log(
    `API listening on :${config.API_PORT}${config.DEMO_MODE ? ' (DEMO_MODE)' : ''}`,
  );
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
