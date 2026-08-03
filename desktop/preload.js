const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getDatabaseStatus: () => ipcRenderer.invoke('get-db-status'),
  triggerBackup: () => ipcRenderer.invoke('trigger-backup'),
  verifyLicense: (key) => ipcRenderer.invoke('verify-license', key),
  getLicenseStatus: () => ipcRenderer.invoke('get-license-status'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  onStatusUpdate: (callback) => ipcRenderer.on('status-update', (event, value) => callback(value))
});
