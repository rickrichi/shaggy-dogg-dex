import type { Hono } from 'hono';

export function mountHealth(app: Hono): void {
  app.get('/api/health', (c) => c.json({ ok: true }));
}
