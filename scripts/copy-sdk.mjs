import fs from 'fs';
import path from 'path';

const root = process.cwd();
const destinationDir = path.join(root, 'public', 'vendor');

fs.mkdirSync(destinationDir, { recursive: true });

const files = [
  {
    source: path.join(root, 'node_modules', '@twilio', 'voice-sdk', 'dist', 'twilio.min.js'),
    destination: path.join(destinationDir, 'twilio.min.js')
  }
];

for (const file of files) {
  fs.copyFileSync(file.source, file.destination);
  console.log(`Copied ${file.source} -> ${file.destination}`);
}
