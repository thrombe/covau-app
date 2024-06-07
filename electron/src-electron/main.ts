import { app, BrowserWindow } from 'electron'

let mainWindow: BrowserWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    frame: false,
    // webPreferences: {
    //   webSecurity: false,
    // },
    useContentSize: true
  })

  // when in dev mode, load the url and open the dev tools
  if (import.meta.env.DEV) {
    mainWindow.loadURL(import.meta.env.ELECTRON_APP_URL)
    mainWindow.webContents.openDevTools()
  } else {
    // in production, close the dev tools
    mainWindow.webContents.on('devtools-opened', () => {
      mainWindow.webContents.closeDevTools()
    })
    mainWindow.loadURL(import.meta.env.ELECTRON_APP_URL)
  }
}

app.whenReady().then(createWindow)

