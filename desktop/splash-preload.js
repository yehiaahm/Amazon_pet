const { contextBridge, ipcRenderer } = require('electron');

/**
 * Minimal bridge for the startup splash.
 *
 * The splash window used to run with nodeIntegration: true / contextIsolation: false and call
 * require('electron') from splash.html directly — the only window in the app configured that
 * way, while the main, licence and crash windows were all already isolated. It loads a local
 * file, so there was no known way to reach it, but it meant the one window with full Node
 * access was also the one that renders before anything has been validated. It only ever needed
 * to receive a status string, which is all this exposes.
 */
contextBridge.exposeInMainWorld('splashAPI', {
  onStatusUpdate: (callback) => {
    ipcRenderer.on('status-update', (_event, message) => callback(message));
  }
});
