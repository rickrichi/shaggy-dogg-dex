const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

exports.startUiServer = (root, port = 5174) => new Promise((resolve, reject) => {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (req.headers.host !== `127.0.0.1:${server.address().port}`) { res.writeHead(403).end(); return; }
    if (url.pathname.startsWith('/arb/')) {
      if (!['GET', 'POST'].includes(req.method) || (req.method === 'POST' && req.headers.origin !== `http://${req.headers.host}`)) { res.writeHead(403).end(); return; }
      const upstream = http.request({ hostname: '127.0.0.1', port: 8000, path: req.url.slice(4), method: req.method,
        headers: { ...req.headers, host: '127.0.0.1:8000', origin: 'http://localhost:5173' }, timeout: 45_000 }, reply => {
        res.writeHead(reply.statusCode, reply.headers); reply.pipe(res);
      });
      upstream.on('timeout', () => upstream.destroy());
      upstream.on('error', () => { if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Local crypto-arb service unavailable' })); });
      req.pipe(upstream); return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/cryptostream/')) {
      res.writeHead(503, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'This optional service is not bundled in the desktop build.' })); return;
    }
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); } catch { res.writeHead(400).end(); return; }
    const target = path.resolve(root, '.' + pathname);
    if (!target.startsWith(path.resolve(root) + path.sep) && target !== path.resolve(root)) { res.writeHead(403).end(); return; }
    let file = target;
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      if (path.extname(pathname)) { res.writeHead(404).end(); return; }
      file = path.join(root, 'index.html');
    }
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https: blob:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https: wss: http://localhost:8000 http://127.0.0.1:8000 ws://localhost:8000 ws://127.0.0.1:8000; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-src https:");
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
  });
  server.on('upgrade', (req, socket, head) => {
    if (req.url !== '/arb/ws' || req.headers.host !== `127.0.0.1:${server.address().port}` || req.headers.origin !== `http://${req.headers.host}`) { socket.destroy(); return; }
    const upstream = http.request({ hostname: '127.0.0.1', port: 8000, path: '/ws', headers: { ...req.headers, host: '127.0.0.1:8000', origin: 'http://localhost:5173' } });
    upstream.on('upgrade', (reply, remote, remoteHead) => {
      socket.write('HTTP/1.1 101 Switching Protocols\r\n' + Object.entries(reply.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n') + '\r\n\r\n');
      if (head.length) remote.write(head);
      if (remoteHead.length) socket.write(remoteHead);
      remote.pipe(socket); socket.pipe(remote);
      socket.on('error', () => remote.destroy()); remote.on('error', () => socket.destroy());
      socket.on('close', () => remote.destroy());
    });
    upstream.on('response', () => socket.destroy());
    upstream.on('error', () => socket.destroy());
    upstream.end();
  });
  server.once('error', reject);
  server.listen(port, '127.0.0.1', () => resolve(server));
});
