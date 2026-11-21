#!/usr/bin/env node
// Copies the Expo web export (dist/) into desktop/app for Electron to serve.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const src = path.join(root, 'dist');
const dest = path.join(root, 'desktop', 'app');
if (!fs.existsSync(path.join(src, 'index.html'))) {
  console.error('dist/index.html not found. Run `npx expo export --platform web` first.');
  process.exit(1);
}
fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true });
console.log('Copied web build to', path.relative(root, dest));
