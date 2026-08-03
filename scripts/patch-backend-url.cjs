const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

const ep = path.join(root, 'src/core/api/endpoints.ts');
let c = fs.readFileSync(ep, 'utf8');
if (!c.includes("from './backendUrl'")) {
  c = c.replace(
    "import { useUIStore } from '../stores/uiStore';",
    "import { useUIStore } from '../stores/uiStore';\nimport { getBackendUrl } from './backendUrl';"
  );
  c = c.replace(
    /const getBackendUrl = \(\): string =>\s*\n\s*\(localStorage\.getItem\('BACKEND_URL'\)[^;]+;\s*\n\s*\n/,
    ''
  );
  fs.writeFileSync(ep, c);
  console.log('endpoints patched');
}

const lg = path.join(root, 'src/components/ui/Login.tsx');
let l = fs.readFileSync(lg, 'utf8');
if (!l.includes('getBackendUrl')) {
  l = l.replace(
    "import { useUIStore } from '../../core/stores/uiStore';",
    "import { useUIStore } from '../../core/stores/uiStore';\nimport { getBackendUrl } from '../../core/api/backendUrl';"
  );
  l = l.replace(
    /const backendUrl = \(localStorage\.getItem\('BACKEND_URL'\)[^;]+;/,
    'const backendUrl = getBackendUrl();'
  );
  fs.writeFileSync(lg, l);
  console.log('login patched');
}
