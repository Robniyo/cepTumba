import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { ActivityLogService } from './logging/activity-log.service';
import {
  MESSAGING_PUBLIC_PREFIX,
  MESSAGING_UPLOAD_DIR,
} from './messaging/messaging.service';
import {
  DOCUMENTS_PUBLIC_PREFIX,
  DOCUMENTS_UPLOAD_DIR,
} from './minutes/minutes.service';
import {
  EVENT_MATERIALS_PUBLIC_PREFIX,
  EVENT_MATERIALS_UPLOAD_DIR,
} from './events/events.service';
import { setDefaultResultOrder } from "node:dns";
setDefaultResultOrder("ipv4first");

const normalizeOrigin = (value: string): string =>
  value.trim().toLowerCase().replace(/\/$/, '');

export async function createApp() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useStaticAssets(MESSAGING_UPLOAD_DIR, { prefix: MESSAGING_PUBLIC_PREFIX });
  app.useStaticAssets(DOCUMENTS_UPLOAD_DIR, { prefix: DOCUMENTS_PUBLIC_PREFIX });
  app.useStaticAssets(EVENT_MATERIALS_UPLOAD_DIR, { prefix: EVENT_MATERIALS_PUBLIC_PREFIX });

  const configService = app.get(ConfigService);
  const originsValue =
    configService.get<string>('FRONTEND_URLS') ??
    configService.get<string>('FRONTEND_URL') ??
    'http://localhost:8080,http://localhost:8081';
  const allowedOrigins = originsValue
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  const normalizedAllowedOrigins = new Set(
    allowedOrigins.map((origin) => normalizeOrigin(origin)),
  );
  const nodeEnv = configService.get<string>('NODE_ENV') ?? 'development';
  const isDevelopment = nodeEnv !== 'production';
  const localhostPattern =
    /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i;

  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      const normalizedOrigin = normalizeOrigin(origin);

      if (normalizedAllowedOrigins.has(normalizedOrigin)) {
        callback(null, true);
        return;
      }

      if (isDevelopment && localhostPattern.test(normalizedOrigin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS origin not allowed: ${origin}`));
    },
    credentials: true,
  });

  // Ensure CORS headers are present on all responses (including errors)
  app.use((req, res, next) => {
    try {
      const originHeader = (req.headers.origin as string) || '';
      if (originHeader) {
        const normalizedOriginHeader = normalizeOrigin(originHeader);
        if (
          normalizedAllowedOrigins.has(normalizedOriginHeader) ||
          (isDevelopment && localhostPattern.test(normalizedOriginHeader))
        ) {
          res.setHeader('Access-Control-Allow-Origin', originHeader);
          res.setHeader('Access-Control-Allow-Credentials', 'true');
          res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        }
      }
      if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        return res.end();
      }
    } catch (err) {
      // ignore middleware errors and continue
    }
    return next();
  });

  await app.init();
  return { app, allowedOrigins };
}

async function bootstrap() {
  const { app, allowedOrigins } = await createApp();

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);

  const activityLogService = app.get(ActivityLogService);
  activityLogService.logSystem({
    action: 'application_started',
    metadata: {
      port,
      allowedOrigins,
    },
  });
}

if (process.env.VERCEL !== '1') {
  bootstrap();
}
