import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import path from 'node:path';

const ctx = { console };
vm.createContext(ctx);
vm.runInContext(readFileSync(new URL('../src/engine.js', import.meta.url), 'utf8'), ctx);
vm.runInContext(readFileSync(new URL('../src/art.js', import.meta.url), 'utf8'), ctx);
const E = ctx.GemEngine;
const A = ctx.GemArt;
const cards = E.buildCards();
const nobles = E.buildNobles();
const outDir = new URL('../.artcheck/', import.meta.url);
mkdirSync(outDir, { recursive: true });
const all = [];
let total = 0;
const hashes = new Set();
for (const card of cards) {
  const svg = A.cardScene(card);
  if (/undefined|NaN/.test(svg)) throw new Error('bad value in ' + card.id);
  if (svg.length > 12000) console.log('large', card.id, svg.length);
  const h = crypto.createHash('sha1').update(svg).digest('hex');
  if (hashes.has(h)) throw new Error('duplicate art ' + card.id);
  hashes.add(h);
  total += svg.length;
  all.push({ id: card.id, name: card.fullName, svg });
}
for (const n of nobles) all.push({ id: n.id, name: n.name, svg: A.noblePortrait(n) });
all.push({ id: 'hero', name: 'hero', svg: A.heroScene() });
all.push({ id: 'back', name: 'back', svg: A.cardBack() });
all.push({ id: 'you', name: 'you', svg: A.merchantPortrait(0) });
all.push({ id: 'rival', name: 'rival', svg: A.merchantPortrait(1) });

for (const item of all) {
  writeFileSync(new URL(item.id + '.svg', outDir), item.svg);
  const defs = A.defs();
  writeFileSync(new URL(item.id + '.full.svg', outDir), defs + item.svg);
}
console.log('cards', cards.length, 'scenes avg bytes', Math.round(total / cards.length), 'unique', hashes.size);
console.log('sample', cards[0].fullName, cards[0].id, A.cardScene(cards[0]).length);
console.log('nobles', nobles.map((n) => n.name + ':' + A.noblePortrait(n).length).join(' '));
console.log('hero', A.heroScene().length, 'back', A.cardBack().length, 'merchant', A.merchantPortrait(0).length);
