---
paths:
  - "desktop/**/*"
---

# Electron desktop

- Preserve `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`,
  and `webSecurity: true` in `desktop/main.cjs`. Preserve navigation guards
  and the desktop server's host, method, and path checks.
- The UI serves built `dist/` on loopback port 5174 and connects to the
  arbitrage backend on port 8000. This backend is separate from Hono.
- `npm run desktop:backend` uses `../crypto-arb/backend` and its Python
  environment to stage the bundled backend in `.desktop-build/`.
  Report missing prerequisites; do not copy backend `.env` files or data into
  the bundle. Runtime configuration belongs in Electron's user-data directory.
- `desktop/build-ui.mjs` requires the staged backend, builds Vite with desktop
  endpoints, and bundles the scanner. `npm run desktop:pack` creates an
  unpacked app; `npm run desktop:installer` creates the standard installer.
  Both write generated output under `release/desktop`.
- Keep the desktop scanner's explicit `--dry-run` behavior. Preserve child
  process cleanup and hidden backend windows on Windows.
- Build the frontend before `node --test desktop/server.test.cjs`, since it
  serves `dist/`. This test covers the HTTP host, not Electron UI behavior or
  packaged backend startup; report those validation limits.
- `npm run desktop:release` is a distinct signed-release path. Preserve its
  certificate, dependency audit, and signature verification gates. Do not
  describe a standard installer as a verified signed release.
