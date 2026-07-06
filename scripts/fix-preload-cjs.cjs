const fs = require('node:fs');
const path = require('node:path');

const target = path.resolve(process.argv[2] || 'dist-electron/preload.cjs');
let source = fs.readFileSync(target, 'utf8');

source = source.replace(
  /^import \{ contextBridge as (\w+), ipcRenderer as (\w+) \} from "electron";/m,
  'const { contextBridge: $1, ipcRenderer: $2 } = require("electron");'
);

source = source.replace(/^export default (.+);$/m, '$1;');

if (/^(import|export)\s/m.test(source)) {
  throw new Error(`Preload still contains ESM syntax: ${target}`);
}

fs.writeFileSync(target, source);
