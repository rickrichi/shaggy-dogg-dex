const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { startUiServer } = require('./server.cjs');
test('desktop serves SPA routes and rejects cross-host and non-GET requests', async () => {
  const server = await startUiServer(path.resolve(__dirname, '../dist'), 0);
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    assert.equal((await fetch(base + '/stake')).status, 200);
    assert.equal((await fetch(base + '/missing.js')).status, 404);
    assert.equal((await fetch(base + '/stake', { method: 'POST' })).status, 405);
    const status = await new Promise((resolve, reject) => require('node:http').get(base, { headers: { host: 'untrusted.example' } }, res => { res.resume(); resolve(res.statusCode); }).on('error', reject));
    assert.equal(status, 403);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
