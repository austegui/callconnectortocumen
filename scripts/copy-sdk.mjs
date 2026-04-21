import fs from 'fs';
import path from 'path';

const root = process.cwd();
const destinationDir = path.join(root, 'public', 'vendor');

fs.mkdirSync(destinationDir, { recursive: true });

const files = [
  {
    source: path.join(
      root,
      'node_modules',
      'eventemitter3',
      'dist',
      'eventemitter3.umd.min.js'
    ),
    destination: path.join(destinationDir, 'eventemitter3.min.js')
  },
  {
    source: path.join(root, 'node_modules', 'livekit-client', 'dist', 'livekit-client.umd.js'),
    destination: path.join(destinationDir, 'livekit-client.umd.js')
  },
  {
    source: path.join(root, 'node_modules', 'retell-client-js-sdk', 'dist', 'index.umd.js'),
    destination: path.join(destinationDir, 'inferencia-assistant.umd.js')
  }
];

for (const file of files) {
  fs.copyFileSync(file.source, file.destination);
  console.log(`Copied ${file.source} -> ${file.destination}`);
}
