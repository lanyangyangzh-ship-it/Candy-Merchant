/*
 * 宝石商人 · 核心规则引擎
 * ------------------------------------------------------------
 * 规则遵循 Marc André 的桌游《璀璨宝石》(Splendor) 基础版。
 * 这个文件不依赖 DOM，可以直接在 Node 里跑自对弈测试。
 */
(function (global) {
  'use strict';

  const VERSION = 2;

  const COLORS = ['white', 'blue', 'green', 'red', 'black'];
  const GOLD = 'gold';
  const ALL_GEMS = COLORS.concat(GOLD);

  const GEM = {
    white: { key: 'white', name: '钻石',   short: '钻', hex: '#e9e4d4', light: '#fffdf2', dark: '#8e8874', ui: '#f1ecdd' },
    blue:  { key: 'blue',  name: '蓝宝石', short: '蓝', hex: '#3d82e8', light: '#a9ceff', dark: '#123b82', ui: '#6ea8ff' },
    green: { key: 'green', name: '祖母绿', short: '翠', hex: '#1da578', light: '#86f0c9', dark: '#07563e', ui: '#4fd4a6' },
    red:   { key: 'red',   name: '红宝石', short: '红', hex: '#d84a5c', light: '#ffa6ae', dark: '#731624', ui: '#ff7c88' },
    black: { key: 'black', name: '黑曜石', short: '墨', hex: '#444b5d', light: '#9aa4bd', dark: '#0d1018', ui: '#99a3ba' },
    gold:  { key: 'gold',  name: '黄金',   short: '金', hex: '#e2b256', light: '#fff2bd', dark: '#7a4d0d', ui: '#f0c96e' },
  };

  // 桌游原版牌堆的旋转顺序（与公开卡表数据保持一致）
  const ROT = ['white', 'black', 'red', 'green', 'blue'];

  // 每一级、每种宝石各有一套费用模板；三套模板数量相加 = 90 张卡
  const CARD_PATTERNS = {
    1: [
      { cost: [0, 1, 0, 2, 2], points: 0 },
      { cost: [0, 1, 2, 0, 0], points: 0 },
      { cost: [0, 1, 1, 1, 1], points: 0 },
      { cost: [0, 0, 0, 0, 3], points: 0 },
      { cost: [0, 0, 0, 2, 2], points: 0 },
      { cost: [0, 1, 1, 2, 1], points: 0 },
      { cost: [3, 1, 0, 0, 1], points: 0 },
      { cost: [0, 0, 0, 4, 0], points: 1 },
    ],
    2: [
      { cost: [0, 2, 2, 3, 0], points: 1 },
      { cost: [2, 0, 3, 0, 3], points: 1 },
      { cost: [0, 2, 4, 1, 0], points: 2 },
      { cost: [0, 0, 5, 0, 0], points: 2 },
      { cost: [0, 3, 5, 0, 0], points: 2 },
      { cost: [6, 0, 0, 0, 0], points: 3 },
    ],
    3: [
      { cost: [0, 3, 5, 3, 3], points: 3 },
      { cost: [0, 7, 0, 0, 0], points: 4 },
      { cost: [3, 6, 3, 0, 0], points: 4 },
      { cost: [3, 7, 0, 0, 0], points: 5 },
    ],
  };

  const NOBLE_PATTERNS = [
    [3, 3, 3, 0, 0],
    [4, 4, 0, 0, 0],
  ];

  const NOBLE_NAMES = [
    '翡翠王公', '蓝钻伯爵', '赤玉夫人', '黑曜主教', '白晶侯爵',
    '金砂亲王', '碧玺女爵', '紫晶大使', '琥珀勋爵', '月石公爵',
  ];

  const LEVEL_NAMES = { 1: '矿脉', 2: '工坊', 3: '商路' };
  const LEVEL_NUMERALS = { 1: 'I', 2: 'II', 3: 'III' };
  const CARD_VARIANTS = {
    1: ['晶簇', '深井', '暗河', '熔脉', '古门', '矿车', '晶洞', '石桥'],
    2: ['切磨台', '透镜', '金库', '熔炉', '案台', '陈列柜'],
    3: ['沙海商队', '远洋宝船', '王庭贡使', '香料之路'],
  };

  // ------------------------------------------------------------
  // 小工具
  // ------------------------------------------------------------
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(list, rng) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = list[i];
      list[i] = list[j];
      list[j] = tmp;
    }
    return list;
  }

  function zeroGems() {
    return { white: 0, blue: 0, green: 0, red: 0, black: 0, gold: 0 };
  }

  function sum(obj) {
    return Object.keys(obj).reduce((s, k) => s + obj[k], 0);
  }

  function makePlayer(name, isAI) {
    return {
      name,
      isAI: !!isAI,
      tokens: zeroGems(),
      bonuses: { white: 0, blue: 0, green: 0, red: 0, black: 0 },
      cards: [],
      reserved: [],
      nobles: [],
      points: 0,
    };
  }

  function buildCards() {
    const cards = [];
    for (const level of [1, 2, 3]) {
      for (let i = 0; i < ROT.length; i++) {
        const bonus = ROT[i];
        CARD_PATTERNS[level].forEach((pattern, pi) => {
          const cost = { white: 0, blue: 0, green: 0, red: 0, black: 0 };
          ROT.forEach((color, j) => {
            cost[color] = pattern.cost[(j + i) % 5];
          });
          const baseName = GEM[bonus].name + LEVEL_NAMES[level];
          const variantName = CARD_VARIANTS[level][pi];
          cards.push({
            id: 'c' + level + '-' + bonus + '-' + pi,
            level,
            bonus,
            points: pattern.points,
            cost,
            pattern: pi,
            variantName: variantName,
            name: baseName,
            fullName: baseName + ' · ' + variantName,
          });
        });
      }
    }
    return cards;
  }

  function buildNobles() {
    const nobles = [];
    let idx = 0;
    NOBLE_PATTERNS.forEach((pattern, pi) => {
      for (let i = 0; i < ROT.length; i++) {
        const req = { white: 0, blue: 0, green: 0, red: 0, black: 0 };
        ROT.forEach((color, j) => {
          req[color] = pattern[(j + i) % 5];
        });
        nobles.push({
          id: 'n' + pi + '-' + i,
          points: 3,
          req,
          name: NOBLE_NAMES[idx % NOBLE_NAMES.length],
        });
        idx++;
      }
    });
    return nobles;
  }

  // ------------------------------------------------------------
  // 初始化
  // ------------------------------------------------------------
  function createGame(seed, options) {
    const opts = options || {};
    let s = seed;
    if (s === undefined || s === null) {
      s = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
    }
    const rng = mulberry32(s);
    const allCards = buildCards();
    const decks = {};
    for (const level of [1, 2, 3]) {
      decks[level] = shuffle(allCards.filter((c) => c.level === level), rng);
    }
    const market = {};
    for (const level of [1, 2, 3]) {
      market[level] = decks[level].splice(0, 4);
    }
    const nobles = shuffle(buildNobles(), rng).slice(0, 5);

    const defaultSeats = [
      { name: opts.humanName || '你', isAI: false },
      { name: opts.aiName || '罗伦佐', isAI: true },
      { name: opts.aiName2 || '碧翠丝', isAI: true },
      { name: opts.aiName3 || '马可', isAI: true },
    ];
    const seats = Array.isArray(opts.seats) && opts.seats.length === 4
      ? opts.seats.map((seat, i) => ({
        name: (seat && seat.name) || defaultSeats[i].name,
        isAI: !!(seat && seat.isAI),
      }))
      : defaultSeats;

    const firstPlayer = opts.first === 1 ? 1 : 0;
    const state = {
      v: VERSION,
      seed: s,
      createdAt: Date.now(),
      finishedAt: null,
      players: seats.map((seat) => makePlayer(seat.name, seat.isAI)),
      current: firstPlayer,
      firstPlayer,
      phase: 'play',
      pending: null,
      bank: { white: 10, blue: 10, green: 10, red: 10, black: 10, gold: 5 },
      decks,
      market,
      nobles,
      turnCount: 0,
      endTriggered: false,
      finalTurnsLeft: null,
      winner: null,
      log: [],
      lastEvent: null,
      eventSeq: 0,
      meta: { mode: '4p', playerCount: 4, version: VERSION },
    };

    if (opts.bothAI) state.players.forEach((player) => { player.isAI = true; });

    log(state, state.players[firstPlayer].name + '先手。', 'system');
    return state;
  }

  // ------------------------------------------------------------
  // 查询
  // ------------------------------------------------------------
  function totalTokens(player) {
    return sum(player.tokens);
  }

  function totalCards(player) {
    return player.cards.length;
  }

  function locateCard(state, cardId) {
    if (!cardId) return null;
    for (const level of [1, 2, 3]) {
      const row = state.market[level];
      for (let index = 0; index < row.length; index++) {
        if (row[index] && row[index].id === cardId) {
          return { zone: 'market', level, index };
        }
      }
    }
    for (let p = 0; p < state.players.length; p++) {
      const reserved = state.players[p].reserved;
      for (let index = 0; index < reserved.length; index++) {
        if (reserved[index].id === cardId) {
          return { zone: 'reserved', player: p, index };
        }
      }
    }
    return null;
  }

  function cardAt(state, loc) {
    if (!loc) return null;
    if (loc.zone === 'market') return state.market[loc.level][loc.index] || null;
    if (loc.zone === 'reserved') return state.players[loc.player].reserved[loc.index] || null;
    return null;
  }

  /**
   * 计算一张卡对某位玩家的实际花费。
   * detail: 每种颜色 { cost, bonus, need, pay, gold, short }
   */
  function affordability(player, card) {
    const detail = {};
    let goldNeeded = 0;
    let tokenCost = 0;
    for (const color of COLORS) {
      const cost = card.cost[color] || 0;
      const bonus = Math.min(cost, player.bonuses[color] || 0);
      const need = Math.max(0, cost - bonus);
      const pay = Math.min(need, player.tokens[color] || 0);
      const short = need - pay;
      goldNeeded += short;
      tokenCost += pay;
      detail[color] = { cost, bonus, need, pay, gold: short, short };
    }
    return {
      ok: goldNeeded <= player.tokens.gold,
      gold: goldNeeded,
      tokenCost,
      detail,
    };
  }

  function missingByColor(player, card) {
    const by = {};
    let total = 0;
    for (const color of COLORS) {
      const n = Math.max(0, (card.cost[color] || 0) - (player.bonuses[color] || 0) - (player.tokens[color] || 0));
      by[color] = n;
      total += n;
    }
    return { by, total, afterGold: Math.max(0, total - player.tokens.gold) };
  }

  function eligibleNobles(state, player) {
    return state.nobles.filter((noble) => COLORS.every((c) => (player.bonuses[c] || 0) >= noble.req[c]));
  }

  function validateTake(state, colors) {
    if (!Array.isArray(colors) || colors.length === 0) {
      return { ok: false, reason: '请选择宝石' };
    }
    if (colors.some((c) => !COLORS.includes(c))) {
      return { ok: false, reason: '黄金只能通过预订卡牌获得' };
    }
    const uniq = Array.from(new Set(colors));
    const availableColors = COLORS.filter((c) => state.bank[c] > 0);
    if (uniq.length === 1) {
      if (colors.length === 2) {
        if (state.bank[uniq[0]] < 4) return { ok: false, reason: '库存少于 4 枚，不能拿 2 枚同色' };
        return { ok: true, kind: 'pair', color: uniq[0] };
      }
      // 极端情况：只剩一种颜色有库存时，只能拿走剩下的
      if (colors.length === 1 && availableColors.length === 1 && availableColors[0] === uniq[0]) {
        return { ok: true, kind: 'single' };
      }
      return { ok: false, reason: '同色宝石必须一次拿 2 枚' };
    }
    if (uniq.length !== colors.length) {
      return { ok: false, reason: '不能同时拿同色和异色宝石' };
    }
    if (colors.length === 3 && colors.every((c) => state.bank[c] > 0)) {
      return { ok: true, kind: 'different' };
    }
    // 极端情况下库存不足 3 种颜色时，允许拿光所有可用颜色
    if (availableColors.length < 3 && colors.length === availableColors.length && colors.every((c) => state.bank[c] > 0)) {
      return { ok: true, kind: 'different' };
    }
    if (colors.length < 3) return { ok: false, reason: '请拿 3 种不同颜色的宝石' };
    return { ok: false, reason: '所选宝石库存不足' };
  }

  // ------------------------------------------------------------
  // 日志 / 事件
  // ------------------------------------------------------------
  function log(state, text, kind) {
    state.log.push({ text, kind: kind || 'info', t: Date.now() });
    if (state.log.length > 80) state.log.shift();
  }

  function emit(state, event) {
    state.eventSeq += 1;
    state.lastEvent = Object.assign({ seq: state.eventSeq }, event);
    if (event.type === 'buy') {
      log(
        state,
        state.players[event.player].name + '购得【' + event.cardName + '】' +
          (event.points ? '，+' + event.points + ' 分' : '，+' + GEM[event.bonus].name + '折扣'),
        'buy'
      );
    } else if (event.type === 'reserve') {
      log(
        state,
        state.players[event.player].name + '预订了【' + event.cardName + '】' + (event.gold ? '，+1 黄金' : ''),
        'reserve'
      );
    } else if (event.type === 'take') {
      const names = event.colors.map((c) => GEM[c].name).join('、');
      log(state, state.players[event.player].name + '拿取 ' + names, 'take');
    } else if (event.type === 'noble') {
      log(state, state.players[event.player].name + '获得贵族【' + event.nobleName + '】，+3 分', 'noble');
    } else if (event.type === 'discard') {
      log(state, state.players[event.player].name + '归还了多余的宝石', 'discard');
    }
  }

  // ------------------------------------------------------------
  // 行动
  // ------------------------------------------------------------
  function buyCard(state, playerId, cardId) {
    if (!state || state.phase === 'over') return fail('对局已结束');
    if (state.phase !== 'play') return fail('当前不能购买卡牌');
    if (state.current !== playerId) return fail('还没轮到你');

    const loc = locateCard(state, cardId);
    if (!loc) return fail('这张卡已经不在场上');
    if (loc.zone === 'reserved' && loc.player !== playerId) return fail('不能购买对手预订的卡牌');

    const player = state.players[playerId];
    const card = cardAt(state, loc);
    if (!card) return fail('这张卡已经不在场上');

    const aff = affordability(player, card);
    if (!aff.ok) return fail('宝石不足，还差 ' + (aff.gold - player.tokens.gold) + ' 枚');

    // 支付：优先使用彩色宝石，再用黄金补足
    for (const color of COLORS) {
      const d = aff.detail[color];
      player.tokens[color] -= d.pay;
      state.bank[color] += d.pay;
    }
    player.tokens.gold -= aff.gold;
    state.bank.gold += aff.gold;

    // 从场上 / 预订区移走，并补牌
    let fromReserved = false;
    if (loc.zone === 'market') {
      state.market[loc.level][loc.index] = drawFromDeck(state, loc.level);
    } else {
      player.reserved.splice(loc.index, 1);
      fromReserved = true;
    }

    player.cards.push(card);
    player.bonuses[card.bonus] += 1;
    player.points += card.points;

    emit(state, {
      type: 'buy',
      player: playerId,
      cardId: card.id,
      cardName: card.name,
      points: card.points,
      bonus: card.bonus,
      fromReserved,
    });

    afterAction(state);
    return { ok: true };
  }

  function reserveCard(state, playerId, cardId, options) {
    if (!state || state.phase === 'over') return fail('对局已结束');
    if (state.phase !== 'play') return fail('当前不能预订卡牌');
    if (state.current !== playerId) return fail('还没轮到你');

    const opts = options || {};
    const player = state.players[playerId];
    if (player.reserved.length >= 3) return fail('最多只能预订 3 张卡牌');

    let card = null;
    let blind = false;
    if (opts.blindLevel) {
      const level = Number(opts.blindLevel);
      if (!state.decks[level] || state.decks[level].length === 0) return fail('该等级牌堆已经空了');
      card = state.decks[level].pop();
      blind = true;
    } else {
      const loc = locateCard(state, cardId);
      if (!loc || loc.zone !== 'market') return fail('只能预订场上的卡牌');
      card = cardAt(state, loc);
      state.market[loc.level][loc.index] = drawFromDeck(state, loc.level);
    }
    if (!card) return fail('没有可预订的卡牌');

    player.reserved.push(card);
    let gotGold = false;
    if (state.bank.gold > 0) {
      state.bank.gold -= 1;
      player.tokens.gold += 1;
      gotGold = true;
    }

    emit(state, {
      type: 'reserve',
      player: playerId,
      cardId: card.id,
      cardName: blind ? LEVEL_NUMERALS[card.level] + ' 级盲抽卡' : card.name,
      gold: gotGold,
      blind,
    });

    afterAction(state);
    return { ok: true };
  }

  function takeTokens(state, playerId, colors) {
    if (!state || state.phase === 'over') return fail('对局已结束');
    if (state.phase !== 'play') return fail('当前不能拿取宝石');
    if (state.current !== playerId) return fail('还没轮到你');

    const check = validateTake(state, colors);
    if (!check.ok) return fail(check.reason);

    const player = state.players[playerId];
    for (const color of colors) {
      state.bank[color] -= 1;
      player.tokens[color] += 1;
    }

    emit(state, { type: 'take', player: playerId, colors: colors.slice(), kind: check.kind });
    afterAction(state);
    return { ok: true };
  }

  function chooseNoble(state, nobleId) {
    if (!state || state.phase !== 'noble') return fail('现在不需要选择贵族');
    if (!state.pending || !Array.isArray(state.pending.eligible)) return fail('没有可选择的贵族');
    if (!state.pending.eligible.includes(nobleId)) return fail('这位贵族不在可选范围内');

    const noble = state.nobles.find((n) => n.id === nobleId);
    if (!noble) return fail('贵族已经离开');

    awardNoble(state, state.players[state.current], noble);
    state.phase = 'play';
    state.pending = null;

    checkEndTrigger(state);
    if (state.phase === 'over') return { ok: true };
    beginTurnEnd(state);
    return { ok: true };
  }

  function discardToken(state, color) {
    if (!state || state.phase !== 'discard') return fail('现在不需要归还宝石');
    if (!ALL_GEMS.includes(color)) return fail('不存在的宝石');
    const player = state.players[state.current];
    if (!player.tokens[color]) return fail('没有这枚宝石');

    player.tokens[color] -= 1;
    state.bank[color] += 1;
    state.pending.returnCount -= 1;

    if (state.pending.returnCount <= 0) {
      state.phase = 'play';
      state.pending = null;
      emit(state, { type: 'discard', player: state.current });
      endTurn(state);
    }
    return { ok: true };
  }

  // ------------------------------------------------------------
  // 回合流程
  // ------------------------------------------------------------
  function afterAction(state) {
    if (state.phase === 'over' || state.phase === 'noble') return;
    const player = state.players[state.current];

    const eligible = eligibleNobles(state, player);
    if (eligible.length === 1) {
      awardNoble(state, player, eligible[0]);
    } else if (eligible.length > 1) {
      if (player.isAI) {
        awardNoble(state, player, eligible[0]);
      } else {
        state.phase = 'noble';
        state.pending = { eligible: eligible.map((n) => n.id) };
        return;
      }
    }

    checkEndTrigger(state);
    if (state.phase === 'over') return;
    beginTurnEnd(state);
  }

  function awardNoble(state, player, noble) {
    state.nobles = state.nobles.filter((n) => n.id !== noble.id);
    player.nobles.push(noble);
    player.points += noble.points;
    emit(state, {
      type: 'noble',
      player: state.current,
      nobleId: noble.id,
      nobleName: noble.name,
      points: noble.points,
    });
  }

  function checkEndTrigger(state) {
    if (state.endTriggered) return;
    const player = state.players[state.current];
    if (player.points < 15) return;

    state.endTriggered = true;
    const count = state.players.length;
    const offset = (state.current - state.firstPlayer + count) % count;
    // 包含触发者当前回合：本轮剩余玩家（按顺序）都还有一次行动
    state.finalTurnsLeft = count - offset;
    const immediate = state.finalTurnsLeft <= 1;
    log(
      state,
      player.name + '达到 15 分，' + (immediate ? '本轮结束。' : '最后一轮！'),
      'final'
    );
    emit(state, {
      type: 'final',
      player: state.current,
      immediate,
      turnsLeft: state.finalTurnsLeft,
    });
  }

  function beginTurnEnd(state) {
    const player = state.players[state.current];
    const over = totalTokens(player) - 10;
    if (over > 0) {
      if (player.isAI) {
        let guard = 0;
        while (totalTokens(player) > 10 && guard++ < 20) {
          autoDiscardOne(state, player);
        }
        endTurn(state);
      } else {
        state.phase = 'discard';
        state.pending = { returnCount: over };
      }
      return;
    }
    endTurn(state);
  }

  function endTurn(state) {
    if (state.phase === 'over') return;
    if (state.endTriggered) {
      state.finalTurnsLeft = Math.max(0, (state.finalTurnsLeft || 0) - 1);
      if (state.finalTurnsLeft <= 0) {
        finishGame(state);
        return;
      }
    }
    state.current = (state.current + 1) % state.players.length;
    state.turnCount += 1;
    state.phase = 'play';
    state.pending = null;
  }

  function finishGame(state) {
    state.phase = 'over';
    state.pending = null;
    state.finishedAt = Date.now();

    const ranked = state.players.map((player, index) => ({
      index,
      points: player.points,
      cards: player.cards.length,
    })).sort((a, b) => b.points - a.points || a.cards - b.cards || a.index - b.index);
    const top = ranked[0];
    const tied = ranked.filter((r) => r.points === top.points && r.cards === top.cards);
    const winner = tied.length === 1 ? top.index : -1;

    state.winner = winner;
    log(
      state,
      winner === -1
        ? '对局结束，' + (tied.length > 1 ? '最高分与卡牌数相同，平局。' : '平局。')
        : '对局结束，' + state.players[winner].name + '以 ' + state.players[winner].points + ' 分获胜！',
      'final'
    );
    emit(state, {
      type: 'gameover',
      winner,
      points: state.players.map((player) => player.points),
      cards: state.players.map((player) => player.cards.length),
    });
  }

  // ------------------------------------------------------------
  // AI
  // ------------------------------------------------------------
  function marketCards(state) {
    const list = [];
    for (const level of [1, 2, 3]) {
      for (const card of state.market[level]) {
        if (card) list.push(card);
      }
    }
    return list;
  }

  function buildNeedScores(state, player, includeReserved) {
    const need = { white: 0, blue: 0, green: 0, red: 0, black: 0 };
    const cards = marketCards(state);
    if (includeReserved) cards.push(...player.reserved);

    for (const card of cards) {
      const m = missingByColor(player, card);
      if (m.total <= 0) continue;
      let weight = card.points * 2.4 + (4 - card.level) * 1.2 + 2.2;
      if (card.level === 3) weight += 2.5;
      if (m.total > 4) weight *= 0.72;
      if (m.total <= 2) weight *= 1.25;
      for (const color of COLORS) {
        if (m.by[color] > 0) need[color] += weight * (m.by[color] / m.total);
      }
    }

    for (const noble of state.nobles) {
      const unmet = COLORS.filter((c) => player.bonuses[c] < noble.req[c]);
      if (unmet.length > 0 && unmet.length <= 2) {
        const near = unmet.reduce((s, c) => s + Math.min(1, player.bonuses[c] / noble.req[c]), 0);
        for (const c of unmet) need[c] += 4 + near * 4;
      }
    }

    return need;
  }

  function evaluateBuy(state, player, card, aff) {
    let score = card.points * 18;
    const owned = player.bonuses[card.bonus] || 0;
    score += Math.max(2.5, 10 - owned * 1.6);

    // 贵族进度
    for (const noble of state.nobles) {
      let before = 0;
      let after = 0;
      let total = 0;
      for (const c of COLORS) {
        const req = noble.req[c];
        total += req;
        before += Math.min(player.bonuses[c], req);
        after += Math.min(player.bonuses[c] + (c === card.bonus ? 1 : 0), req);
      }
      if (after === total) score += 46;
      else if (after > before) score += 5 + (after / Math.max(1, total)) * 9;
    }

    // 效率与黄金
    const spent = Math.max(0, aff.tokenCost + aff.gold);
    score -= aff.gold * 2.4;
    score -= spent * 0.32;

    // 抢走其他玩家想要的牌
    const opponents = state.players.filter((p) => p !== player);
    if (opponents.some((opponent) => affordability(opponent, card).ok)) {
      score += card.points * 1.8 + 2.5;
    }
    return score;
  }

  function evaluateReserve(state, player, card) {
    const aff = affordability(player, card);
    if (aff.ok) return -Infinity; // 能买就买
    const m = missingByColor(player, card);
    const opponents = state.players.filter((p) => p !== player);
    const opponentCanBuy = opponents.some((opponent) => affordability(opponent, card).ok);

    let score = card.points * 8.5;
    score += Math.max(0, 9 - (player.bonuses[card.bonus] || 0) * 1.4) * 0.55;
    score += card.level === 3 ? 5 : 0;
    score -= m.afterGold * 2.3;
    if (opponentCanBuy) score += 16 + card.points * 2;
    if (state.bank.gold > 0) score += 4;
    if (player.reserved.length > 0) score -= 6;
    if (card.points === 0) score -= 8;
    return score;
  }

  function evaluateTokenMoves(state, player) {
    const need = buildNeedScores(state, player, true);
    const opponents = state.players.filter((p) => p !== player);
    const oppNeed = {};
    for (const c of COLORS) oppNeed[c] = 0;
    for (const opponent of opponents) {
      const scores = buildNeedScores(state, opponent, false);
      for (const c of COLORS) oppNeed[c] += scores[c];
    }
    for (const c of COLORS) need[c] += (oppNeed[c] / Math.max(1, opponents.length)) * 0.14;

    const total = totalTokens(player);
    const basePenalty = total >= 9 ? (total - 8) * 4 : 0;
    const overflowPenalty = (n) => Math.max(0, total + n - 10) * 6;
    const moves = [];

    const available = COLORS.filter((c) => state.bank[c] > 0);
    if (available.length >= 3) {
      const picks = COLORS.slice()
        .filter((c) => state.bank[c] > 0)
        .sort((a, b) => need[b] - need[a])
        .slice(0, 3);
      const useful = picks.filter((c) => need[c] > 0).length;
      let s = 6 + picks.reduce((acc, c) => acc + need[c], 0) * 0.35 + useful * 1.5;
      s -= basePenalty + overflowPenalty(3);
      moves.push({ type: 'take', colors: picks, score: s });
    } else if (available.length > 0) {
      let s = 4 + available.reduce((acc, c) => acc + need[c], 0) * 0.35;
      s -= basePenalty + overflowPenalty(available.length);
      moves.push({ type: 'take', colors: available.slice(), score: s });
    }

    for (const color of COLORS) {
      if (state.bank[color] < 4) continue;
      let s = 4 + need[color] * 0.85;
      if (need[color] >= 3) s += 3;
      if (need[color] <= 0) s -= 6;
      s -= basePenalty * 1.2 + overflowPenalty(2);
      moves.push({ type: 'take', colors: [color, color], score: s });
    }

    moves.sort((a, b) => b.score - a.score);
    return moves;
  }

  function chooseAIAction(state, player) {
    const buyable = [];
    for (const card of marketCards(state)) {
      const aff = affordability(player, card);
      if (aff.ok) buyable.push({ card, aff, score: evaluateBuy(state, player, card, aff) });
    }
    for (const card of player.reserved) {
      const aff = affordability(player, card);
      if (aff.ok) buyable.push({ card, aff, score: evaluateBuy(state, player, card, aff) + 2 });
    }
    let bestBuy = null;
    if (buyable.length) {
      buyable.sort((a, b) => b.score - a.score || b.card.points - a.card.points);
      bestBuy = buyable[0];
    }

    let bestReserve = null;
    if (player.reserved.length < 3) {
      for (const card of marketCards(state)) {
        const s = evaluateReserve(state, player, card);
        if (!bestReserve || s > bestReserve.score) bestReserve = { type: 'reserve', cardId: card.id, score: s };
      }
    }

    const tokenMoves = evaluateTokenMoves(state, player);
    const bestToken = tokenMoves.length ? tokenMoves[0] : null;

    if (bestBuy) {
      // 已经拿满 / 快拿满时先买牌，否则会陷入互相拿宝石再弃掉的死循环
      if (totalTokens(player) >= 9) return { type: 'buy', cardId: bestBuy.card.id };
      // 早期买 0 分卡铺引擎，中后期把宝石留给高分卡
      const tempo = Math.max(0, 11 - player.cards.length) * 1.1;
      const buyScore = bestBuy.score + (bestBuy.card.points === 0 ? tempo : 5);
      const alt = Math.max(bestToken ? bestToken.score : -99, bestReserve ? bestReserve.score : -99);
      if (bestBuy.card.points >= 2 || buyScore >= alt) {
        return { type: 'buy', cardId: bestBuy.card.id };
      }
    }

    // 高分卡够不着时，预订它：既能拿黄金，也能防止对手抢走
    if (bestReserve && bestReserve.score > 20 && (!bestToken || bestReserve.score > bestToken.score + 4)) {
      return { type: 'reserve', cardId: bestReserve.cardId };
    }
    if (bestToken) return bestToken;
    if (bestReserve && bestReserve.score > 10) return { type: 'reserve', cardId: bestReserve.cardId };

    // 最后的兜底：盲抽预订，或者随便拿点宝石
    if (player.reserved.length < 3) {
      for (const level of [3, 2, 1]) {
        if (state.decks[level].length) return { type: 'reserveBlind', level };
      }
    }
    return null;
  }

  function autoDiscardOne(state, player) {
    const need = buildNeedScores(state, player, true);
    const owned = ALL_GEMS.filter((c) => player.tokens[c] > 0);
    if (!owned.length) return null;
    owned.sort((a, b) => {
      const sa = need[a] + (a === GOLD ? 2.5 : 0);
      const sb = need[b] + (b === GOLD ? 2.5 : 0);
      return sa - sb;
    });
    const color = owned[0];
    player.tokens[color] -= 1;
    state.bank[color] += 1;
    return color;
  }

  /**
   * 让当前 AI 执行一个完整回合。
   * 返回是否真的执行了行动。
   */
  function aiPlay(state) {
    if (!state || state.phase === 'over') return false;
    const player = state.players[state.current];
    if (!player || !player.isAI) return false;

    if (state.phase === 'noble') {
      if (!state.pending || !state.pending.eligible.length) return false;
      chooseNoble(state, state.pending.eligible[0]);
      return true;
    }
    if (state.phase === 'discard') {
      let guard = 0;
      while (state.phase === 'discard' && guard++ < 20) {
        const color = autoDiscardOne(state, player);
        if (!color) break;
        discardToken(state, color);
      }
      return true;
    }

    const action = chooseAIAction(state, player);
    if (!action) {
      // 理论上不会发生；保险起见直接结束回合，避免卡死
      log(state, player.name + '跳过了一个无法行动的回合。', 'system');
      endTurn(state);
      return false;
    }

    let result;
    if (action.type === 'buy') {
      result = buyCard(state, state.current, action.cardId);
    } else if (action.type === 'reserve') {
      result = reserveCard(state, state.current, action.cardId);
    } else if (action.type === 'reserveBlind') {
      result = reserveCard(state, state.current, null, { blindLevel: action.level });
    } else if (action.type === 'take') {
      result = takeTokens(state, state.current, action.colors);
    }

    if (!result || !result.ok) {
      // 回退方案：拿三种可用宝石；再不行就结束回合
      const colors = COLORS.filter((c) => state.bank[c] > 0).slice(0, 3);
      if (colors.length >= 2) {
        result = takeTokens(state, state.current, colors);
      }
      if (!result || !result.ok) {
        endTurn(state);
        return false;
      }
    }

    // AI 的多贵族选择 / 弃牌都已在流程内自动处理
    if (state.phase === 'noble' && state.players[state.current].isAI) {
      chooseNoble(state, state.pending.eligible[0]);
    }
    if (state.phase === 'discard' && state.players[state.current].isAI) {
      let guard = 0;
      while (state.phase === 'discard' && guard++ < 20) {
        const color = autoDiscardOne(state, state.players[state.current]);
        if (!color) break;
        discardToken(state, color);
      }
    }
    return true;
  }

  function drawFromDeck(state, level) {
    const deck = state.decks[level];
    if (!deck || !deck.length) return null;
    return deck.pop();
  }

  function fail(reason) {
    return { ok: false, reason };
  }

  // ------------------------------------------------------------
  // 存档
  // ------------------------------------------------------------
  function serialize(state) {
    return JSON.stringify(state);
  }

  function loadState(raw) {
    let data = raw;
    if (typeof raw === 'string') {
      try {
        data = JSON.parse(raw);
      } catch (e) {
        return null;
      }
    }
    if (!data || data.v !== VERSION || !Array.isArray(data.players) || data.players.length !== 4) {
      return null;
    }
    if (!data.decks || !data.market || !data.bank || !Array.isArray(data.nobles)) return null;

    try {
      // 重建卡牌对象引用，避免 JSON 反序列化后同一张卡出现多个副本
      const cardMap = new Map();
      const collect = (card) => {
        if (card && card.id && !cardMap.has(card.id)) cardMap.set(card.id, card);
      };
      for (const level of [1, 2, 3]) {
        (data.decks[level] || []).forEach(collect);
        (data.market[level] || []).forEach(collect);
      }
      for (const p of data.players) {
        (p.cards || []).forEach(collect);
        (p.reserved || []).forEach(collect);
      }

      for (const level of [1, 2, 3]) {
        data.decks[level] = (data.decks[level] || []).map((c) => (c ? cardMap.get(c.id) || c : null));
        data.market[level] = (data.market[level] || []).map((c) => (c ? cardMap.get(c.id) || c : null));
      }
      for (const p of data.players) {
        p.cards = (p.cards || []).map((c) => cardMap.get(c.id) || c);
        p.reserved = (p.reserved || []).map((c) => cardMap.get(c.id) || c);
      }

      const nobleMap = new Map();
      for (const n of data.nobles) nobleMap.set(n.id, n);
      for (const p of data.players) {
        for (const n of p.nobles || []) if (!nobleMap.has(n.id)) nobleMap.set(n.id, n);
      }
      data.nobles = data.nobles.map((n) => nobleMap.get(n.id) || n);
      for (const p of data.players) {
        p.nobles = (p.nobles || []).map((n) => nobleMap.get(n.id) || n);
      }

      if (!Array.isArray(data.log)) data.log = [];
      if (typeof data.eventSeq !== 'number') data.eventSeq = 0;
      data.lastEvent = null;
      return data;
    } catch (e) {
      return null;
    }
  }

  // ------------------------------------------------------------
  // 导出
  // ------------------------------------------------------------
  global.GemEngine = {
    VERSION,
    COLORS,
    GOLD,
    ALL_GEMS,
    GEM,
    LEVEL_NAMES,
    LEVEL_NUMERALS,
    CARD_PATTERNS,
    CARD_VARIANTS,
    buildCards,
    buildNobles,
    createGame,
    totalTokens,
    totalCards,
    locateCard,
    cardAt,
    affordability,
    missingByColor,
    eligibleNobles,
    validateTake,
    buyCard,
    reserveCard,
    takeTokens,
    chooseNoble,
    discardToken,
    aiPlay,
    chooseAIAction,
    serialize,
    loadState,
    // 测试时方便检查内部行为
    _internal: { afterAction, endTurn, drawFromDeck },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
