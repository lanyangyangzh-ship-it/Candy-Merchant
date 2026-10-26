import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (file) => fs.readFileSync(path.join(here, file), 'utf8');

const ctx = { console };
vm.createContext(ctx);
vm.runInContext(read('src/engine.js'), ctx);
vm.runInContext(read('src/art.js'), ctx);
const E = ctx.GemEngine;
const A = ctx.GemArt;
const COLORS = E.COLORS;
const GEM = E.GEM;
const cards = E.buildCards();
const nobles = E.buildNobles();

const costShort = (card) => COLORS.filter((c) => card.cost[c] > 0)
  .map((c) => GEM[c].short + card.cost[c]).join(' ');
const pips = (card) => COLORS.filter((c) => card.cost[c] > 0)
  .map((c) => '<span class="rb-pip">' + A.gemSVG(c) + '<b>' + card.cost[c] + '</b></span>').join('');

function rbCard(card, opts) {
  const o = opts || {};
  const label = o.label !== false;
  return '<figure class="rb-item">' +
    '<div class="rb-card" data-level="' + card.level + '">' +
      '<div class="rb-card-inner">' +
        '<div class="rb-art">' + A.cardScene(card) + '</div>' +
        '<div class="rb-shade"></div>' +
        '<div class="rb-frame"></div>' +
        '<span class="rb-pts' + (card.points ? '' : ' zero') + '">' + card.points + '</span>' +
        '<span class="rb-level">' + E.LEVEL_NUMERALS[card.level] + '</span>' +
        '<div class="rb-cost">' + pips(card) + '</div>' +
      '</div>' +
    '</div>' +
    (label ? '<figcaption class="rb-label"><span class="rb-name">' + card.fullName + '</span>' +
      '<span class="rb-meta">' + card.points + ' 分 · ' + costShort(card) + '</span></figcaption>' : '') +
    '</figure>';
}

function nobleCard(noble) {
  const reqs = COLORS.filter((c) => noble.req[c] > 0)
    .map((c) => '<span class="rb-req">' + A.gemSVG(c) + '<b>' + noble.req[c] + '</b></span>').join('');
  return '<figure class="rb-noble"><div class="rb-noble-art">' + A.noblePortrait(noble) + '</div>' +
    '<figcaption><b>' + noble.name + '</b><em>3 分</em><span class="rb-reqs">' + reqs + '</span></figcaption></figure>';
}

const tokenCounts = { white: 10, blue: 10, green: 10, red: 10, black: 10, gold: 5 };
const tokens = ['white', 'blue', 'green', 'red', 'black', 'gold'].map((c) =>
  '<div class="token">' + A.gemSVG(c) + '<b>' + GEM[c].name + '</b><em>' + tokenCounts[c] + ' 枚</em></div>').join('');

const byId = (id) => cards.find((c) => c.id === id);
const anatomy = byId('c2-white-5');
const tiers = [byId('c1-blue-1'), byId('c2-green-0'), byId('c3-blue-1')];
const tierNames = ['一级 · 矿脉', '二级 · 工坊', '三级 · 商路'];
const tierMeta = ['40 张 · 0–1 分', '30 张 · 1–3 分', '20 张 · 3–5 分'];
const tierCopy = ['建立第一笔永久折扣。', '把矿脉变成工艺。', '远洋、沙海与王庭。'];
const tierCards = tiers.map((card, i) =>
  '<div class="tier">' + rbCard(card, { label: false }) +
  '<h4>' + tierNames[i] + '</h4><p>' + tierMeta[i] + '<br>' + tierCopy[i] + '</p></div>').join('');

const setupNobles = nobles.slice(0, 5).map((n) =>
  '<div class="setup-noble">' + A.noblePortrait(n) + '<span>' + n.name + '</span></div>').join('');
const backs = Array.from({ length: 12 }, () => '<div class="setup-back">' + A.cardBack() + '</div>').join('');
const setupTokens = ['white', 'blue', 'green', 'red', 'black', 'gold'].map((c) =>
  '<span class="setup-token">' + A.gemSVG(c) + '<b>' + tokenCounts[c] + '</b></span>').join('');

function playerPanel(name, seat, kind) {
  return '<div class="setup-player"><div class="who">' + A.merchantPortrait(kind) + '<b>' + name + '</b><em>' + seat + '</em></div>' +
    '<div class="setup-slots"><span class="setup-slot">预订</span><span class="setup-slot">预订</span><span class="setup-slot">预订</span></div></div>';
}

const setup = '<div class="setup"><div class="setup-layout">' +
  '<div class="setup-nobles"><div class="setup-lab" style="flex-basis:100%">贵族 · 随机 5 位</div>' + setupNobles + '</div>' +
  '<div class="setup-side"><div class="setup-lab">房主 / 朋友</div>' +
    playerPanel('你', '房主 · 先手', 0) + playerPanel('朋友 2', '座位 2', 2) + '</div>' +
  '<div class="setup-market"><div class="setup-lab">市场 · 3 行 × 4 列</div>' +
    '<div class="setup-market-head"><span class="tier">I / II / III</span><span class="tier">每级 4 张</span></div>' +
    '<div class="setup-market-grid">' + backs + '</div></div>' +
  '<div class="setup-side"><div class="setup-lab">朋友 / 空位</div>' +
    playerPanel('朋友 1', '座位 1', 1) + playerPanel('朋友 3', '座位 3 · AI 可补', 3) + '</div>' +
  '<div class="setup-bank"><div class="setup-lab">银行 · 每色 10 枚 + 黄金 5 枚</div><div class="setup-tokens">' + setupTokens + '</div></div>' +
  '</div></div>';

const action1 = ['blue', 'green', 'red'].map((c) => A.gemSVG(c)).join('<span class="plus">+</span>');
const action2 = A.gemSVG('green') + A.gemSVG('green') + '<span class="stock">库存 ≥ 4</span>';
const action3 = '<span class="mini-back">' + A.cardBack() + '</span>' + A.gemSVG('gold');
const action4 = '<span class="mini-back">' + A.cardBack() + '</span>' + A.gemSVG('white') + A.gemSVG('gold');

const seals =
  '<div class="seal">' + A.merchantPortrait(0) + '<b>你</b><span>白钻 · 扁帽</span></div>' +
  '<div class="seal">' + A.merchantPortrait(1) + '<b>罗伦佐</b><span>红宝石 · 宽檐帽</span></div>' +
  '<div class="seal">' + A.merchantPortrait(2) + '<b>碧翠丝</b><span>蓝宝石 · 扁帽</span></div>' +
  '<div class="seal">' + A.merchantPortrait(3) + '<b>马可</b><span>黄金 · 宽檐帽</span></div>';

const l1 = cards.filter((c) => c.level === 1);
const l2 = cards.filter((c) => c.level === 2);
const l3 = cards.filter((c) => c.level === 3);
const gallery = (list, cls) => '<div class="gallery ' + (cls || '') + '">' +
  list.map((c) => rbCard(c)).join('') + '</div>';

const hero = A.heroScene();
const defs = A.defs();

let html = read('src/rulebook.html');
const map = {
  '/*__CSS__*/': read('src/rulebook.css'),
  '__DEFS__': defs,
  '__HERO__': hero,
  '__TOKENS__': tokens,
  '__SETUP__': setup,
  '__ACTION1__': action1,
  '__ACTION2__': action2,
  '__ACTION3__': action3,
  '__ACTION4__': action4,
  '__ANATOMY_CARD__': rbCard(anatomy, { label: false }),
  '__TIER_CARDS__': tierCards,
  '__NOBLE_EXAMPLES__': nobles.slice(0, 3).map(nobleCard).join(''),
  '__NOBLE_ALL__': nobles.map(nobleCard).join(''),
  '__SEALS__': seals,
  '__GALLERY_L1A__': gallery(l1.slice(0, 20), ''),
  '__GALLERY_L1B__': gallery(l1.slice(20), ''),
  '__GALLERY_L2__': gallery(l2, 'six'),
  '__GALLERY_L3__': gallery(l3, ''),
};
for (const [key, value] of Object.entries(map)) {
  html = html.split(key).join(value);
}
const missing = html.match(/__[A-Z0-9_]+__/g) || html.match(/\/\*__[A-Z0-9_]+__\*\//g);
if (missing) throw new Error('Unreplaced placeholders: ' + [...new Set(missing)].join(', '));
fs.writeFileSync(path.join(here, 'rulebook.html'), html);
console.log('built rulebook.html (' + (Buffer.byteLength(html) / 1024).toFixed(1) + ' KB)');
console.log('cards', cards.length, 'gallery', [l1.slice(0, 20).length, l1.slice(20).length, l2.length, l3.length].join('/'), 'nobles', nobles.length);
