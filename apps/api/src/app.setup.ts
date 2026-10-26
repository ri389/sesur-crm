import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import cookieParser from 'cookie-parser';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Configuration HTTP commune à l'application et aux tests e2e. */
export function configureApp(app: INestApplication): void {
  const express = app.getHttpAdapter().getInstance();
  const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 0);
  if (!Number.isSafeInteger(trustProxyHops) || trustProxyHops < 0) {
    throw new Error('TRUST_PROXY_HOPS doit être un entier positif ou nul.');
  }
  const configuredOrigin = process.env.APP_ORIGIN?.trim();
  let appOrigin: string | undefined;
  if (configuredOrigin) {
    const parsedAppOrigin = new URL(configuredOrigin);
    if (!['http:', 'https:'].includes(parsedAppOrigin.protocol)) {
      throw new Error('APP_ORIGIN doit utiliser HTTP ou HTTPS.');
    }
    appOrigin = parsedAppOrigin.origin;
  }
  express.set('trust proxy', trustProxyHops);
  express.disable('x-powered-by');

  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=()',
    );
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    );
    if (req.secure) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    }

    const requestOrigin = req.get('origin');
    if (MUTATING_METHODS.has(req.method) && requestOrigin) {
      const expectedOrigin = appOrigin ?? `${req.protocol}://${req.get('host')}`;
      let parsedOrigin: string;
      try {
        parsedOrigin = new URL(requestOrigin).origin;
      } catch {
        res
          .status(403)
          .json({ statusCode: 403, message: 'Origine non autorisée' });
        return;
      }
      if (parsedOrigin !== expectedOrigin) {
        res
          .status(403)
          .json({ statusCode: 403, message: 'Origine non autorisée' });
        return;
      }
    }

    next();
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}
