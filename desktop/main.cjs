const { app, BrowserWindow, shell, dialog, Menu, utilityProcess } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { startUiServer } = require('./server.cjs');
let server;
let backend;
let scanner;
let window;
const origin = 'http://127.0.0.1:5174';
if (!app.requestSingleInstanceLock()) app.quit();
else app.whenReady().then(async () => {
  const root = app.isPackaged ? process.resourcesPath : path.resolve(__dirname, '..');
  const executable = app.isPackaged
    ? path.join(root, 'backend', 'shaggy-arb', 'shaggy-arb.exe')
    : path.join(root, '.desktop-build', 'dist', 'shaggy-arb', 'shaggy-arb.exe');
  try {
    const response = await fetch('http://127.0.0.1:8000/api/config', { signal: AbortSignal.timeout(1500) });
    if (!response.ok) throw new Error('Backend unavailable');
  } catch {
    if (fs.existsSync(executable)) {
      backend = spawn(executable, [], { cwd: app.getPath('userData'), windowsHide: true,
        env: { ...process.env, ARB_CORS_ORIGINS: JSON.stringify([origin, 'http://localhost:5173']), ARB_DESKTOP_ENV: path.join(app.getPath('userData'), 'backend.env') }, stdio: 'ignore' });
      backend.on('error', () => dialog.showErrorBox('Backend could not start', 'Check your desktop backend installation.'));
    } else dialog.showErrorBox('Backend not bundled', 'Run the desktop backend build or start crypto-arb on port 8000.');
  }
  try { server = await startUiServer(path.join(root, 'dist')); }
  catch { dialog.showErrorBox('Desktop port unavailable', 'Port 5174 is already in use. Close the other process and reopen the app.'); app.quit(); return; }
  window = new BrowserWindow({ width: 1440, height: 960, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true } });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (new URL(url).protocol === 'https:') void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => { if (new URL(url).origin !== origin) event.preventDefault(); });
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'Shaggy-Dogg-Dex', submenu: [
    { label: 'Open wallet browser', click: () => shell.openExternal(origin + '/swap') },
    { label: 'Configuration folder', click: () => shell.openPath(app.getPath('userData')) },
    { label: 'Start Base scanner (quotes only)', click: () => {
      if (scanner) return;
      const scannerPath = app.isPackaged ? path.join(root, 'daemon', 'scanner.cjs') : path.join(root, '.desktop-build', 'daemon', 'scanner.cjs');
      if (!fs.existsSync(scannerPath)) { dialog.showErrorBox('Scanner unavailable', 'Build the desktop scanner first.'); return; }
      scanner = utilityProcess.fork(scannerPath, ['--dry-run'], { cwd: app.getPath('userData'), stdio: 'pipe' });
      const log = fs.createWriteStream(path.join(app.getPath('userData'), 'scanner.log'), { flags: 'a' });
      scanner.stdout?.pipe(log, { end: false });
      scanner.stderr?.pipe(log, { end: false });
      scanner.on('exit', () => { scanner = null; log.end(); });
    } },
    { label: 'Stop Base scanner', click: () => { scanner?.kill(); } },
    { role: 'reload' }, { role: 'toggleDevTools' }, { role: 'quit' },
  ] }]));
  await window.loadURL(origin + '/arbitrage');
}).catch(error => { dialog.showErrorBox('Desktop startup failed', error.message); app.quit(); });
app.on('second-instance', () => { window?.show(); window?.focus(); });
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { scanner?.kill(); backend?.kill(); server?.close(); });
