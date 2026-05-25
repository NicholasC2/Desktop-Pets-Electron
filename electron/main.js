const { BrowserWindow, app, ipcMain } = require('electron');
const path = require('path');

let win;

function createWindow() {

  win = new BrowserWindow({
    width: 220,
    height: 220,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    focusable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.loadFile(path.join(__dirname, 'index.html'));
}

let offset = { x: 0, y: 0 };

ipcMain.on('drag-start', (e, pos) => {
  const [wx, wy] = win.getPosition();
  offset = {
    x: pos.x - wx,
    y: pos.y - wy
  };
});

ipcMain.on('drag-move', (e, pos) => {
  win.setPosition(
    pos.x - offset.x,
    pos.y - offset.y
  );
});

app.whenReady().then(createWindow);