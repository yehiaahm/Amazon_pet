/**
 * Full desktop installer pipeline:
 *  1) Ensure portable JRE + MySQL exist
 *  2) Build React + Spring Boot JAR into desktop/bin
 *  3) Package Electron win-unpacked via electron-builder
 *  4) Compile Inno Setup installer → ../installer/AmazonPet_Setup_vX.Y.Z.exe
 */
const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const DESKTOP_DIR = __dirname;
const ROOT_DIR = path.join(DESKTOP_DIR, '..');
const BIN_DIR = path.join(DESKTOP_DIR, 'bin');
const SETUP_ISS = path.join(DESKTOP_DIR, 'setup.iss');
const ICON_ICO = path.join(DESKTOP_DIR, 'icon.ico');

const ISCC_CANDIDATES = [
  process.env.ISCC_PATH,
  'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe',
  'C:\\Program Files\\Inno Setup 6\\ISCC.exe'
].filter(Boolean);

function log(msg) {
  console.log(`\n[INSTALLER] ${msg}`);
}

function run(cmd, opts = {}) {
  log(`$ ${cmd}`);
  execSync(cmd, { cwd: opts.cwd || DESKTOP_DIR, stdio: 'inherit', env: process.env });
}

function findIscc() {
  for (const candidate of ISCC_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function ensureIcon() {
  if (fs.existsSync(ICON_ICO)) {
    const size = fs.statSync(ICON_ICO).size;
    if (size > 1024) {
      log('icon.ico already present.');
      return;
    }
    log('icon.ico too small — regenerating...');
  } else {
    log('Generating icon.ico...');
  }
  run('node generate-icon.js');
}

function assertDeps() {
  const jar = path.join(BIN_DIR, 'animasys-backend-1.0.0.jar');
  const javaw = path.join(BIN_DIR, 'jre', 'bin', 'javaw.exe');
  const mysqld = path.join(BIN_DIR, 'mysql', 'bin', 'mysqld.exe');

  const missing = [];
  if (!fs.existsSync(jar)) missing.push(jar);
  if (!fs.existsSync(javaw)) missing.push(javaw);
  if (!fs.existsSync(mysqld)) missing.push(mysqld);

  if (missing.length) {
    throw new Error(
      'Missing required desktop binaries:\n  - ' +
        missing.join('\n  - ') +
        '\nRun: npm run get-deps && npm run build-app'
    );
  }
}

function assertWinUnpacked(packagedDir) {
  const winUnpacked = path.join(packagedDir, 'win-unpacked');
  const exe = path.join(winUnpacked, 'Amazon Pet.exe');
  if (!fs.existsSync(exe)) {
    throw new Error(`Electron package missing: ${exe}`);
  }
  const resJar = path.join(winUnpacked, 'resources', 'bin', 'animasys-backend-1.0.0.jar');
  if (!fs.existsSync(resJar)) {
    throw new Error(`Packaged JAR missing: ${resJar}`);
  }
}

function main() {
  const skipBuild = process.argv.includes('--skip-build');
  const skipDeps = process.argv.includes('--skip-deps');

  log('Amazon Pet ERP — desktop installer build');

  ensureIcon();

  if (!skipDeps) {
    const javaw = path.join(BIN_DIR, 'jre', 'bin', 'javaw.exe');
    const mysqld = path.join(BIN_DIR, 'mysql', 'bin', 'mysqld.exe');
    if (!fs.existsSync(javaw) || !fs.existsSync(mysqld)) {
      log('Fetching portable JRE + MySQL...');
      run('node get-dependencies.js');
    } else {
      log('Portable JRE + MySQL already present — skipping download.');
    }
  }

  if (!skipBuild) {
    log('Building frontend + backend JAR...');
    run('node build-package.js');
  } else {
    log('Skipping app build (--skip-build).');
  }

  assertDeps();

  // Always use a fresh unique output dir to avoid Windows file locks on prior builds
  const packagedDir = path.join(DESKTOP_DIR, `packaged-build-${Date.now()}`);
  const outName = path.basename(packagedDir);
  log(`Packaging Electron win-unpacked → ${outName}`);
  run(`npx electron-builder --win --x64 --dir -c.directories.output=${outName}`);

  assertWinUnpacked(packagedDir);

  const iscc = findIscc();
  if (!iscc) {
    throw new Error(
      'Inno Setup Compiler (ISCC.exe) not found.\n' +
        'Install Inno Setup 6 from https://jrsoftware.org/isinfo.php\n' +
        'Or set ISCC_PATH to ISCC.exe'
    );
  }

  log(`Compiling Inno Setup with: ${iscc}`);
  const installerOut = path.join(ROOT_DIR, 'installer');
  fs.mkdirSync(installerOut, { recursive: true });

  const result = spawnSync(iscc, [SETUP_ISS, `/DPackDir=${packagedDir}`], {
    cwd: DESKTOP_DIR,
    stdio: 'inherit',
    windowsHide: true
  });

  if (result.status !== 0) {
    throw new Error(`ISCC failed with exit code ${result.status}`);
  }

  log('Done.');
  log(`Installer output folder: ${installerOut}`);
  if (fs.existsSync(installerOut)) {
    for (const name of fs.readdirSync(installerOut)) {
      if (name.toLowerCase().endsWith('.exe')) {
        const full = path.join(installerOut, name);
        const mb = (fs.statSync(full).size / (1024 * 1024)).toFixed(1);
        console.log(`  → ${full} (${mb} MB)`);
      }
    }
  }
}

try {
  main();
} catch (err) {
  console.error('\n[INSTALLER ERROR]', err.message);
  process.exit(1);
}
