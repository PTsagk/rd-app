const { app, BrowserWindow, screen, globalShortcut, systemPreferences } = require('electron');
function animateWindowBounds(win, targetBounds, duration = 300, easing = [0.4, 0.0, 0.2, 1]) {
  const startBounds = win.getBounds();
  const startTime = Date.now();

  // Cubic bezier function
  function cubicBezier(t, p0, p1, p2, p3) {
    const u = 1 - t;
    return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
  }

  function animate() {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // Apply cubic bezier easing
    const easedProgress = cubicBezier(progress, easing[0], easing[1], easing[2], easing[3]);

    const currentBounds = {
      x: Math.floor(startBounds.x + (targetBounds.x - startBounds.x) * easedProgress),
      y: startBounds.y + (targetBounds.y - startBounds.y) * easedProgress,
      width: Math.floor(
        startBounds.width + (targetBounds.width - startBounds.width) * easedProgress
      ),
      height: Math.floor(
        startBounds.height + (targetBounds.height - startBounds.height) * easedProgress
      ),
    };

    win.setBounds(currentBounds, false);

    if (progress < 1) {
      setTimeout(animate, 16); // ~60fps
    }
  }

  animate();
}

function createDynamicIsland() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width } = primaryDisplay.bounds;
  const hasNotch =
    primaryDisplay.bounds.width === 1728 ||
    primaryDisplay.bounds.width === 3024 ||
    primaryDisplay.bounds.width === 3456;
  const defaultHeight = hasNotch ? 30 : 1;

  const win = new BrowserWindow({
    width: 180, // Starting width of your island
    height: defaultHeight, // Starting height
    x: width / 2 - 100, // Center it horizontally
    y: 0, // Stick it to the very top
    frame: false, // Removes title bar
    transparent: true,
    alwaysOnTop: true,
    hasShadow: false,
    type: 'panel', // Helps it behave like a system overlay
    enableLargerThanScreen: true,
    roundedCorners: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    // backgroundColor: '#000000', // Fully transparent background
    thickFrame: false,
  });

  if (process.platform === 'darwin') {
    systemPreferences.askForMediaAccess('microphone').then((granted) => {
      console.log('Microphone access:', granted ? 'granted' : 'denied');
    });
  }
  // CRITICAL: This allows the window to overlap the Menu Bar/Notch
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // This allows the window to sit in the "dead zone" of the notch
  win.setBounds({ x: Math.floor(width / 2 - 100), y: 0, width: 180, height: defaultHeight });

  // win.webContents.openDevTools({ mode: 'detach' });
  // This makes the transparent parts of your window click-through
  // win.setIgnoreMouseEvents(true, { forward: true });
  const { ipcMain } = require('electron');

  // ... inside your createDynamicIsland function
  ipcMain.on('resize-island', (event, { width, height }) => {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth } = primaryDisplay.bounds;
    console.log(`Resizing island to width: ${width}, height: ${height}`);

    const x = Math.floor(screenWidth / 2 - width / 2);

    animateWindowBounds(
      win,
      {
        width: width,
        height: height,
        x: x,
        y: 0,
      },
      1000,
      [0.4, 0.0, 0.2, 1]
    ); // Material Design standard easing
  });
  // win.on('blur', () => {
  //   win.setBounds({ width: 200, height: 30, x: center, y: 0 }, true);
  // });
  win.loadURL('http://localhost:4200'); // Load your Angular app here

  // Register global keyboard shortcut
  let isExpanded = false;
  globalShortcut.register('CommandOrControl+R', () => {
    console.log('Global shortcut triggered');
    if (isExpanded) {
      // Contract
      const x = Math.floor(width / 2 - 180 / 2);
      animateWindowBounds(
        win,
        { width: 180, height: defaultHeight, x: x, y: 0 },
        400,
        [0.34, 1.56, 1, 1]
      );
      isExpanded = false;
    } else {
      // Expand
      const x = Math.floor(width / 2 - 270 / 2);
      animateWindowBounds(win, { width: 270, height: 100, x: x, y: 0 }, 400, [0.34, 1.56, 1, 1]);
      isExpanded = true;
    }
    win.webContents.send('toggle-expand', isExpanded);
  });

  return win;
}

app.whenReady().then(createDynamicIsland);

// Unregister shortcuts when app quits
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
