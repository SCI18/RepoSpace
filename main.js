const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const OAuthHandler = require('./oauth-handler');
const config = require('./config');

const RepoStorage = require('./repo-storage');

const repoStorage = new RepoStorage();

// Example: open repo folder for a given repo name
function openRepoInFolder(fullName) {
    const repoPath = repoStorage.getRepoPath(fullName); // this gives ~/RepoSpace/owner-repo
    shell.showItemInFolder(repoPath);
}

let mainWindow;
let oauthHandler;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,        // ✅ This allows require() in renderer
      contextIsolation: false,      // ✅ This allows access to Node.js APIs
      enableRemoteModule: true      // ✅ This allows remote module access
    }
  });

  mainWindow.loadFile('index.html');
  
  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
  
  // Initialize OAuth handler
  oauthHandler = new OAuthHandler(config.clientId, config.clientSecret);
}

// Handle OAuth login request from renderer
ipcMain.handle('start-oauth', async () => {
  try {
    const authUrl = oauthHandler.getAuthURL();
    
    // Create OAuth window
    const oauthWindow = new BrowserWindow({
      width: 600,
      height: 700,
      parent: mainWindow,
      modal: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });
    
    oauthWindow.loadURL(authUrl);
    
    // Listen for callback URL
    return new Promise((resolve, reject) => {
      oauthWindow.webContents.on('will-navigate', async (event, url) => {
        if (url.startsWith('http://localhost:3000/callback')) {
          event.preventDefault();
          
          // Extract code from URL
          const urlParams = new URLSearchParams(url.split('?')[1]);
          const code = urlParams.get('code');
          const error = urlParams.get('error');
          
          oauthWindow.close();
          
          if (error) {
            reject(new Error(`OAuth error: ${error}`));
            return;
          }
          
          if (code) {
            try {
              const accessToken = await oauthHandler.getAccessToken(code);
              resolve(accessToken);
            } catch (err) {
              reject(err);
            }
          } else {
            reject(new Error('No authorization code received'));
          }
        }
      });
      
      oauthWindow.on('closed', () => {
        reject(new Error('OAuth window was closed'));
      });
    });
  } catch (error) {
    throw error;
  }
});

ipcMain.handle('open-repo-folder', async (event, fullName) => {
  try {
    openRepoInFolder(fullName);
    return { success: true };
  } catch (error) {
    console.error('Failed to open repo folder:', error);
    return { success: false, error: error.message };
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
