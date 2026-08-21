const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getDatabaseStatus: () => ipcRenderer.invoke('get-db-status'),
  triggerBackup: () => ipcRenderer.invoke('trigger-backup'),
  verifyLicense: (key) => ipcRenderer.invoke('verify-license', key),
  savePDF: (html, fileName) => ipcRenderer.invoke('save-invoice-pdf', { html, fileName }),
  captureInvoiceImage: (html, fileName) => ipcRenderer.invoke('capture-invoice-image', { html, fileName }),
  listPrinters: () => ipcRenderer.invoke('list-printers'),
  ensureReceiptPrinterDefault: () => ipcRenderer.invoke('ensure-receipt-printer-default'),
  getLicenseStatus: () => ipcRenderer.invoke('get-license-status'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  onStatusUpdate: (callback) => ipcRenderer.on('status-update', (event, value) => callback(value))
});
