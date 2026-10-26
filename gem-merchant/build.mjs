import fs from 'node:fs';
import path from 'node:path';

const root = import.meta.dirname;
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const template = read('src/index.html');
const css = read('src/style.css');
const engine = read('src/engine.js');
const art = read('src/art.js');
const net = read('src/net.js');
const ui = read('src/ui.js');

const html = template
  .replace('/*__CSS__*/', () => css)
  .replace('/*__ENGINE__*/', () => engine)
  .replace('/*__ART__*/', () => art)
  .replace('/*__NET__*/', () => net)
  .replace('/*__UI__*/', () => ui);

fs.writeFileSync(path.join(root, 'index.html'), html);

const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
console.log(`built index.html (${kb} KB)`);
