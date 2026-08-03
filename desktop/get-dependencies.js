const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');
const { URL } = require('url');

const DESKTOP_BIN = path.join(__dirname, 'bin');
const JRE_ZIP = path.join(DESKTOP_BIN, 'jre.zip');
const MYSQL_ZIP = path.join(DESKTOP_BIN, 'mysql.zip');

const JRE_URL = 'https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jre/hotspot/normal/eclipse?project=jdk';
// Direct Akamai CDN Link which does not return 403 Forbidden
const MYSQL_URL = 'https://cdn.mysql.com/archives/mysql-8.0/mysql-8.0.36-winx64.zip';

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    log(`Downloading: ${url} ...`);
    const file = fs.createWriteStream(destPath);
    
    const request = (targetUrl) => {
      const parsedUrl = new URL(targetUrl);
      const options = {
        protocol: parsedUrl.protocol,
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      };

      https.get(options, (response) => {
        if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
          // Handle redirects
          request(response.headers.location);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: Status Code ${response.statusCode}`));
          return;
        }

        response.pipe(file);
        
        file.on('finish', () => {
          file.close();
          log('Download complete.');
          resolve();
        });
      }).on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    };

    request(url);
  });
}

function extractZip(zipPath, targetFolder) {
  log(`Extracting ${path.basename(zipPath)} using native tar...`);
  fs.mkdirSync(targetFolder, { recursive: true });
  // Windows 10/11 tar command can extract zip files natively!
  execSync(`tar -xf "${zipPath}" -C "${targetFolder}"`);
  log('Extraction complete.');
}

function log(msg) {
  console.log(`[GET-DEPS] ${msg}`);
}

async function main() {
  try {
    fs.mkdirSync(DESKTOP_BIN, { recursive: true });

    // 1. Download & Extract JRE
    const jrePath = path.join(DESKTOP_BIN, 'jre');
    if (!fs.existsSync(jrePath)) {
      log('--- Setting up Portable JRE (Java 17) ---');
      await downloadFile(JRE_URL, JRE_ZIP);
      
      const tempExtractJre = path.join(DESKTOP_BIN, 'temp_jre');
      extractZip(JRE_ZIP, tempExtractJre);
      
      // Find the extracted folder inside the temp folder and rename it to 'jre'
      const folders = fs.readdirSync(tempExtractJre);
      const jreSubFolder = folders.find(f => fs.statSync(path.join(tempExtractJre, f)).isDirectory());
      
      if (jreSubFolder) {
        fs.renameSync(path.join(tempExtractJre, jreSubFolder), jrePath);
      }
      
      // Cleanup temp
      fs.rmSync(tempExtractJre, { recursive: true, force: true });
      fs.unlinkSync(JRE_ZIP);
      log('Portable JRE successfully configured.');
    } else {
      log('Portable JRE already exists. Skipping.');
    }

    // 2. Download & Extract MySQL
    const mysqlPath = path.join(DESKTOP_BIN, 'mysql');
    if (!fs.existsSync(mysqlPath)) {
      log('--- Setting up Portable MySQL 8.0 ---');
      await downloadFile(MYSQL_URL, MYSQL_ZIP);
      
      const tempExtractMysql = path.join(DESKTOP_BIN, 'temp_mysql');
      extractZip(MYSQL_ZIP, tempExtractMysql);
      
      // Find the extracted folder inside the temp folder and rename it to 'mysql'
      const folders = fs.readdirSync(tempExtractMysql);
      const mysqlSubFolder = folders.find(f => fs.statSync(path.join(tempExtractMysql, f)).isDirectory());
      
      if (mysqlSubFolder) {
        fs.renameSync(path.join(tempExtractMysql, mysqlSubFolder), mysqlPath);
      }
      
      // Cleanup temp
      fs.rmSync(tempExtractMysql, { recursive: true, force: true });
      fs.unlinkSync(MYSQL_ZIP);
      log('Portable MySQL successfully configured.');
    } else {
      log('Portable MySQL already exists. Skipping.');
    }

    log('All portable dependencies successfully configured!');

  } catch (error) {
    log(`[ERROR] Failed to configure dependencies: ${error.message}`);
    process.exit(1);
  }
}

main();
