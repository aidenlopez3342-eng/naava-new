const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');

const BAD = /instagram|tiktok|youtube|facebook|reddit|twitter|snapchat/i;

let win = null;
let overlay = null;
let watch = null;
let checking = false;

const defaultState = {
  phase: 'idle',
  breakUsed: false,
  mins: 0
};

let state = { ...defaultState };

function normalizePhase(phase) {
  return phase === 'focus' || phase === 'break' || phase === 'idle' ? phase : 'idle';
}

function setState(nextPhase, nextBreakUsed, nextMins) {
  state = {
    phase: normalizePhase(nextPhase),
    breakUsed: Boolean(nextBreakUsed),
    mins: Number.isFinite(Number(nextMins)) ? Math.max(0, Number(nextMins)) : 0
  };
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#14152B',
    title: 'NAVAA',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true
    }
  });

  win.setMenuBarVisibility(false);

  const indexPath = path.join(__dirname, 'index.html');
  win.loadFile(indexPath).catch((error) => {
    console.error('NAVAA failed to load index.html:', error);
  });

  win.webContents.on('will-prevent-unload', (event) => {
    event.preventDefault();
  });

  win.webContents.on('did-fail-load', (_event, code, description) => {
    console.error('NAVAA failed to load:', code, description);
  });

  win.on('closed', () => {
    win = null;
    stopWatch();
  });
}

function overlayHtml() {
  const minutes = Math.max(0, Number(state.mins) || 0);
  const used = state.breakUsed;
  const buttonStyle = [
    'width:100%',
    'padding:14px',
    'border:0',
    'border-radius:12px',
    'font-size:15px',
    'font-weight:600',
    'margin-top:10px',
    'cursor:pointer'
  ].join(';');

  const breakButtonStyle = used ? 'opacity:.5;cursor:not-allowed;' : '';

  return `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <style>
          * { box-sizing: border-box; }
          html, body {
            margin: 0;
            height: 100%;
            font-family: system-ui, sans-serif;
            background: rgba(20, 21, 43, 0.94);
            color: #F7F5F0;
          }
          body {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .card {
            background: #1D1E3B;
            border-radius: 20px;
            padding: 32px;
            max-width: 400px;
            width: 85%;
            text-align: center;
            box-shadow: 0 18px 40px rgba(10, 12, 21, 0.42);
          }
          .icon {
            font-size: 42px;
            line-height: 1;
          }
          h2 {
            margin: 10px 0 8px;
            font-size: clamp(1.5rem, 2vw, 2rem);
          }
          p {
            color: #9296AC;
            line-height: 1.5;
            margin: 0 0 20px;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon">⏸</div>
          <h2>Hold on — you're mid-focus</h2>
          <p>
            You're ${minutes} minute${minutes === 1 ? '' : 's'} into a focus session.
            Is this site worth interrupting your focus?
          </p>

          <button id="back-btn" style="${buttonStyle};background:#FF8A3D;color:#14152B;">
            Go back
          </button>
          <button id="break-btn" style="${buttonStyle};background:#262848;color:#F7F5F0;${breakButtonStyle}" ${used ? 'disabled' : ''}>
            ${used ? 'Break already used' : 'Take a break'}
          </button>
        </div>

        <script>
          const act = (action) => {
            if (window.navaa && typeof window.navaa.act === 'function') {
              window.navaa.act(action);
              return;
            }

            console.warn('NAVAA action bridge unavailable for', action);
          };

          document.getElementById('back-btn').addEventListener('click', () => act('back'));
          document.getElementById('break-btn').addEventListener('click', () => act('break'));
        </script>
      </body>
    </html>`;
}

function showOverlay() {
  if (overlay && !overlay.isDestroyed()) {
    overlay.setAlwaysOnTop(true, 'screen-saver');
    overlay.show();
    overlay.focus();
    return;
  }

  const bounds = screen.getPrimaryDisplay().bounds;

  overlay = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true
    }
  });

  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  overlay.on('closed', () => {
    overlay = null;
  });

  overlay.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(overlayHtml())).catch((error) => {
    console.error('NAVAA overlay failed to load:', error);
  });
}

function hideOverlay() {
  if (overlay && !overlay.isDestroyed()) {
    overlay.hide();
    overlay.destroy();
  }

  overlay = null;
}

async function check() {
  if (checking) return;

  checking = true;

  try {
    if (state.phase !== 'focus') {
      hideOverlay();
      return;
    }

    const activeWindowModule = await import('active-win');
    const activeWin = activeWindowModule.default || activeWindowModule;

    if (typeof activeWin !== 'function') {
      console.error('NAVAA: active-win did not provide a function.');
      return;
    }

    const active = await activeWin();
    if (!active) return;

    if (active.owner && active.owner.processId === process.pid) {
      hideOverlay();
      return;
    }

    const ownerName = active.owner && active.owner.name ? active.owner.name : '';
    const windowText = `${ownerName} ${active.title || ''}`.trim();

    if (BAD.test(windowText)) {
      showOverlay();
    } else {
      hideOverlay();
    }
  } catch (error) {
    console.error('NAVAA window detection failed:', error);
  } finally {
    checking = false;
  }
}

function startWatch() {
  if (watch) return;

  watch = setInterval(() => {
    check();
  }, 1500);

  check();
}

function stopWatch() {
  if (watch) {
    clearInterval(watch);
    watch = null;
  }

  hideOverlay();
}

ipcMain.on('state', (_event, phase, breakUsed, mins) => {
  setState(phase, breakUsed, mins);

  if (state.phase === 'idle' || state.phase === 'break') {
    stopWatch();
  } else {
    startWatch();
  }
});

ipcMain.on('act', (_event, action) => {
  if (action === 'back') {
    hideOverlay();

    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) {
        win.restore();
      }

      win.show();
      win.focus();
    }
    return;
  }

  if (action === 'break' && !state.breakUsed && state.phase === 'focus') {
    setState('break', true, state.mins);
    hideOverlay();

    if (win && !win.isDestroyed()) {
      win.webContents.executeJavaScript('window.navaaTakeBreak && window.navaaTakeBreak()').catch((error) => {
        console.error('NAVAA break action failed:', error);
      });
    }
  }
});

app.whenReady().then(() => {
  createWindow();
});

app.on('activate', () => {
  if (!win || win.isDestroyed()) {
    createWindow();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopWatch();
});

app.on('render-process-gone', (_event, details) => {
  console.error('NAVAA render process crashed:', details);
  stopWatch();
});

app.on('child-process-gone', (_event, details) => {
  console.error('NAVAA child process ended unexpectedly:', details);
  stopWatch();
});

app.on('browser-window-created', (_event, browserWindow) => {
  browserWindow.webContents.on('render-process-gone', (_renderEvent, details) => {
    console.error('NAVAA BrowserWindow render process crashed:', details);
    stopWatch();
  });
});

app.on('web-contents-created', (_event, contents) => {
  contents.on('render-process-gone', (_renderEvent, details) => {
    console.error('NAVAA web contents crashed:', details);
    stopWatch();
  });
});

app.on('ready', () => {
  if (!win || win.isDestroyed()) {
    createWindow();
  }
});

app.on('before-quit', () => {
  if (overlay && !overlay.isDestroyed()) {
    overlay.destroy();
  }
});

app.on('activate', () => {
  if (win && !win.isDestroyed()) {
    win.show();
  }
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('web-contents-created', (_event, contents) => {
  contents.on('did-fail-load', (_loadEvent, code, description) => {
    console.error('NAVAA page failed to load:', code, description);
  });
});

app.whenReady()
  .then(() => {
    createWindow();
  })
  .catch((error) => {
    console.error('NAVAA failed to start:', error);
  });

app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', () => {
  stopWatch();
});

app.on('open-file', () => {
  if (!win || win.isDestroyed()) {
    createWindow();
  }
});
