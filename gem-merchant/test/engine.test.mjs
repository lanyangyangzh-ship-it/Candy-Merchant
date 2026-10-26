import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const code = readFileSync(new URL('../src/engine.js', import.meta.url), 'utf8');
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(code, ctx, { filename: 'engine.js' });
const E = ctx.GemEngine;
if (!E) throw new Error('GemEngine did not load');

const GEMS = E.COLORS.concat('gold');
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

function invariants(state) {
  let all = [];
  for (const level of [1, 2, 3]) {
    all.push(...state.decks[level]);
    all.push(...state.market[level].filter(Boolean));
    assert.equal(state.market[level].length, 4, `market ${level} row must have 4 slots`);
    assert.ok(state.market[level].every((c) => c === null || c.level === level));
  }
  for (const p of state.players) {
    all.push(...p.cards, ...p.reserved);
    assert.ok(p.reserved.length <= 3, 'reserved <= 3');
    assert.equal(p.bonuses.white, p.cards.filter((c) => c.bonus === 'white').length);
    assert.equal(p.bonuses.blue, p.cards.filter((c) => c.bonus === 'blue').length);
    assert.equal(p.bonuses.green, p.cards.filter((c) => c.bonus === 'green').length);
    assert.equal(p.bonuses.red, p.cards.filter((c) => c.bonus === 'red').length);
    assert.equal(p.bonuses.black, p.cards.filter((c) => c.bonus === 'black').length);
    const expected = p.cards.reduce((s, c) => s + c.points, 0) + p.nobles.length * 3;
    assert.equal(p.points, expected, 'points must match cards + nobles');
    if (state.phase !== 'discard' && state.phase !== 'over') {
      assert.ok(sum(p.tokens) <= 10, 'token limit at stable state');
    }
    for (const g of GEMS) assert.ok(p.tokens[g] >= 0);
  }
  assert.equal(all.length, 90, 'all 90 cards must be accounted for');
  assert.equal(new Set(all.map((c) => c.id)).size, 90, 'no duplicate cards in zones');

  let tokens = sum(state.bank);
  for (const p of state.players) tokens += sum(p.tokens);
  assert.equal(tokens, 55, 'all 55 tokens must be accounted for');
  for (const g of GEMS) assert.ok(state.bank[g] >= 0, `bank ${g} >= 0`);
  assert.ok(state.nobles.length + state.players.reduce((s, p) => s + p.nobles.length, 0) === 5);
}

function fresh(seed = 1, options = {}) {
  return E.createGame(seed, options);
}
function freshAI(seed = 1, options = {}) {
  return E.createGame(seed, Object.assign({ bothAI: true }, options));
}

// ---------- 牌堆完整性 ----------
{
  const cards = E.buildCards();
  assert.equal(cards.length, 90);
  assert.equal(cards.filter((c) => c.level === 1).length, 40);
  assert.equal(cards.filter((c) => c.level === 2).length, 30);
  assert.equal(cards.filter((c) => c.level === 3).length, 20);
  for (const color of E.COLORS) {
    assert.equal(cards.filter((c) => c.bonus === color && c.level === 1).length, 8);
    assert.equal(cards.filter((c) => c.bonus === color && c.level === 2).length, 6);
    assert.equal(cards.filter((c) => c.bonus === color && c.level === 3).length, 4);
  }
  const totalPoints = cards.reduce((s, c) => s + c.points, 0);
  assert.equal(totalPoints, 140);
  for (const c of cards) {
    assert.equal(Object.keys(c.cost).length, 5);
    assert.ok(Object.values(c.cost).every((n) => n >= 0) && Object.values(c.cost).some((n) => n > 0));
  }

  const nobles = E.buildNobles();
  assert.equal(nobles.length, 10);
  assert.ok(nobles.every((n) => n.points === 3));
  for (const n of nobles) {
    const req = Object.values(n.req);
    const total = req.reduce((a, b) => a + b, 0);
    assert.ok(total === 9 || total === 8, `noble requirement total ${total}`);
  }
}

// ---------- 初始局面 ----------
{
  const s = fresh(7);
  invariants(s);
  assert.equal(s.current, 0);
  assert.equal(s.phase, 'play');
  assert.equal(s.bank.gold, 5);
  for (const c of E.COLORS) assert.equal(s.bank[c], 10);
  assert.equal(s.nobles.length, 5);
  assert.equal(s.players.length, 4);
  assert.equal(s.players[0].tokens.gold, 0);
  assert.equal(s.players[0].points, 0);
}

// ---------- 拿宝石 ----------
{
  const s = fresh(11);
  s.current = 0;
  assert.equal(E.takeTokens(s, 0, ['blue', 'blue']).ok, true);
  assert.equal(s.players[0].tokens.blue, 2);
  assert.equal(s.bank.blue, 8);
  assert.equal(s.current, 1);

  const s2 = fresh(12);
  s2.current = 0;
  s2.bank.blue = 3;
  const r = E.takeTokens(s2, 0, ['blue', 'blue']);
  assert.equal(r.ok, false);

  const s3 = fresh(13);
  s3.current = 0;
  assert.equal(E.takeTokens(s3, 0, ['white', 'blue', 'green']).ok, true);
  assert.equal(s3.players[0].tokens.white, 1);
  assert.equal(s3.players[0].tokens.blue, 1);
  assert.equal(s3.players[0].tokens.green, 1);

  const s4 = fresh(14);
  s4.current = 0;
  assert.equal(E.takeTokens(s4, 0, ['white', 'blue']).ok, false, 'two different is not legal');
  assert.equal(E.takeTokens(s4, 0, ['gold']).ok, false, 'gold cannot be taken directly');
}

// ---------- 弃牌到 10 枚 ----------
{
  const s = fresh(21);
  s.current = 0;
  s.players[0].tokens = { white: 3, blue: 2, green: 2, red: 1, black: 1, gold: 0 };
  assert.equal(sum(s.players[0].tokens), 9);
  assert.equal(E.takeTokens(s, 0, ['white', 'blue', 'green']).ok, true);
  assert.equal(s.phase, 'discard');
  assert.equal(s.pending.returnCount, 2);
  assert.equal(s.current, 0);
  E.discardToken(s, 'red');
  assert.equal(s.phase, 'discard');
  E.discardToken(s, 'black');
  assert.equal(s.phase, 'play');
  assert.equal(s.current, 1);
  assert.equal(sum(s.players[0].tokens), 10);
}

// ---------- 预订与黄金 ----------
{
  const s = fresh(31);
  s.current = 0;
  const card = s.market[1][0];
  const r = E.reserveCard(s, 0, card.id);
  assert.equal(r.ok, true);
  assert.equal(s.players[0].reserved.length, 1);
  assert.equal(s.players[0].tokens.gold, 1);
  assert.equal(s.bank.gold, 4);
  assert.equal(s.current, 1);

  const s2 = fresh(32);
  s2.current = 0;
  for (let i = 0; i < 3; i++) {
    const c = s2.market[1][0];
    assert.equal(E.reserveCard(s2, 0, c.id).ok, true);
    s2.current = 0;
    s2.phase = 'play';
  }
  assert.equal(s2.players[0].reserved.length, 3);
  const extra = s2.market[1][0];
  assert.equal(E.reserveCard(s2, 0, extra.id).ok, false, 'cannot reserve a 4th card');

  const s3 = fresh(33);
  s3.current = 0;
  s3.bank.gold = 0;
  assert.equal(E.reserveCard(s3, 0, s3.market[2][0].id).ok, true);
  assert.equal(s3.players[0].tokens.gold, 0);

  const s4 = fresh(34);
  s4.current = 0;
  const blind = E.reserveCard(s4, 0, null, { blindLevel: 3 });
  assert.equal(blind.ok, true);
  assert.equal(s4.players[0].reserved.length, 1);
  assert.equal(s4.players[0].reserved[0].level, 3);
}

// ---------- 购买 / 黄金补足 ----------
{
  const s = fresh(41);
  s.current = 0;
  const p = s.players[0];
  p.tokens.gold = 5;
  const card = s.market[1].find((c) => Object.values(c.cost).reduce((a, b) => a + b, 0) <= 5);
  assert.ok(card);
  const totalCost = Object.values(card.cost).reduce((a, b) => a + b, 0);
  const goldBefore = s.bank.gold;
  const r = E.buyCard(s, 0, card.id);
  assert.equal(r.ok, true);
  assert.equal(p.tokens.gold, 5 - totalCost);
  assert.equal(s.bank.gold, goldBefore + totalCost);
  assert.equal(p.cards.length, 1);
  assert.equal(p.bonuses[card.bonus], 1);
  assert.equal(p.points, card.points);
  assert.equal(E.locateCard(s, card.id), null);
  assert.ok(p.cards.some((c) => c.id === card.id));
}

// 购买使用彩色宝石 + 黄金
{
  const s = fresh(42);
  s.current = 0;
  const p = s.players[0];
  const card = s.market[1].find((c) => {
    const t = Object.values(c.cost).reduce((a, b) => a + b, 0);
    return t >= 4 && t <= 5;
  });
  const color = Object.keys(card.cost).find((c) => card.cost[c] > 0);
  const total = Object.values(card.cost).reduce((a, b) => a + b, 0);
  p.tokens[color] = 1;
  p.tokens.gold = total - 1;
  const r = E.buyCard(s, 0, card.id);
  assert.equal(r.ok, true);
  assert.equal(s.players[0].tokens[color], 0);
  assert.equal(s.players[0].tokens.gold, 0);
}

// 不能买对手预订的卡
{
  const s = fresh(43);
  s.current = 1;
  const card = s.market[1][0];
  assert.equal(E.reserveCard(s, 1, card.id).ok, true);
  s.current = 0;
  s.phase = 'play';
  assert.equal(E.buyCard(s, 0, card.id).ok, false);
}

// ---------- 贵族 ----------
{
  const s = fresh(51);
  s.current = 0;
  const noble = s.nobles[0];
  s.nobles = [noble];
  s.players[0].bonuses = Object.assign({}, noble.req);
  s.players[0].points = 0;
  E._internal.afterAction(s);
  assert.equal(s.players[0].points, 3);
  assert.equal(s.players[0].nobles.length, 1);
  assert.equal(s.nobles.length, 0);
}

// ---------- 最后一轮：先手触发，其余 3 人补完本轮 ----------
{
  const s = freshAI(61, { first: 0 });
  s.current = 0;
  s.players[0].points = 15;
  E._internal.afterAction(s);
  assert.equal(s.phase, 'play');
  assert.equal(s.current, 1);
  assert.equal(s.endTriggered, true);
  assert.equal(s.finalTurnsLeft, 3);
  assert.equal(s.winner, null);
  E.aiPlay(s);
  E.aiPlay(s);
  E.aiPlay(s);
  assert.equal(s.phase, 'over');
  assert.ok(s.winner >= -1 && s.winner <= 3);
}

// ---------- 最后一轮：第二人触发，后两人补完 ----------
{
  const s = freshAI(62, { first: 0 });
  s.current = 1;
  s.players[1].points = 15;
  E._internal.afterAction(s);
  assert.equal(s.phase, 'play');
  assert.equal(s.current, 2);
  assert.equal(s.finalTurnsLeft, 2);
  E.aiPlay(s);
  assert.equal(s.current, 3);
  E.aiPlay(s);
  assert.equal(s.phase, 'over');
}

// ---------- 最后一轮：末位触发，立即结束 ----------
{
  const s = freshAI(63, { first: 0 });
  s.current = 3;
  s.players[3].points = 15;
  E._internal.afterAction(s);
  assert.equal(s.phase, 'over');
  assert.equal(s.winner, 3);
}

// ---------- 存档读取 ----------
{
  const s = freshAI(71);
  for (let i = 0; i < 8 && s.phase !== 'over'; i++) E.aiPlay(s);
  const raw = E.serialize(s);
  const loaded = E.loadState(raw);
  assert.ok(loaded);
  assert.equal(loaded.current, s.current);
  assert.equal(loaded.players[0].points, s.players[0].points);
  assert.equal(loaded.players[1].reserved.length, s.players[1].reserved.length);
  for (const level of [1, 2, 3]) {
    assert.equal(loaded.market[level].length, 4);
    assert.equal(loaded.decks[level].length, s.decks[level].length);
  }
  const cardId = loaded.market[1][0].id;
  assert.ok(E.locateCard(loaded, cardId));
  invariants(loaded);
  let guard = 0;
  while (loaded.phase !== 'over' && guard++ < 400) E.aiPlay(loaded);
  assert.equal(loaded.phase, 'over');
  invariants(loaded);
}

// ---------- 大量自对弈 ----------
const stats = { games: 0, turns: 0, scores: [0, 0, 0, 0], wins: [0, 0, 0, 0, 0], actions: {}, fallbacks: 0, maxTurns: 0 };
const startedAt = Date.now();
const GAMES = 200;
for (let g = 0; g < GAMES; g++) {
  const s = freshAI(1000 + g);
  let guard = 0;
  while (s.phase !== 'over' && guard++ < 300) {
    if (s.phase !== 'play') {
      // AI 应该自动处理这些阶段，出现这里说明流程有问题
      throw new Error(`unexpected phase ${s.phase} at turn ${s.turnCount}`);
    }
    const beforePoints = s.players.reduce((sum, p) => sum + p.points, 0);
    const ok = E.aiPlay(s);
    if (!ok) throw new Error(`AI failed to act at turn ${s.turnCount}`);
    const ev = s.lastEvent;
    if (ev) stats.actions[ev.type] = (stats.actions[ev.type] || 0) + 1;
    if (s.log.some((l) => l.text.includes('跳过'))) stats.fallbacks++;
    invariantDuringAI(s);
    if (s.players.reduce((sum, p) => sum + p.points, 0) === beforePoints && s.phase !== 'over') {
      // 可能只是拿了宝石
    }
  }
  assert.equal(s.phase, 'over', `game ${g} did not finish`);
  invariants(s);
  stats.games++;
  stats.turns += s.turnCount;
  for (let i = 0; i < 4; i++) stats.scores[i] += s.players[i].points;
  stats.wins[s.winner === -1 ? 4 : s.winner]++;
  stats.maxTurns = Math.max(stats.maxTurns, s.turnCount);
}

function invariantDuringAI(s) {
  // 每回合结束后的基本完整性（不检查 10 枚上限，因为可能正处于弃牌阶段）
  let all = [];
  for (const level of [1, 2, 3]) {
    all.push(...s.decks[level], ...s.market[level].filter(Boolean));
    assert.equal(s.market[level].length, 4);
  }
  for (const p of s.players) all.push(...p.cards, ...p.reserved);
  assert.equal(all.length, 90);
  assert.equal(new Set(all.map((c) => c.id)).size, 90);
  for (const g of GEMS) assert.ok(s.bank[g] >= 0);
  let tokens = sum(s.bank);
  for (const p of s.players) tokens += sum(p.tokens);
  assert.equal(tokens, 55);
  assert.ok(s.players.every((p) => p.reserved.length <= 3));
}

const elapsed = Date.now() - startedAt;
console.log('self-play stats:', JSON.stringify({
  games: stats.games,
  avgTurns: (stats.turns / stats.games).toFixed(1),
  avgScore: stats.scores.map((v) => (v / stats.games).toFixed(1)),
  wins: stats.wins,
  maxTurns: stats.maxTurns,
  fallbacks: stats.fallbacks,
  actions: stats.actions,
  ms: elapsed,
}, null, 2));

console.log('All engine tests passed.');
