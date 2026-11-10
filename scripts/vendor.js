// Copies third-party browser modules from node_modules into public/vendor.
// Run `npm run vendor` after updating qrcode-generator.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(resolve(root, 'public/vendor'), { recursive: true });
copyFileSync(
  resolve(root, 'node_modules/qrcode-generator/dist/qrcode.mjs'),
  resolve(root, 'public/vendor/qrcode.mjs'),
);
console.log('vendored qrcode-generator -> public/vendor/qrcode.mjs');
