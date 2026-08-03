const crypto = require('crypto');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const secret = process.env.LICENSE_SECRET || 'ANIMA-ERP-SECRET-2026';

function generateLicenseKey(uuid) {
  return crypto.createHmac('sha256', secret).update(uuid).digest('hex').substring(0, 16).toUpperCase();
}

console.log('============================================');
console.log('       Amazon Pet ERP - License Key Generator');
console.log('============================================\n');

rl.question('Please enter the client Machine UUID: ', (uuid) => {
  const cleanUuid = uuid.trim();
  if (!cleanUuid) {
    console.log('Error: Machine UUID cannot be empty.');
    rl.close();
    return;
  }
  
  const key = generateLicenseKey(cleanUuid);
  console.log('\n--------------------------------------------');
  console.log(`Machine UUID:   ${cleanUuid}`);
  console.log(`Activation Key: ${key}`);
  console.log('--------------------------------------------');
  console.log('\nProvide the Activation Key above to your client.');
  rl.close();
});
