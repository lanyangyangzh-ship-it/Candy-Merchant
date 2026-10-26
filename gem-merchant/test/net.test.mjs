import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const ctx = { console, URL };
vm.createContext(ctx);
vm.runInContext(readFileSync(new URL('../src/engine.js', import.meta.url), 'utf8'), ctx);
vm.runInContext(readFileSync(new URL('../src/net.js', import.meta.url), 'utf8'), ctx);
const E = ctx.GemEngine;
const N = ctx.GemNet;

const s = E.createGame(123, { first: 0 });
s.current = 1;
s.players[0].points = 4;
s.players[1].points = 7;
s.players[2].points = 9;
s.players[3].points = 2;
s.players[0].tokens.white = 2;
s.players[1].tokens.blue = 3;
s.players[2].tokens.green = 4;
s.players[0].reserved.push(s.market[1][0]);
s.players[2].reserved.push(s.market[2][0]);
s.players[3].reserved.push(s.market[3][0]);
s.winner = 3;
s.lastEvent = {
  type: 'reserve',
  player: 0,
  blind: true,
  cardId: 'c3-red-2',
  cardName: 'III 级盲抽卡',
  seq: 10,
};
s.log = [
  { text: '你先手。', kind: 'system' },
  { text: '你拿取 钻石、蓝宝石、祖母绿', kind: 'take' },
  { text: '罗伦佐预订了【红宝石矿脉】', kind: 'reserve' },
  { text: '碧翠丝购得【蓝宝石工坊】', kind: 'buy' },
];

const view = N.viewState(s, 2);
assert.notEqual(view, s);
assert.equal(view.players.length, 4);
assert.equal(view.players[0].points, 9);
assert.equal(view.players[0].name, '你');
assert.equal(view.players[1].points, 2);
assert.equal(view.players[2].points, 4);
assert.equal(view.players[3].points, 7);
assert.equal(view.current, 3);
assert.equal(view.firstPlayer, 2);
assert.equal(view.winner, 1);
assert.equal(view.seed, 0);
assert.equal(view.decks[1].length, s.decks[1].length);
assert.ok(view.decks[1].every((c) => c.hidden));
assert.equal(view.players[0].reserved.length, 1);
assert.ok(view.players[0].reserved.every((c) => !c.hidden), 'viewer reserved stays visible');
assert.ok(view.players[1].reserved.every((c) => c.hidden));
assert.ok(view.players[2].reserved.every((c) => c.hidden));
assert.ok(view.players[3].reserved.every((c) => c.hidden));
assert.equal(view.lastEvent.player, 2);
assert.equal(view.lastEvent.cardId, 'hidden');
assert.ok(!view.log.some((entry) => entry.kind === 'reserve'), 'reserve logs must not leak card names');

const loaded = E.loadState(JSON.stringify(view));
assert.ok(loaded, 'guest view must load through the engine');
assert.equal(loaded.players[0].points, 9);
assert.equal(loaded.current, 3);
assert.equal(loaded.decks[1][0].hidden, true);

const over = E.createGame(7, { first: 0 });
over.phase = 'over';
over.winner = 2;
over.players[2].points = 16;
const overView = N.viewState(over, 1);
assert.equal(overView.winner, 1);
assert.equal(overView.players[0].points, 0);
assert.equal(overView.players[1].points, 16);

// URLs
const loc = { href: 'https://game.example/play/index.html?room=ABCD', protocol: 'https:', host: 'game.example' };
assert.equal(N.defaultServerUrl(loc), 'wss://game.example/ws');
assert.equal(N.normalizeServerUrl('http://example.com:9000', loc), 'wss://example.com:9000/ws');
assert.equal(N.normalizeServerUrl('wss://example.com/socket', loc), 'wss://example.com/socket');
assert.equal(N.normalizeServerUrl('ws://localhost:8787/ws', { protocol: 'http:', host: 'x', href: 'http://x/' }), 'ws://localhost:8787/ws');
assert.equal(N.normalizeServerUrl('', loc), 'wss://game.example/ws');
assert.equal(N.normalizeServerUrl('ftp://x', loc), null);
assert.equal(N.roomFromUrl(loc), 'ABCD');
assert.equal(N.shareUrl(loc, 'WXYZ', 'wss://game.example/ws'), 'https://game.example/play/index.html?room=WXYZ');
assert.equal(N.shareUrl(loc, 'WXYZ', 'wss://other.example/ws'), 'https://game.example/play/index.html?server=wss%3A%2F%2Fother.example%2Fws&room=WXYZ');

console.log('ALL NET TESTS PASSED');
