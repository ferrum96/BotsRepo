import 'reflect-metadata';
import multipart from '@fastify/multipart';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { loadConfig } from './config';

async function bootstrap(): Promise<void> {
  const config = loadConfig();

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false, bodyLimit: 10 * 1024 * 1024 }),
    { logger: ['error', 'warn', 'log'] },
  );

  await app.register(multipart as never, {
    limits: { fileSize: 100 * 1024 * 1024, files: 1 },
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableShutdownHooks();

  await app.listen({ port: config.API_PORT, host: '0.0.0.0' });

  new Logger('bootstrap').log(`API listening on :${config.API_PORT}`);
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
