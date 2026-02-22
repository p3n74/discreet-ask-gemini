const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const envPath = path.join(root, '.env');
const backgroundPath = path.join(root, 'background.js');
const loaderPath = path.join(root, 'background.loader.js');

let key = '';
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const match = envContent.match(/GEMINI_API_KEY\s*=\s*(.+)/);
  key = match ? match[1].trim().replace(/^["']|["']$/g, '') : '';
  if (key === 'your_api_key_here') key = '';
}

let source = fs.readFileSync(backgroundPath, 'utf8');
source = source.replace(/const GEMINI_API_KEY = "";/, `const GEMINI_API_KEY = ${JSON.stringify(key)};`);
fs.writeFileSync(loaderPath, source, 'utf8');
console.log(key ? 'background.loader.js updated with key from .env' : 'background.loader.js created (no key). Add .env with GEMINI_API_KEY and run npm run config again.');
console.log('Reload the extension in chrome://extensions');
