const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');

// Your NAVAA website. Change this if your Netlify link is different.
const URL = 'https://naavaapp.netlify.app/';

// Sites and apps that trigger the popup during a focus session. Add more words here.
const BAD = /instagram|tiktok|youtube|facebook|reddit|twitter|snapchat/i;

let win = null, overlay = null, watch = null;
let state = { phase: 'idle', breakUsed: false, mins: 0 };

function createWindow() {
  win = new BrowserWindow({
    width: 1200, height: 800, backgroundColor: '#14152B', title: 'NAVAA',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true }
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'index.html'));
  // Never let the page block you from closing the app.
  win.webContents.on('will-prevent-unload', (e) => e.preventDefault());
  win.on('closed', () => { win = null; stopWatch(); });
}

function overlayHtml() {
  const m = Math.max(1, state.mins);
  const used = state.breakUsed;
  const btn = 'width:100%;padding:14px;border:0;border-radius:12px;font-size:15px;font-weight:600;margin-top:10px;cursor:pointer;';
  return '<!doctype html><meta charset="utf-8"><body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:rgba(20,21,43,.9);font-family:system-ui,sans-serif;color:#F7F5F0">'
    + '<div style="background:#1D1E3B;border-radius:20px;padding:32px;max-width:400px;width:90%;text-align:center">'
    + '<div style="font-size:42px">⏸</div>'
    + '<h2 style="margin:10px 0 8px">Hold on — you\'re mid-focus</h2>'
    + '<p style="color:#9296AC;line-height:1.5;margin:0 0 20px">You\'re ' + m + ' minute' + (m === 1 ? '' : 's')
    + ' into a focus session. Opening this now usually turns into 40 minutes gone.</p>'
    + '<button onclick="navaa.act(\'back\')" style="' + btn + 'background:#FF8A3D;color:#14152B">Go back</button>'
    + '<button ' + (used ? 'disabled' : '') + ' onclick="navaa.act(\'break\')" style="' + btn + 'background:#262848;color:#F7F5F0;' + (used ? 'opacity:.5;cursor:not-allowed' : '') + '">'
    + (used ? 'Break already used' : 'Take a break') + '</button></div></body>';
}

function showOverlay() {
  if (overlay) return;
  const b = screen.getPrimaryDisplay().bounds;
  overlay = new BrowserWindow({
    x: b.x, y: b.y, width: b.width, height: b.height,
    frame: false, transparent: true, alwaysOnTop: true, skipTaskbar: true,
    resizable: false, hasShadow: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true }
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlay.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(overlayHtml()));
  overlay.on('closed', () => { overlay = null; });
}

function hideOverlay() {
  if (overlay) { overlay.destroy(); overlay = null; }
}

async function check() {
  if (state.phase !== 'focus') return hideOverlay();
  let w = null;
  try {
    const { activeWindow } = await import('active-win');
    w = await activeWindow();
  } catch (e) { }
  if (!w) return;
  if (w.owner && w.owner.processId === process.pid) return; // our own windows: leave things as they are
  const text = ((w.owner && w.owner.name) || '') + ' ' + (w.title || '');
  if (BAD.test(text)) showOverlay(); else hideOverlay();
}

function startWatch() { if (!watch) watch = setInterval(check, 1500); }
function stopWatch() { if (watch) { clearInterval(watch); watch = null; } hideOverlay(); }

ipcMain.on('state', (e, phase, breakUsed, mins) => {
  state = { phase, breakUsed, mins };
  if (phase === 'idle') stopWatch(); else startWatch();
});

ipcMain.on('act', (e, a) => {
  if (a === 'back') {
    hideOverlay();
    if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
  } else if (a === 'break' && !state.breakUsed && state.phase === 'focus') {
    state.phase = 'break'; state.breakUsed = true;
    hideOverlay();
    if (win) win.webContents.executeJavaScript('window.navaaTakeBreak && navaaTakeBreak()').catch(() => { });
  }
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
