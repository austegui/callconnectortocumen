import fs from 'fs';
import path from 'path';

const root = process.cwd();
const source = path.join(
  root,
  'node_modules',
  '@twilio',
  'voice-sdk',
  'dist',
  'twilio.min.js'
);
const destinationDir = path.join(root, 'public', 'vendor');
const destination = path.join(destinationDir, 'twilio.min.js');

fs.mkdirSync(destinationDir, { recursive: true });
fs.copyFileSync(source, destination);

console.log(`Copied ${source} -> ${destination}`);
