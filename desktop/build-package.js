const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.join(__dirname, '..');
const BACKEND_DIR = path.join(ROOT_DIR, 'animasys-backend');
const BACKEND_STATIC = path.join(BACKEND_DIR, 'src', 'main', 'resources', 'static');
const DESKTOP_BIN = path.join(__dirname, 'bin');
const JAR_NAME = 'animasys-backend-1.0.0.jar';

function ensureDirSync(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function copySync(src, dest) {
  fs.cpSync(src, dest, { recursive: true });
}

function buildAll() {
  try {
    console.log('=== Starting Assembly Pipeline ===');

    // 1. Build React Frontend (vite.config.ts writes into Spring Boot static/)
    console.log('\n[1/3] Compiling React Frontend...');
    execSync('npm run build', { cwd: ROOT_DIR, stdio: 'inherit' });

    const indexHtml = path.join(BACKEND_STATIC, 'index.html');
    if (!fs.existsSync(indexHtml)) {
      throw new Error(`Frontend build missing index.html at ${indexHtml}`);
    }
    console.log('React compilation complete.');

    // 2. Compile Spring Boot JAR (embeds static UI)
    console.log('\n[2/3] Packaging Spring Boot Backend JAR...');
    execSync('mvn clean package -DskipTests', { cwd: BACKEND_DIR, stdio: 'inherit' });
    console.log('Spring Boot compilation complete.');

    // 3. Copy JAR to Desktop Binaries folder
    console.log('\n[3/3] Extracting executable JAR to desktop directory...');
    ensureDirSync(DESKTOP_BIN);
    const jarSrc = path.join(BACKEND_DIR, 'target', JAR_NAME);
    if (!fs.existsSync(jarSrc)) {
      throw new Error(`Expected JAR not found: ${jarSrc}`);
    }
    const jarDest = path.join(DESKTOP_BIN, JAR_NAME);
    copySync(jarSrc, jarDest);
    console.log(`Success! Executable JAR placed at: ${jarDest}`);

    console.log('\n======================================================');
    console.log('Build completed successfully.');
    console.log('Next: npm run get-deps  (if JRE/MySQL missing)');
    console.log('Then:  npm run make-installer');
    console.log('======================================================\n');
  } catch (error) {
    console.error('\n[BUILD ERROR] Build pipeline failed:', error.message);
    process.exit(1);
  }
}

buildAll();
