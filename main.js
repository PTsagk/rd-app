const { app, BrowserWindow, screen, globalShortcut } = require('electron');

function createDynamicIsland() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width } = primaryDisplay.bounds;

  const win = new BrowserWindow({
    width: 180, // Starting width of your island
    height: 30, // Starting height
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

  // CRITICAL: This allows the window to overlap the Menu Bar/Notch
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // This allows the window to sit in the "dead zone" of the notch
  win.setBounds({ x: Math.floor(width / 2 - 100), y: 0, width: 180, height: 30 });

  // win.webContents.openDevTools({ mode: 'detach' });
  // This makes the transparent parts of your window click-through
  // win.setIgnoreMouseEvents(true, { forward: true });
  const { ipcMain } = require('electron');

  // ... inside your createDynamicIsland function
  ipcMain.on('resize-island', (event, { width, height }) => {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth } = primaryDisplay.bounds;
    console.log(`Resizing island to width: ${width}, height: ${height}`);

    // Keep it centered while resizing
    const x = Math.floor(screenWidth / 2 - width / 2);

    win.setBounds(
      {
        width: width,
        height: height,
        x: x,
        y: 0,
      },
      false
    ); // The 'true' enables a smooth OS-level animation
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
      win.setBounds({ width: 180, height: 30, x: x, y: 0 }, true);
      isExpanded = false;
    } else {
      // Expand
      const x = Math.floor(width / 2 - 420 / 2);
      win.setBounds({ width: 420, height: 220, x: x, y: 0 }, true);
      isExpanded = true;
    }
  });

  return win;
}

app.whenReady().then(createDynamicIsland);

// Unregister shortcuts when app quits
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
