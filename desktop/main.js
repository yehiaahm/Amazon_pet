const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, spawnSync, execSync, exec, execFile } = require('child_process');
const crypto = require('crypto');
const net = require('net');

// ─── DIRECTORY CONFIGURATIONS ────────────────────────────────────────────────
const systemDrive = process.env.SystemDrive || 'C:';
const APP_DATA_DIR = path.join(systemDrive, '\\', 'AnimaSysData');
const LOGS_DIR = path.join(APP_DATA_DIR, 'Logs');
const BACKUPS_DIR = path.join(APP_DATA_DIR, 'Backups');
const DB_DATA_DIR = path.join(APP_DATA_DIR, 'database_data');
const IMAGES_DIR = path.join(APP_DATA_DIR, 'InvoiceImages');
const CONFIG_FILE = path.join(APP_DATA_DIR, 'config.json');

// Ensure system directories exist
[APP_DATA_DIR, LOGS_DIR, BACKUPS_DIR, DB_DATA_DIR, IMAGES_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Setup Log Files
const backendLogStream = fs.createWriteStream(path.join(LOGS_DIR, 'backend.log'), { flags: 'a' });
const mysqlLogStream = fs.createWriteStream(path.join(LOGS_DIR, 'mysql.err'), { flags: 'a' });
const electronLogPath = path.join(LOGS_DIR, 'electron.log');

function logElectron(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync(electronLogPath, line);
  console.log(msg);
}

// ─── PATHS TO BINARIES ───────────────────────────────────────────────────────
// In production, resources are placed in process.resourcesPath/bin/
// In development, we can test with local mock folders or assume standard structure.
const IS_PROD = app.isPackaged;
const BIN_DIR = IS_PROD 
  ? path.join(process.resourcesPath, 'bin')
  : path.join(__dirname, 'bin');

const MYSQL_DIR = path.join(BIN_DIR, 'mysql');
const JRE_DIR = path.join(BIN_DIR, 'jre');
const BACKEND_JAR = path.join(BIN_DIR, 'animasys-backend-1.0.0.jar');

const MYSQLD_EXE = path.join(MYSQL_DIR, 'bin', 'mysqld.exe');
const MYSQLADMIN_EXE = path.join(MYSQL_DIR, 'bin', 'mysqladmin.exe');
const MYSQLDUMP_EXE = path.join(MYSQL_DIR, 'bin', 'mysqldump.exe');
const JAVA_EXE = path.join(JRE_DIR, 'bin', 'javaw.exe');

// ─── STATE MANAGEMENT ────────────────────────────────────────────────────────
let mysqlProcess = null;
let javaProcess = null;
let mainWindow = null;
let splashWindow = null;
let appConfig = null;
let isStopping = false;

// Process restart thresholds to prevent infinite crash loops
let mysqlCrashCount = 0;
let javaCrashCount = 0;

// ─── CONFIGURATION & SECURITY CREDENTIALS ────────────────────────────────────
function loadOrGenerateConfig() {
  let configChanged = false;

  if (fs.existsSync(CONFIG_FILE)) {
    try {
      appConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      logElectron('Loaded existing configuration file.');
    } catch (e) {
      logElectron(`Error parsing config.json: ${e.message}. Re-generating.`);
    }
  }

  if (!appConfig) {
    // Generate secure random password for MySQL root
    const securePassword = crypto.randomBytes(18).toString('base64')
      .replace(/[^a-zA-Z0-9]/g, 'x') // Clean alphanumeric
      .substring(0, 16);

    appConfig = {
      dbPassword: securePassword,
      licenseKey: null,
      registered: false,
      installedAt: new Date().toISOString()
    };
    configChanged = true;
    logElectron('Generated new database password and configuration.');
  }

  // Ensure JWT secret is present and meets length requirements (min 32 bytes)
  if (!appConfig.jwtSecret) {
    appConfig.jwtSecret = crypto.randomBytes(32).toString('hex'); // 64 chars hex string
    configChanged = true;
    logElectron('Generated new secure JWT secret key.');
  }

  if (configChanged) {
    try {
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(appConfig, null, 2), 'utf8');
      logElectron('Configuration file saved successfully.');
    } catch (e) {
      logElectron(`[ERROR] Failed to save configuration file: ${e.message}`);
    }
  }
}

// ─── NETWORK UTILITIES ───────────────────────────────────────────────────────
function isPortInUse(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1000);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true); // Connected, port is in use!
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false); // Refused, port is free!
    });
    socket.connect(port, '127.0.0.1');
  });
}

function waitForPort(port, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const interval = setInterval(async () => {
      const inUse = await isPortInUse(port);
      if (inUse) {
        clearInterval(interval);
        resolve();
      } else if (Date.now() - startTime > timeoutMs) {
        clearInterval(interval);
        reject(new Error(`Timeout waiting for port ${port}`));
      }
    }, 1000);
  });
}

/** Poll backend until auth endpoint responds — port open alone is not enough. */
function waitForBackendHealth(timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const interval = setInterval(async () => {
      try {
        const res = await fetch('http://localhost:8080/api/auth/needs-setup', { method: 'GET' });
        if (res.ok) {
          clearInterval(interval);
          resolve();
          return;
        }
      } catch (_) {
        // Backend still starting
      }
      if (Date.now() - startTime > timeoutMs) {
        clearInterval(interval);
        reject(new Error('Backend health check timed out'));
      }
    }, 1500);
  });
}

// ─── SUBPROCESS MANAGEMENT (LAUNCHER / SERVICE MANAGER) ──────────────────────
async function startMySQL() {
  logElectron('Starting MySQL startup sequence...');
  
  // Check if MySQL is already running on 3308
  const portUsed = await isPortInUse(3308);
  if (portUsed) {
    logElectron('[WARN] Port 3308 is already in use. Assuming external database or already running.');
    return;
  }

  // Check if database needs initialization
  const isInitialized = fs.existsSync(path.join(DB_DATA_DIR, 'mysql'));
  if (!isInitialized) {
    updateSplashStatus('Initializing database schema (first run)...');
    logElectron('Initializing MySQL data folder...');
    try {
      spawnSync(MYSQLD_EXE, ['--initialize-insecure', `--datadir=${DB_DATA_DIR}`], { stdio: 'ignore' });
      logElectron('MySQL data directory initialized successfully.');
    } catch (err) {
      logElectron(`[ERROR] Failed to initialize MySQL: ${err.message}`);
      throw err;
    }
  }

  // Start MySQL daemon
  updateSplashStatus('Starting database service...');
  logElectron('Launching mysqld.exe process...');
  
  // Clean lock file if it exists due to previous crash
  const lockFile = path.join(DB_DATA_DIR, 'mysqld.pid');
  if (fs.existsSync(lockFile)) {
    try {
      fs.unlinkSync(lockFile);
      logElectron('Cleared stale MySQL PID lock file.');
    } catch (e) {
      logElectron(`[WARN] Could not clear lock file: ${e.message}`);
    }
  }

  const mysqlArgs = [
    `--datadir=${DB_DATA_DIR}`,
    `--port=3308`,
    `--bind-address=127.0.0.1`,
    `--innodb_flush_log_at_trx_commit=2`, // Faster, resilient to power loss
    `--innodb_doublewrite=1`,              // Safe crash recovery
    `--log-error=${path.join(DB_DATA_DIR, 'mysql_server.err')}`
  ];

  mysqlProcess = spawn(MYSQLD_EXE, mysqlArgs);
  
  mysqlProcess.stdout.pipe(mysqlLogStream);
  mysqlProcess.stderr.pipe(mysqlLogStream);

  mysqlProcess.on('close', (code) => {
    logElectron(`MySQL process exited with code ${code}`);
    mysqlProcess = null;
    
    if (!isStopping) {
      mysqlCrashCount++;
      if (mysqlCrashCount <= 3) {
        logElectron(`[RECOVERY] MySQL crashed unexpectedly. Attempting restart (${mysqlCrashCount}/3)...`);
        setTimeout(startMySQL, 2000);
      } else {
        showCrashReport('Database Server crashed repeatedly and could not recover.');
      }
    }
  });

  // Wait for MySQL port to open
  await waitForPort(3308, 15000);
  logElectron('MySQL port 3308 is open and listening.');

  // On first run, set root password to our randomized password
  if (!isInitialized) {
    logElectron('Securing MySQL root account...');
    try {
      spawnSync(MYSQLADMIN_EXE, ['-u', 'root', '--port=3308', 'password', appConfig.dbPassword], { stdio: 'ignore' });
      logElectron('MySQL root password configured securely.');
    } catch (err) {
      logElectron(`[ERROR] Failed to secure MySQL user: ${err.message}`);
    }
  }
}

async function startBackend() {
  logElectron('Starting Spring Boot backend sequence...');
  
  const portUsed = await isPortInUse(8080);
  if (portUsed) {
    logElectron('[WARN] Port 8080 is already in use. Assuming backend is already running.');
    return;
  }

  updateSplashStatus('Launching backend services...');
  logElectron('Spawning java process...');

  // Keep default employee PINs aligned with DatabaseSeeder (e.g. 2026) on every desktop launch
  const shouldSyncDefaultPins = true;

  const javaArgs = [
    `-Dspring.datasource.password=${appConfig.dbPassword}`,
    `-Dspring.datasource.url=jdbc:mysql://localhost:3308/animasys_erp?createDatabaseIfNotExist=true&useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC`,
    `-Dapp.seed-demo-data=true`,
    `-Dapp.sync-default-pins=${shouldSyncDefaultPins}`,
    '-jar',
    BACKEND_JAR
  ];

  const backendEnv = {
    ...process.env,
    JWT_SECRET: appConfig.jwtSecret,
    SEED_DEMO_DATA: 'true',
    SYNC_DEFAULT_PINS: 'false'
  };

  javaProcess = spawn(IS_PROD ? JAVA_EXE : 'java', javaArgs, {
    env: backendEnv
  });

  javaProcess.stdout.pipe(backendLogStream);
  javaProcess.stderr.pipe(backendLogStream);

  javaProcess.on('close', (code) => {
    logElectron(`Spring Boot process exited with code ${code}`);
    javaProcess = null;

    if (!isStopping) {
      javaCrashCount++;
      if (javaCrashCount <= 3) {
        logElectron(`[RECOVERY] Backend server exited unexpectedly. Restarting (${javaCrashCount}/3)...`);
        setTimeout(startBackend, 3000);
      } else {
        showCrashReport('Backend server crashed repeatedly. Check logs for details.');
      }
    }
  });

  // Wait for API to respond (not just port binding)
  await waitForBackendHealth(45000);
  logElectron('Backend server health check passed.');
}

// Graceful child process shutdown
function stopProcesses() {
  isStopping = true;
  logElectron('Shutting down application servers...');
  
  return new Promise((resolve) => {
    let closedCount = 0;
    const checkResolve = () => {
      closedCount++;
      if (closedCount >= 2) resolve();
    };

    if (javaProcess) {
      logElectron('Stopping Java backend process...');
      javaProcess.kill();
      javaProcess = null;
      checkResolve();
    } else {
      checkResolve();
    }

    if (mysqlProcess) {
      logElectron('Sending safe shutdown to MySQL Server...');
      try {
        const shutdownProcess = spawn(MYSQLADMIN_EXE, ['-u', 'root', '--port=3308', `-p${appConfig.dbPassword}`, 'shutdown']);
        shutdownProcess.on('close', (code) => {
          if (code !== 0) {
            logElectron(`[WARN] Graceful MySQL shutdown failed with code ${code}. Force-killing.`);
            if (mysqlProcess) mysqlProcess.kill();
          }
          mysqlProcess = null;
          checkResolve();
        });
        shutdownProcess.on('error', (err) => {
          logElectron(`[WARN] Graceful MySQL shutdown error: ${err.message}. Force-killing.`);
          if (mysqlProcess) mysqlProcess.kill();
          mysqlProcess = null;
          checkResolve();
        });
      } catch (e) {
        if (mysqlProcess) mysqlProcess.kill();
        mysqlProcess = null;
        checkResolve();
      }
    } else {
      checkResolve();
    }
    
    // Safety timeout to force exit if processes hang
    setTimeout(() => resolve(), 3000);
  });
}

// ─── DATABASE BACKUPS ────────────────────────────────────────────────────────
function runBackup() {
  const dateStr = new Date().toISOString().slice(0, 10);
  const timeStr = new Date().toTimeString().slice(0, 8).replace(/:/g, '');
  const fileName = `backup-${dateStr}-${timeStr}.sql`;
  const backupPath = path.join(BACKUPS_DIR, fileName);

  logElectron(`Executing database auto-backup to: ${backupPath}`);
  
  try {
    const backupFileStream = fs.createWriteStream(backupPath);
    const dumpProcess = spawn(MYSQLDUMP_EXE, [
      '-u', 'root',
      '--port=3308',
      `-p${appConfig.dbPassword}`,
      '--databases', 'animasys_erp'
    ]);
    
    dumpProcess.stdout.pipe(backupFileStream);
    
    // Redirect stderr to our logs
    const errorStream = fs.createWriteStream(path.join(LOGS_DIR, 'backup-error.log'), { flags: 'a' });
    dumpProcess.stderr.pipe(errorStream);
    
    dumpProcess.on('close', (code) => {
      if (code === 0) {
        logElectron('Database backup successfully generated.');
        cleanOldBackups();
      } else {
        logElectron(`[ERROR] Database backup process exited with code ${code}`);
      }
    });
  } catch (err) {
    logElectron(`[ERROR] Database backup failed: ${err.message}`);
  }
}

function cleanOldBackups() {
  fs.readdir(BACKUPS_DIR, (err, files) => {
    if (err) return;
    const sqlFiles = files
      .filter(f => f.startsWith('backup-') && f.endsWith('.sql'))
      .map(f => ({ name: f, path: path.join(BACKUPS_DIR, f), time: fs.statSync(path.join(BACKUPS_DIR, f)).mtimeMs }));
    
    // Keep last 15 backups
    if (sqlFiles.length > 15) {
      sqlFiles.sort((a, b) => a.time - b.time);
      const toDelete = sqlFiles.slice(0, sqlFiles.length - 15);
      toDelete.forEach(file => {
        try {
          fs.unlinkSync(file.path);
          logElectron(`Cleaned old backup file: ${file.name}`);
        } catch (e) {
          // Ignore delete failures
        }
      });
    }
  });
}

// ─── OFFLINE LICENSING VALIDATION ───────────────────────────────────────────
function getMachineUUID() {
  try {
    const cmd = 'powershell -Command "Get-CimInstance Win32_ComputerSystemProduct | Select-Object -ExpandProperty UUID"';
    return execSync(cmd).toString().trim();
  } catch (e) {
    logElectron(`Could not retrieve UUID: ${e.message}. Using fallback.`);
    return 'FALLBACK-ANIMAL-UUID-123456';
  }
}

function loadLicenseSecret() {
  const secretPath = path.join(BIN_DIR, 'license.secret');
  try {
    const value = fs.readFileSync(secretPath, 'utf8').trim();
    return value || null;
  } catch (e) {
    logElectron(`License secret file missing or unreadable at ${secretPath}: ${e.message}`);
    return null;
  }
}

function generateLicenseKey(uuid, secret) {
  return crypto.createHmac('sha256', secret).update(uuid).digest('hex').substring(0, 16).toUpperCase();
}

function verifyLicenseKey(key) {
  const secret = loadLicenseSecret();
  if (!secret) {
    // No secret baked into this build: refuse every key rather than
    // falling back to a guessable, source-visible default.
    return false;
  }
  const uuid = getMachineUUID();
  const validKey = generateLicenseKey(uuid, secret);
  return key === validKey;
}

// ─── WINDOW CREATION & LIFECYCLE ─────────────────────────────────────────────
function createSplash() {
  splashWindow = new BrowserWindow({
    width: 450,
    height: 350,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
  splashWindow.on('closed', () => splashWindow = null);
}

function updateSplashStatus(status) {
  logElectron(`Splash Status: ${status}`);
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send('status-update', status);
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    title: "Amazon Pet",
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Load React UI served by Spring Boot
  mainWindow.loadURL('http://localhost:8080/api/index.html');

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    logElectron(`[ERROR] Main window failed to load: ${errorCode} ${errorDescription}`);
    showCrashReport(`Failed to load application UI: ${errorDescription}`);
  });

  // Links opened via window.open() (e.g. wa.me share links) go to the user's
  // default browser instead of spawning an unmanaged Electron window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.once('ready-to-show', () => {
    if (splashWindow) {
      splashWindow.close();
    }
    mainWindow.show();
    logElectron('Main application window opened.');
  });

  mainWindow.on('closed', async () => {
    mainWindow = null;
    runBackup(); // Auto backup on app close
    await stopProcesses();
    app.quit();
  });
}

function showCrashReport(errorMsg) {
  logElectron(`[FATAL] ${errorMsg}`);
  if (splashWindow) splashWindow.close();

  const crashHtmlPath = path.join(LOGS_DIR, 'crash-report.html');
  const safeMsg = String(errorMsg)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  const safeLogs = String(LOGS_DIR)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>System Crash Diagnostic</title>
  <style>
    body { font-family: Segoe UI, sans-serif; padding: 24px; background: #fafafa; color: #333; margin: 0; }
    h2 { color: #d32f2f; margin-top: 0; }
    .box { background: #eee; padding: 14px; border-radius: 6px; font-family: Consolas, monospace; font-size: 13px; color: #444; white-space: pre-wrap; word-break: break-word; }
    .meta { margin-top: 18px; font-size: 12px; color: #888; }
    button { margin-top: 16px; padding: 10px 20px; background: #333; color: #fff; border: none; border-radius: 4px; cursor: pointer; }
  </style>
</head>
<body>
  <h2>Critical System Error</h2>
  <p>Amazon Pet was unable to start system services.</p>
  <div class="box">${safeMsg}</div>
  <p class="meta">Log location: ${safeLogs}</p>
  <button onclick="window.close()">Close</button>
</body>
</html>`;

  try {
    fs.writeFileSync(crashHtmlPath, html, 'utf8');
  } catch (e) {
    logElectron(`[WARN] Could not write crash HTML: ${e.message}`);
  }

  const crashWin = new BrowserWindow({
    width: 640,
    height: 420,
    title: 'System Crash Diagnostic',
    resizable: true,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  crashWin.setMenuBarVisibility(false);
  if (fs.existsSync(crashHtmlPath)) {
    crashWin.loadFile(crashHtmlPath);
  } else {
    crashWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  }
}

// ─── IPC ROUTING ─────────────────────────────────────────────────────────────
ipcMain.handle('get-app-version', () => app.getVersion());
ipcMain.handle('get-db-status', async () => {
  const dbUp = await isPortInUse(3308);
  return dbUp ? 'Online' : 'Offline';
});
ipcMain.handle('trigger-backup', () => {
  runBackup();
  return 'Backup Initiated';
});
ipcMain.handle('get-license-status', () => {
  return {
    registered: appConfig.registered,
    uuid: getMachineUUID()
  };
});
// ─── RECEIPT PRINTER TARGETING ──────────────────────────────────────────────
// Windows always keeps virtual "printers" (Print to PDF, XPS, Fax, OneNote) installed
// alongside the real receipt printer. If one of those was ever used last / set as
// default, the native print dialog opens on it and the cashier prints an A4 PDF
// instead of the 80mm roll. We can't preselect a printer in that dialog via Electron's
// print API (deviceName only applies to silent printing), so instead we point the
// OS's actual default printer at the real receipt printer right before the dialog opens.
const VIRTUAL_PRINTER_HINTS = ['pdf', 'xps', 'onenote', 'fax', 'send to'];

function isVirtualPrinter(name) {
  const n = (name || '').toLowerCase();
  return VIRTUAL_PRINTER_HINTS.some((hint) => n.includes(hint));
}

function setWindowsDefaultPrinter(printerName) {
  return new Promise((resolve) => {
    execFile('rundll32', ['printui.dll,PrintUIEntry', '/y', '/n', printerName], (err) => {
      if (err) {
        logElectron(`[WARN] Failed to set default printer to "${printerName}": ${err.message}`);
        resolve(false);
      } else {
        logElectron(`Default printer set to "${printerName}" for receipt printing.`);
        resolve(true);
      }
    });
  });
}

ipcMain.handle('list-printers', async () => {
  if (!mainWindow) return [];
  try {
    return await mainWindow.webContents.getPrintersAsync();
  } catch (e) {
    logElectron(`[ERROR] Failed to list printers: ${e.message}`);
    return [];
  }
});

// Called right before the receipt print dialog opens. If the shop's one physical
// printer isn't already the OS default (e.g. the default drifted to "Microsoft Print
// to PDF"), switch the OS default to it so the dialog opens pointed at the real printer.
ipcMain.handle('ensure-receipt-printer-default', async () => {
  if (!mainWindow) return { success: false, reason: 'no-window' };
  try {
    const printers = await mainWindow.webContents.getPrintersAsync();
    const currentDefault = printers.find((p) => p.isDefault);
    if (currentDefault && !isVirtualPrinter(currentDefault.name)) {
      return { success: true, printerName: currentDefault.name, changed: false };
    }
    const physicalPrinters = printers.filter((p) => !isVirtualPrinter(p.name));
    if (physicalPrinters.length === 0) {
      return { success: false, reason: 'no-physical-printer' };
    }
    const target = physicalPrinters[0];
    const changed = await setWindowsDefaultPrinter(target.name);
    return { success: changed, printerName: target.name, changed };
  } catch (e) {
    logElectron(`[ERROR] ensure-receipt-printer-default failed: ${e.message}`);
    return { success: false, reason: e.message };
  }
});

ipcMain.handle('save-invoice-pdf', async (event, { html, fileName }) => {
  if (!mainWindow) return { success: false, error: 'no-window' };

  const tmpPath = path.join(os.tmpdir(), `amazonpet-invoice-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.html`);
  let pdfWindow = null;
  try {
    fs.writeFileSync(tmpPath, String(html || ''), 'utf8');

    pdfWindow = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
    await pdfWindow.loadFile(tmpPath);

    const pdfBuffer = await pdfWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { marginType: 'none' },
    });

    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'حفظ الفاتورة كملف PDF',
      defaultPath: fileName || 'invoice.pdf',
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
    });

    if (canceled || !filePath) {
      return { success: false, canceled: true };
    }

    fs.writeFileSync(filePath, pdfBuffer);
    logElectron(`Invoice PDF exported: ${filePath}`);
    return { success: true, filePath };
  } catch (err) {
    logElectron(`[ERROR] Failed to export invoice PDF: ${err.message}`);
    return { success: false, error: err.message };
  } finally {
    if (pdfWindow && !pdfWindow.isDestroyed()) pdfWindow.destroy();
    try { fs.unlinkSync(tmpPath); } catch (_) { /* best-effort cleanup */ }
  }
});

// ─── WHATSAPP INVOICE IMAGE SHARING ─────────────────────────────────────────
// WhatsApp's wa.me links can only pre-fill text, never attach a file — there's no
// public API for that outside the paid Business API. So instead we render the same
// invoice markup used for PDF/print into an offscreen window, screenshot it as a PNG,
// and put that image on the OS clipboard so the cashier can just Ctrl+V it into the
// chat that wa.me opens. The PNG is also kept on disk as a fallback if paste fails.
ipcMain.handle('capture-invoice-image', async (event, { html, fileName }) => {
  if (!mainWindow) return { success: false, error: 'no-window' };

  const tmpHtmlPath = path.join(os.tmpdir(), `amazonpet-invoice-img-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.html`);
  let captureWindow = null;
  try {
    fs.writeFileSync(tmpHtmlPath, String(html || ''), 'utf8');

    captureWindow = new BrowserWindow({
      show: false,
      width: 900,
      height: 1200,
      webPreferences: { offscreen: true },
    });
    await captureWindow.loadFile(tmpHtmlPath);

    // Measure the invoice sheet's actual rendered size so we can shrink the window
    // to exactly fit it — capturePage() grabs the whole window, not just the content.
    const { width, height } = await captureWindow.webContents.executeJavaScript(`
      (function () {
        var el = document.querySelector('.sheet') || document.body;
        var rect = el.getBoundingClientRect();
        return { width: Math.ceil(rect.width), height: Math.ceil(rect.height) };
      })();
    `);
    captureWindow.setContentSize(Math.max(Math.ceil(width) || 0, 100), Math.max(Math.ceil(height) || 0, 100));
    // Let layout settle at the new window size before capturing.
    await new Promise((resolve) => setTimeout(resolve, 200));

    const image = await captureWindow.webContents.capturePage();
    const pngBuffer = image.toPNG();

    if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });
    const safeName = (fileName || `invoice-${Date.now()}.png`).replace(/[\\/:*?"<>|]/g, '_');
    const outPath = path.join(IMAGES_DIR, safeName);
    fs.writeFileSync(outPath, pngBuffer);

    clipboard.writeImage(nativeImage.createFromBuffer(pngBuffer));

    logElectron(`Invoice image captured and copied to clipboard: ${outPath}`);
    return { success: true, filePath: outPath };
  } catch (err) {
    logElectron(`[ERROR] Failed to capture invoice image: ${err.message}`);
    return { success: false, error: err.message };
  } finally {
    if (captureWindow && !captureWindow.isDestroyed()) captureWindow.destroy();
    try { fs.unlinkSync(tmpHtmlPath); } catch (_) { /* best-effort cleanup */ }
  }
});

ipcMain.handle('verify-license', (event, key) => {
  const isValid = verifyLicenseKey(key);
  if (isValid) {
    appConfig.registered = true;
    appConfig.licenseKey = key;
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(appConfig, null, 2), 'utf8');
    createMainWindow();
    return true;
  }
  return false;
});

// ─── APP STARTUP ─────────────────────────────────────────────────────────────
process.on('unhandledRejection', (reason) => {
  logElectron(`[ERROR] Unhandled promise rejection: ${reason instanceof Error ? reason.message : String(reason)}`);
});

app.whenReady().then(async () => {
  logElectron('Amazon Pet Launcher starting...');
  loadOrGenerateConfig();
  createSplash();

  try {
    await startMySQL();
    await startBackend();
    
    // Set 12:00 AM backup schedule timer
    setInterval(() => {
      const now = new Date();
      if (now.getHours() === 0 && now.getMinutes() === 0) {
        runBackup();
      }
    }, 60000);

    // Licensing check
    if (appConfig.registered) {
      updateSplashStatus('Opening system dashboard...');
      createMainWindow();
    } else {
      updateSplashStatus('System registration required.');
      // Open license registration window
      setTimeout(() => {
        if (splashWindow) splashWindow.close();
        openLicenseWindow();
      }, 1500);
    }
    
  } catch (err) {
    showCrashReport(`Initialization Failed: ${err.message}`);
  }
});

function openLicenseWindow() {
  const licenseWin = new BrowserWindow({
    width: 500,
    height: 400,
    title: "System Activation",
    frame: false,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  licenseWin.loadFile(path.join(__dirname, 'license.html'));
}

app.on('window-all-closed', async () => {
  if (process.platform !== 'darwin') {
    await stopProcesses();
    app.quit();
  }
});
