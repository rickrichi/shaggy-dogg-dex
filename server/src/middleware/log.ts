import type { MiddlewareHandler } from 'hono';

export const logRequests: MiddlewareHandler = async (c, next) => {
  const t0 = Date.now();
  await next();
  console.log(`${c.req.method} ${c.req.path} -> ${c.res.status} ${Date.now() - t0}ms`);
};
