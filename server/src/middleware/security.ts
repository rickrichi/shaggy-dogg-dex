// server/src/middleware/security.ts

import type { MiddlewareHandler } from 'hono';
import { cors } from 'hono/cors';

export const withCors = (origin: string): MiddlewareHandler =>
  cors({
    origin: o => (o === origin ? o : ''),
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    maxAge: 600
  });

export const withSecurityHeaders: MiddlewareHandler = async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'no-referrer');
  c.header('Permissions-Policy', 'interest-cohort=()');
  c.header('Cross-Origin-Opener-Policy', 'same-origin');
};
