```js
const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');

const BAD = /instagram|tiktok|youtube|facebook|reddit|twitter|snapchat/i;

let win = null;
let overlay = null;
let watch = null;
let checking = false;

let state = {
  phase: 'idle',
  breakUsed: false,
  mins: 0
};

// Create the main NAVAA window.
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

  win.loadFile(path.join(__dirname, 'index.html'));

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

// HTML displayed by the focus overlay.
function overlayHtml() {
  const minutes = Math.max(0, Number(state.mins) || 0);
  const used = state.breakUsed;

  const buttonStyle =
    'width:100%;padding:14px;border:0;border-radius:12px;' +
    'font-size:15px;font-weight:600;margin-top:10px;cursor:pointer;';

  return (
    '<!doctype html>' +
    '<html><head><meta charset="utf-8"></head>' +
    '<body style="' +
    'margin:0;height:100vh;display:flex;align-items:center;' +
    'justify-content:center;background:rgba(20,21,43,.94);' +
    'font-family:system-ui,sans-serif;color:#F7F5F0;">' +

    '<div style="' +
    'background:#1D1E3B;border-radius:20px;padding:32px;' +
    'max-width:400px;width:85%;text-align:center;">' +

    '<div style="font-size:42px;">⏸</div>' +

    '<h2 style="margin:10px 0 8px;">Hold on — you’re mid-focus</h2>' +

    '<p style="color:#9296AC;line-height:1.5;margin:0 0 20px;">' +
    'You’re ' + minutes + ' minute' + (minutes === 1 ? '' : 's') +
    ' into a focus session. Is this site worth interrupting your focus?' +
    '</p>' +

    '<button onclick="navaa.act(\'back\')" style="' +
    buttonStyle +
    'background:#FF8A3D;color:#14152B;">Go back</button>' +

    '<button ' + (used ? 'disabled' : '') +
    ' onclick="navaa.act(\'break\')" style="' +
    buttonStyle +
    'background:#262848;color:#F7F5F0;' +
    (used ? 'opacity:.5;cursor:not-allowed;' : '') +
    '">' +
    (used ? 'Break already used' : 'Take a break') +
    '</button>' +

    '</div></body></html>'
  );
}

// Display the overlay above other windows.
function showOverlay() {
  if (overlay && !overlay.isDestroyed()) {
    overlay.setAlwaysOnTop(true, 'screen-saver');
    overlay.show();
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

  overlay.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true
  });

  overlay.on('closed', () => {
    overlay = null;
  });

  overlay.loadURL(
    'data:text/html;charset=utf-8,' +
    encodeURIComponent(overlayHtml())
  ).catch((error) => {
    console.error('NAVAA overlay failed to load:', error);
  });
}

// Close the overlay safely.
function hideOverlay() {
  if (overlay && !overlay.isDestroyed()) {
    overlay.destroy();
  }

  overlay = null;
}

// Detect whether the active desktop window is distracting.
async function check() {
  if (checking) return;

  checking = true;

  try {
    if (state.phase !== 'focus') {
      hideOverlay();
      return;
    }

    const activeWindowModule = await import('active-win');
    const activeWindow = activeWindowModule.default;

    if (typeof activeWindow !== 'function') {
      console.error('NAVAA: active-win did not provide a function.');
      return;
    }

    const active = await activeWindow();

    if (!active) return;

    // Ignore NAVAA's own windows.
    if (
      active.owner &&
      active.owner.processId === process.pid
    ) {
      return;
    }

    const windowText =
      ((active.owner && active.owner.name) || '') +
      ' ' +
      (active.title || '');

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

// Start checking the active window.
function startWatch() {
  if (watch) return;

  watch = setInterval(() => {
    check();
  }, 1500);

  check();
}

// Stop checking and remove the overlay.
function stopWatch() {
  if (watch) {
    clearInterval(watch);
    watch = null;
  }

  hideOverlay();
}

// Receive focus-session updates from the NAVAA interface.
ipcMain.on('state', (_event, phase, breakUsed, mins) => {
  state = {
    phase,
    breakUsed: Boolean(breakUsed),
    mins: Number(mins) || 0
  };

  if (phase === 'idle') {
    stopWatch();
  } else {
    startWatch();
  }
});

// Handle overlay button clicks.
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
  }

  if (
    action === 'break' &&
    !state.breakUsed &&
    state.phase === 'focus'
  ) {
    state.phase = 'break';
    state.breakUsed = true;

    hideOverlay();

    if (win && !win.isDestroyed()) {
      win.webContents.executeJavaScript(
        'window.navaaTakeBreak && window.navaaTakeBreak()'
      ).catch((error) => {
        console.error('NAVAA break action failed:', error);
      });
    }
  }
});

// Report startup errors instead of silently failing.
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
```
