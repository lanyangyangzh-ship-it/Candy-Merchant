/* ============================================================
   宝石商人 · 界面与交互
   ============================================================ */
(function () {
  'use strict';

  const E = window.GemEngine;
  const NET = window.GemNet || null;
  const ART = window.GemArt || null;
  if (!E) {
    document.body.innerHTML = '<div style="padding:40px;color:#f3eddf;font-family:sans-serif">引擎加载失败，请刷新页面。</div>';
    return;
  }

  const LS = {
    save: 'gemMerchant.save.v1',
    settings: 'gemMerchant.settings.v1',
    record: 'gemMerchant.record.v1',
    server: 'gemMerchant.server.v1',
  };

  const screenEl = document.getElementById('screen');
  const trayEl = document.getElementById('tray');
  const modalEl = document.getElementById('modal-root');
  const toastEl = document.getElementById('toasts');

  let state = null;
  let screen = 'title';

  const ui = {
    selection: [],
    modal: null,
    aiTimer: null,
    aiRetries: 0,
    lastEventSeq: 0,
    flashPlayer: null,
    flashTimer: null,
    recordedKey: null,
    soundGameOverKey: null,
    record: { wins: 0, losses: 0, draws: 0 },
    sound: true,
  };

  const online = {
    active: false,
    inGame: false,
    role: null,          // 'host' | 'guest'
    code: '',
    serverUrl: '',
    phase: 'idle',       // idle | connecting | waiting-guest | waiting-host | error
    error: '',
    waiting: false,      // 访客动作已提交，等待房主快照
    pendingRoom: '',     // 分享链接里的 ?room=
    pendingJoinCode: '',
    net: null,
    waitingTimer: null,
    gameId: null,
    connected: false,
    guests: [],        // 房主：已加入的朋友 { seat, name }
    guestSeats: [],    // 房主：开局时分配给朋友的座位
    seat: 0,           // 访客：房主牌桌里的实际座位
  };

  const gemCache = {};

  // ------------------------------------------------------------
  // 基础工具
  // ------------------------------------------------------------
  function esc(value) {
    return String(value).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* localStorage 不可用时静默降级 */ }
  }

  function removeKey(key) {
    try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
  }

  function countSelection() {
    const counts = {};
    for (const c of ui.selection) counts[c] = (counts[c] || 0) + 1;
    return counts;
  }

  function isOnlineGame() {
    return !!(state && state.meta && state.meta.online);
  }

  function isOnlineHost() {
    return isOnlineGame() && online.role === 'host';
  }

  function isOnlineGuest() {
    return isOnlineGame() && online.role === 'guest';
  }

  function isWaiting() {
    return isOnlineGame() && online.role === 'guest' && online.waiting;
  }

  function canAct() {
    return !!state && screen === 'game' && state.current === 0 && state.phase === 'play' && !isWaiting();
  }

  function clearAITimer() {
    if (ui.aiTimer) {
      clearTimeout(ui.aiTimer);
      ui.aiTimer = null;
    }
  }

  function shortGemName(color) {
    const n = E.GEM[color].name;
    return n.length > 2 ? n.slice(0, 2) : n;
  }

  // ------------------------------------------------------------
  // 宝石 SVG
  // ------------------------------------------------------------
  function gemDefs() {
    if (ART) return ART.defs();
    return '<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>' +
      E.ALL_GEMS.map((color) => {
        const m = E.GEM[color];
        return '<radialGradient id="gemGrad-' + color + '" cx="32%" cy="24%" r="86%">' +
          '<stop offset="0" stop-color="' + m.light + '"/>' +
          '<stop offset=".46" stop-color="' + m.hex + '"/>' +
          '<stop offset="1" stop-color="' + m.dark + '"/>' +
          '</radialGradient>';
      }).join('') +
      '</defs></svg>';
  }

  function gemSVG(color, cls) {
    if (ART) return ART.gemSVG(color, cls);
    const key = color + '|' + (cls || '');
    if (gemCache[key]) return gemCache[key];
    const cx = 50;
    const cy = 50;
    const R = 46;
    const r = 24;
    const outer = [];
    const inner = [];
    for (let i = 0; i < 8; i++) {
      const a1 = (-90 + i * 45) * Math.PI / 180;
      const a2 = (-90 + 22.5 + i * 45) * Math.PI / 180;
      outer.push([cx + R * Math.cos(a1), cy + R * Math.sin(a1)]);
      inner.push([cx + r * Math.cos(a2), cy + r * Math.sin(a2)]);
    }
    const pts = (arr) => arr.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
    let facets = '';
    for (let i = 0; i < 8; i++) {
      const tri = [outer[i], inner[(i + 7) % 8], inner[i]];
      facets += '<polygon points="' + pts(tri) + '" fill="' +
        (i % 2 ? 'rgba(255,255,255,.17)' : 'rgba(0,0,0,.15)') + '"/>';
    }
    const html = '<svg class="gem ' + (cls || '') + '" viewBox="0 0 100 100" aria-hidden="true" focusable="false">' +
      '<polygon points="' + pts(outer) + '" fill="url(#gemGrad-' + color + ')"/>' +
      facets +
      '<polygon points="' + pts(inner) + '" fill="rgba(255,255,255,.17)" stroke="rgba(255,255,255,.38)" stroke-width="1.1"/>' +
      '<polygon points="' + pts(outer) + '" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1.25"/>' +
      '<polygon points="50,6 64,15 56,25 45,20" fill="rgba(255,255,255,.55)"/>' +
      '</svg>';
    gemCache[key] = html;
    return html;
  }

  // ------------------------------------------------------------
  // 图标
  // ------------------------------------------------------------
  const ICONS = {
    sound: '<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/>',
    mute: '<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 9l5 5"/><path d="M21 9l-5 5"/>',
    book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5V5.5z"/><path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20"/>',
    menu: '<path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/>',
    close: '<path d="M6 6l12 12"/><path d="M18 6L6 18"/>',
    card: '<rect x="5" y="3.5" width="14" height="17" rx="2.5"/><path d="M12 8l3 2.2-1.2 3.8h-3.6L9 10.2 12 8z"/>',
    crown: '<path d="M3 8l4.2 3.1L12 4l4.8 7.1L21 8l-1.7 10.2H4.7L3 8z"/><path d="M5 21h14"/>',
    trophy: '<path d="M8 4h8v4a4 4 0 0 1-8 0V4z"/><path d="M8 5H4.5a3.5 3.5 0 0 0 3.5 3.5"/><path d="M16 5h3.5A3.5 3.5 0 0 1 16 8.5"/><path d="M12 12v4"/><path d="M8.5 20h7"/><path d="M10 16h4l.7 4H9.3L10 16z"/>',
    check: '<path d="M4 12.5l5 5L20 6.5"/>',
    play: '<path d="M8 5l10 7-10 7V5z"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 6.7"/><path d="M20 5v6h-6"/>',
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
    arrowLeft: '<path d="M15 5l-7 7 7 7"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 7.5h.01"/>',
    share: '<circle cx="6" cy="12" r="2.1"/><circle cx="18" cy="6" r="2.1"/><circle cx="18" cy="18" r="2.1"/><path d="M7.9 11l8.2-4"/><path d="M7.9 13l8.2 4"/>',
    download: '<path d="M12 3v12"/><path d="M7.5 10.5L12 15l4.5-4.5"/><path d="M5 21h14"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    wifi: '<path d="M4 9a13 13 0 0 1 16 0"/><path d="M7 12.5a9 9 0 0 1 10 0"/><path d="M10 16a4 4 0 0 1 4 0"/><circle cx="12" cy="19" r="1"/>',
  };

  function icon(name, cls) {
    const body = ICONS[name] || ICONS.info;
    return '<svg class="' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
      body + '</svg>';
  }

  // ------------------------------------------------------------
  // 音效（WebAudio，无外部资源）
  // ------------------------------------------------------------
  const Sound = {
    ctx: null,
    master: null,
    enabled: true,
    init() {
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.65;
        this.master.connect(this.ctx.destination);
      } catch (e) {
        this.ctx = null;
      }
    },
    ensure() {
      this.init();
      if (!this.ctx) return false;
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(function () {});
      }
      return true;
    },
    tone(freq, dur, options) {
      if (!this.enabled || !this.ensure()) return;
      const o = options || {};
      const t0 = this.ctx.currentTime + (o.delay || 0);
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      const vol = o.vol == null ? 0.03 : o.vol;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.03);
    },
    click() { this.tone(880, 0.06, { vol: 0.016 }); },
    take() {
      this.tone(660, 0.08, { vol: 0.022 });
      this.tone(990, 0.11, { vol: 0.014, delay: 0.035 });
    },
    reserve() {
      this.tone(392, 0.16, { type: 'triangle', vol: 0.025 });
      this.tone(523.25, 0.2, { type: 'triangle', vol: 0.02, delay: 0.055 });
    },
    buy(points) {
      const notes = [523.25, 659.25, 783.99];
      notes.forEach((f, i) => this.tone(f, 0.3, { vol: 0.026, delay: i * 0.055 }));
      if (points >= 3) this.tone(1046.5, 0.42, { vol: 0.017, delay: 0.2 });
    },
    noble() {
      [659.25, 783.99, 987.77, 1318.5].forEach((f, i) => {
        this.tone(f, 0.45, { type: 'triangle', vol: 0.021, delay: i * 0.08 });
      });
    },
    final() {
      this.tone(196, 0.5, { type: 'triangle', vol: 0.026 });
      this.tone(293.66, 0.52, { type: 'triangle', vol: 0.02, delay: 0.13 });
    },
    start() {
      [392, 523.25, 659.25].forEach((f, i) => this.tone(f, 0.26, { vol: 0.02, delay: i * 0.06 }));
    },
    error() { this.tone(170, 0.12, { type: 'sawtooth', vol: 0.016 }); },
    win() {
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
        this.tone(f, 0.55, { type: 'triangle', vol: 0.026, delay: i * 0.1 });
      });
    },
    lose() {
      [392, 349.23, 293.66].forEach((f, i) => {
        this.tone(f, 0.52, { vol: 0.023, delay: i * 0.12 });
      });
    },
  };

  // ------------------------------------------------------------
  // Toast
  // ------------------------------------------------------------
  function toast(text, kind, gemColor) {
    if (!toastEl) return;
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    const color = gemColor || (kind === 'error' ? 'red' : 'gold');
    el.innerHTML = gemSVG(color) + '<span>' + esc(text) + '</span>';
    toastEl.appendChild(el);
    while (toastEl.children.length > 3) toastEl.removeChild(toastEl.firstElementChild);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 320);
    }, 2600);
  }

  // ------------------------------------------------------------
  // 存档
  // ------------------------------------------------------------
  function readSave() {
    try {
      const raw = localStorage.getItem(LS.save);
      if (!raw) return null;
      const loaded = E.loadState(raw);
      if (!loaded || loaded.phase === 'over') {
        removeKey(LS.save);
        return null;
      }
      return loaded;
    } catch (e) {
      return null;
    }
  }

  function saveGame(force) {
    if (!state || state.phase === 'over' || isOnlineGame()) return;
    if (!force && !(state.current === 0 && state.phase === 'play')) return;
    try {
      localStorage.setItem(LS.save, E.serialize(state));
    } catch (e) { /* ignore */ }
  }

  function peekSave() {
    const loaded = readSave();
    if (!loaded) return null;
    return {
      turn: Math.floor((loaded.turnCount || 0) / 4) + 1,
      scores: loaded.players.map((player) => player.points),
      state: loaded,
    };
  }

  function loadRecord() {
    const r = readJSON(LS.record, null);
    if (!r || typeof r !== 'object') return { wins: 0, losses: 0, draws: 0 };
    return {
      wins: Number(r.wins) || 0,
      losses: Number(r.losses) || 0,
      draws: Number(r.draws) || 0,
    };
  }

  // ------------------------------------------------------------
  // 标题页
  // ------------------------------------------------------------
  function titleHTML() {
    const saved = peekSave();
    const rec = ui.record;
    const games = rec.wins + rec.losses + rec.draws;
    const soundBtn = '<button class="icon-btn ' + (ui.sound ? 'on' : '') + '" data-act="sound" ' +
      'aria-label="' + (ui.sound ? '关闭音效' : '开启音效') + '" aria-pressed="' + String(ui.sound) + '">' +
      icon(ui.sound ? 'sound' : 'mute') + '</button>';
    return '<div class="title-screen">' +
      '<div class="title-tools">' + soundBtn + '</div>' +
      '<div class="title-hero">' +
        '<div class="kicker">A GAME OF GEMS &amp; GUILE</div>' +
        '<div class="hero-gem">' +
          (ART ? ART.heroScene() : gemSVG('white', 'main') + gemSVG('blue', 'mini one') + gemSVG('red', 'mini two')) +
          '<i class="spark s1"></i><i class="spark s2"></i><i class="spark s3"></i>' +
        '</div>' +
        '<h1 class="title">宝石商人</h1>' +
        '<div class="title-rule"><i></i><span>GEM MERCHANT</span><i></i></div>' +
        '<p class="title-sub">收集宝石 · 延揽贵族 · 成为最富有的商人</p>' +
      '</div>' +
      '<div class="title-actions">' +
        (saved ? '<button class="btn primary" data-act="continue">继续上局</button>' : '') +
        '<button class="btn ' + (saved ? 'ghost' : 'primary') + '" data-act="new">开始新对局</button>' +
        '<button class="btn ghost online-btn" data-act="online"><span class="online-dot"></span>联机对战</button>' +
        '<button class="btn ghost" data-act="rules">玩法说明</button>' +
        (saved ? '<div class="save-line"><span class="save-dot"></span>第 ' + saved.turn + ' 回合 · 你 ' +
          saved.scores[0] + ' 分 · 四人局</div>' : '') +
      '</div>' +
      '<div class="title-foot">' +
        (games ? '<div class="record">战绩 <b>' + rec.wins + '</b> 胜 · <b>' + rec.losses + '</b> 负' +
          (rec.draws ? ' · <b>' + rec.draws + '</b> 平' : '') + '</div>' : '') +
        '<p>四人商战 · 单局约 15 分钟</p>' +
        '<p class="hint">灵感来自《璀璨宝石》 · 建议竖屏游玩</p>' +
      '</div>' +
      '<div class="float-gems" aria-hidden="true">' +
        gemSVG('green', 'g1') + gemSVG('gold', 'g2') + gemSVG('blue', 'g3') +
      '</div>' +
    '</div>';
  }

  // ------------------------------------------------------------
  // 对局界面
  // ------------------------------------------------------------
  function statusText() {
    if (!state) return '';
    const dots = '<span class="dots"><i></i><i></i><i></i></span>';
    const current = state.players[state.current];
    if (isOnlineGame()) {
      const tag = online.code ? '房间 ' + esc(online.code) + ' · ' : '';
      if (online.waiting) return tag + '已提交，等待房主同步' + dots;
      if (state.phase === 'over') return tag + '对局结束';
      if (state.current !== 0) {
        if (current && current.isAI) return tag + '<b>' + esc(current.name) + '</b> 正在盘算' + dots;
        return tag + '等待 <b>' + esc(current.name) + '</b> 行动' + dots;
      }
      if (state.phase === 'discard') return tag + '请归还 ' + state.pending.returnCount + ' 枚宝石';
      if (state.phase === 'noble') return tag + '贵族向你致意，选择一位';
      const last = state.log[state.log.length - 1];
      if (last && last.kind !== 'system') return tag + esc(last.text);
      return tag + '轮到你 · 点击宝石或卡牌';
    }
    if (state.phase === 'over') return '对局结束';
    if (state.current !== 0) {
      return '<b>' + esc(current ? current.name : '对手') + '</b> 正在盘算' + dots;
    }
    if (state.phase === 'discard') return '请归还 ' + state.pending.returnCount + ' 枚宝石';
    if (state.phase === 'noble') return '贵族向你致意，选择一位';
    const last = state.log[state.log.length - 1];
    if (last && last.kind !== 'system') return esc(last.text);
    return '轮到你 · 点击宝石或卡牌';
  }

  function hudHTML() {
    const onlineGame = isOnlineGame();
    const current = state.players[state.current];
    let chipClass = 'turnchip';
    let chipText = onlineGame ? '联机 · 结束' : '对局结束';
    if (state.phase !== 'over') {
      if (state.endTriggered) {
        chipClass += ' final';
        chipText = onlineGame ? '联机 · 最后一轮' : '最后一轮';
      } else if (state.current === 0) {
        chipClass += ' you';
        chipText = onlineGame ? '联机 · 你的回合' : '你的回合';
      } else if (current && current.isAI) {
        chipClass += ' ai';
        chipText = (onlineGame ? '联机 · ' : '') + current.name + ' 回合';
      } else {
        chipClass += ' ai';
        chipText = (onlineGame ? '等待 · ' : '等待 · ') + (current ? current.name : '对手');
      }
    }
    return '<header class="hud">' +
      '<div class="brand"><span class="brand-gem">' + gemSVG('white') + '</span><span>宝石商人</span></div>' +
      '<div class="' + chipClass + '"><i></i>' + chipText + '</div>' +
      '<div class="hud-actions">' +
        '<button class="icon-btn ' + (ui.sound ? 'on' : '') + '" data-act="sound" aria-label="音效" aria-pressed="' + String(ui.sound) + '">' +
          icon(ui.sound ? 'sound' : 'mute') + '</button>' +
        '<button class="icon-btn" data-act="rules" aria-label="玩法">' + icon('book') + '</button>' +
        '<button class="icon-btn" data-act="menu" aria-label="菜单">' + icon('menu') + '</button>' +
      '</div>' +
    '</header>' +
    '<div class="status">' + statusText() + '</div>';
  }

  function assetHTML(color, count, extra) {
    return '<span class="asset' + (extra ? ' ' + extra : '') + (count ? '' : ' zero') + '" title="' + E.GEM[color].name + ' ' + count + '">' +
      gemSVG(color) + '<b>' + count + '</b></span>';
  }

  function rivalCardHTML(player, index) {
    const active = state.current === index && state.phase !== 'over';
    const bonusChips = E.COLORS.map((c) => assetHTML(c, player.bonuses[c], 'tiny')).join('');
    const tokenTotal = E.ALL_GEMS.reduce((sum, c) => sum + player.tokens[c], 0);
    const pop = ui.flashPlayer === index ? ' pop' : '';
    const avatar = ART ? ART.merchantPortrait(index) : gemSVG(index === 1 ? 'red' : index === 2 ? 'blue' : 'gold');
    return '<div class="rival-card' + (active ? ' active' : '') + '">' +
      '<div class="rival-avatar">' + avatar + '</div>' +
      '<div class="rival-main">' +
        '<div class="rival-top"><b>' + esc(player.name) + '</b><span class="rival-points ' + pop + '">' +
          player.points + '<small>分</small></span></div>' +
        '<div class="rival-bonuses">' + bonusChips + '</div>' +
        '<div class="rival-meta"><span>宝石 ' + tokenTotal + '</span><span>预订 ' + player.reserved.length + '</span>' +
          '<span>贵族 ' + player.nobles.length + '</span></div>' +
      '</div>' +
    '</div>';
  }

  function rivalsHTML() {
    const cards = [];
    for (let i = 1; i < state.players.length; i++) cards.push(rivalCardHTML(state.players[i], i));
    return '<section class="rivals" aria-label="其他玩家">' + cards.join('') + '</section>';
  }

  function assetHTML(color, count) {
    return '<span class="asset' + (count ? '' : ' zero') + '" title="' + E.GEM[color].name + ' ' + count + '">' +
      gemSVG(color) + '<b>' + count + '</b></span>';
  }

  function stripHTML(player, index) {
    const isSelf = index === 0;
    const active = state.current === index && state.phase !== 'over';
    const bonusChips = E.COLORS.map((c) => assetHTML(c, player.bonuses[c])).join('');
    const tokenChips = E.ALL_GEMS.map((c) => assetHTML(c, player.tokens[c])).join('');
    const reserve = isSelf
      ? '<button class="mini-btn" data-act="reserved">' + icon('card') + '预订 ' + player.reserved.length + '/3</button>'
      : '<span class="mini-note">' + icon('card') + '预订 ' + player.reserved.length + '</span>';
    const noble = player.nobles.length
      ? '<em>' + icon('crown') + player.nobles.length + '</em>'
      : '';
    const pop = ui.flashPlayer === index ? ' pop' : '';
    const avatar = ART ? ART.merchantPortrait(isSelf ? 0 : 1) : gemSVG(isSelf ? 'gold' : 'red');
    return '<section class="strip ' + (isSelf ? 'self-strip' : 'rival') + (active ? ' active' : '') + '">' +
      '<div class="avatar">' + avatar + '</div>' +
      '<div class="p-main">' +
        '<div class="p-top">' +
          '<span class="p-name">' + esc(player.name) + '</span>' +
          '<span class="p-role">' + (isSelf ? '宝石商人' : '商会会长') + '</span>' +
          reserve +
        '</div>' +
        '<div class="p-assets">' +
          '<span class="asset-group"><i>永久</i>' + bonusChips + '</span>' +
          '<span class="asset-group"><i>宝石</i>' + tokenChips + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="p-score"><b class="' + (pop ? 'pop' : '') + '">' + player.points + '</b><span>分</span>' + noble + '</div>' +
    '</section>';
  }

  function nobleTileHTML(noble) {
    const player = state.players[0];
    const reqs = E.COLORS.filter((c) => noble.req[c] > 0).map((c) => {
      const met = player.bonuses[c] >= noble.req[c];
      return '<span class="req' + (met ? ' met' : '') + '" title="' + E.GEM[c].name + ' ' + noble.req[c] + '">' +
        gemSVG(c) + '<b>' + noble.req[c] + '</b></span>';
    }).join('');
    return '<button class="noble" data-act="noble" data-id="' + noble.id + '" ' +
      'aria-label="' + esc(noble.name) + '，3 分，需要永久宝石 ' +
      E.COLORS.filter((c) => noble.req[c] > 0).map((c) => E.GEM[c].name + noble.req[c]).join('、') + '">' +
      '<span class="noble-portrait">' + (ART ? ART.noblePortrait(noble) : icon('crown')) + '</span>' +
      '<span class="noble-main">' +
        '<span class="noble-name">' + esc(noble.name) + '</span>' +
        '<span class="noble-pts">3<small>分</small></span>' +
        '<span class="reqs">' + reqs + '</span>' +
      '</span>' +
    '</button>';
  }

  function noblesHTML() {
    const slots = [];
    for (let i = 0; i < 5; i++) {
      const n = state.nobles[i];
      slots.push(n ? nobleTileHTML(n) : '<div class="noble gone">已受封</div>');
    }
    return '<section class="nobles" aria-label="贵族">' + slots.join('') + '</section>';
  }

  function cardLabel(card) {
    return (card.fullName || card.name) + '，' + card.points + ' 分，费用 ' +
      E.COLORS.filter((c) => card.cost[c] > 0).map((c) => E.GEM[c].name + card.cost[c]).join('、');
  }

  function cardHTML(card) {
    const player = state.players[0];
    const aff = E.affordability(player, card);
    const tint = E.GEM[card.bonus];
    const cost = E.COLORS.filter((c) => card.cost[c] > 0).map((c) =>
      '<span class="pip" aria-hidden="true">' + gemSVG(c) + '<b>' + card.cost[c] + '</b></span>'
    ).join('');
    const art = ART
      ? ART.cardScene(card)
      : '<span class="card-gem-fallback">' + gemSVG(card.bonus) + '</span>';
    return '<button class="card' + (aff.ok ? ' affordable' : '') + '" data-act="card" data-id="' + card.id + '" ' +
      'data-level="' + card.level + '" data-points="' + card.points + '" ' +
      'style="--tint:' + tint.hex + ';--tint-soft:' + tint.hex + '33" aria-label="' + esc(cardLabel(card)) + '">' +
      '<span class="card-art-wrap">' + art + '</span>' +
      '<span class="card-shade" aria-hidden="true"></span>' +
      '<span class="card-frame" aria-hidden="true"></span>' +
      '<span class="card-pts' + (card.points ? '' : ' zero') + (card.points >= 3 ? ' high' : '') + '">' + card.points + '</span>' +
      '<span class="card-level">' + E.LEVEL_NUMERALS[card.level] + '</span>' +
      '<span class="card-cost">' + cost + '</span>' +
    '</button>';
  }

  function emptyCardHTML() {
    return '<div class="card empty" aria-hidden="true"><span>' + gemSVG('white') + '牌堆已空</span></div>';
  }

  function marketHTML() {
    const rows = [3, 2, 1].map((level) =>
      '<div class="market-row">' +
        state.market[level].map((c) => (c ? cardHTML(c) : emptyCardHTML())).join('') +
      '</div>'
    ).join('');
    return '<section class="market" aria-label="卡牌市场">' + rows + '</section>';
  }

  function bankHTML() {
    const active = state.current === 0 && state.phase === 'play' && !isWaiting();
    const counts = countSelection();
    const chips = E.ALL_GEMS.map((c) => {
      const picked = counts[c] || 0;
      const stock = state.bank[c];
      const isGold = c === 'gold';
      const disabled = !active || (!isGold && stock <= 0);
      return '<button class="bank-gem' + (picked ? ' selected' : '') + (stock <= 0 ? ' dim' : '') +
        (isGold ? ' gold-hint' : '') + '" data-act="gem" data-color="' + c + '" ' +
        (disabled ? 'disabled ' : '') +
        'aria-label="' + E.GEM[c].name + '，银行 ' + stock + ' 枚' + (picked ? '，已选 ' + picked : '') + '" ' +
        'title="' + (isGold ? '黄金只能通过预订卡牌获得' : E.GEM[c].name + '：库存 ' + stock) + '">' +
        '<span class="bank-gem-svg">' + gemSVG(c) + '</span>' +
        '<span class="gem-label">' + shortGemName(c) + '</span>' +
        '<b class="stock">' + stock + '</b>' +
        (picked ? '<b class="picked">' + picked + '</b>' : '') +
      '</button>';
    }).join('');
    return '<section class="bank" aria-label="宝石银行">' +
      '<div class="bank-label">银行</div>' +
      '<div class="bank-gems">' + chips + '</div>' +
    '</section>';
  }

  function gameHTML() {
    return hudHTML() +
      rivalsHTML() +
      noblesHTML() +
      marketHTML() +
      bankHTML() +
      stripHTML(state.players[0], 0);
  }

  // ------------------------------------------------------------
  // 拿取托盘
  // ------------------------------------------------------------
  function renderTray() {
    if (!trayEl) return;
    if (!state || screen !== 'game' || state.current !== 0 || state.phase !== 'play' || isWaiting() || ui.selection.length === 0) {
      trayEl.classList.remove('show');
      trayEl.innerHTML = '';
      trayEl.setAttribute('aria-hidden', 'true');
      return;
    }
    const counts = countSelection();
    const gems = E.COLORS.filter((c) => counts[c]).map((c) =>
      '<span class="tray-gem">' + gemSVG(c) + '<b>' + counts[c] + '</b></span>'
    ).join('');
    const check = E.validateTake(state, ui.selection);
    let title = '';
    let sub = '';
    let disabled = true;
    if (check.ok) {
      disabled = false;
      if (check.kind === 'pair') {
        title = '拿取 2 枚' + E.GEM[check.color].name;
        sub = '同色双倍收购';
      } else if (check.kind === 'single') {
        title = '拿取 1 枚' + E.GEM[ui.selection[0]].name;
        sub = '银行只剩这一种宝石';
      } else {
        const distinct = new Set(ui.selection).size;
        title = '拿取 ' + distinct + ' 种宝石';
        sub = distinct === 3 ? '每种各 1 枚' : '银行只剩这些颜色';
      }
    } else if (ui.selection.length === 1) {
      title = '已选 1 枚';
      sub = '再选 2 种不同宝石，或再点一次同色拿 2 枚';
    } else if (ui.selection.length === 2 && new Set(ui.selection).size === 1) {
      title = '已选 2 枚同色';
      sub = '该颜色库存需至少 4 枚';
    } else if (ui.selection.length === 2) {
      title = '已选 2 种';
      sub = '再选 1 种不同宝石';
    } else {
      title = '已选 3 种';
      sub = check.reason || '请调整选择';
    }
    trayEl.innerHTML = '<div class="tray-gems">' + gems + '</div>' +
      '<div class="tray-copy"><b>' + title + '</b><small>' + esc(sub) + '</small></div>' +
      '<div class="tray-actions">' +
        '<button class="btn ghost small" data-act="clearTake">清空</button>' +
        '<button class="btn primary small" data-act="confirmTake"' + (disabled ? ' disabled' : '') + '>拿取</button>' +
      '</div>';
    trayEl.classList.add('show');
    trayEl.setAttribute('aria-hidden', 'false');
  }

  function updateSelectionUI() {
    if (!state) return;
    const counts = countSelection();
    document.querySelectorAll('.bank-gem').forEach((el) => {
      const color = el.dataset.color;
      const n = counts[color] || 0;
      el.classList.toggle('selected', n > 0);
      let badge = el.querySelector('.picked');
      if (n > 0) {
        if (!badge) {
          badge = document.createElement('b');
          badge.className = 'picked';
          el.appendChild(badge);
        }
        badge.textContent = n;
      } else if (badge) {
        badge.remove();
      }
      el.setAttribute('aria-label', E.GEM[color].name + '，银行 ' + state.bank[color] + ' 枚' +
        (n ? '，已选 ' + n : ''));
    });
    const active = state.current === 0 && state.phase === 'play';
    document.querySelectorAll('.bank-gem').forEach((el) => {
      const color = el.dataset.color;
      const isGold = color === 'gold';
      el.disabled = !active || (!isGold && state.bank[color] <= 0);
    });
  }

  function toggleGem(color) {
    if (!canAct()) {
      toast('等其他玩家完成回合', 'error');
      return;
    }
    if (color === E.GOLD) {
      toast('黄金只能通过预订卡牌获得', 'gold');
      Sound.click();
      return;
    }
    if (state.bank[color] <= 0) {
      toast('这种宝石已经没有了', 'error');
      Sound.error();
      return;
    }
    const selected = ui.selection;
    const same = selected.filter((c) => c === color).length;
    if (same === 1) {
      if (state.bank[color] >= 4) {
        selected.push(color);
        Sound.take();
      } else {
        toast('该颜色库存不足 4 枚，不能拿 2 枚同色', 'error');
        Sound.error();
        return;
      }
    } else if (same >= 2) {
      ui.selection = selected.filter((c) => c !== color);
      Sound.click();
    } else {
      const unique = new Set(selected);
      if (unique.size >= 3) {
        toast('最多拿 3 种不同宝石', 'error');
        Sound.error();
        return;
      }
      if (unique.size === 1 && selected.length === 2) {
        toast('同色只能拿 2 枚，点“清空”重选', 'error');
        Sound.error();
        return;
      }
      selected.push(color);
      Sound.take();
    }
    updateSelectionUI();
    renderTray();
  }

  function clearSelection() {
    ui.selection = [];
    updateSelectionUI();
    renderTray();
    Sound.click();
  }

  function confirmTake() {
    if (!canAct() || !ui.selection.length) return;
    if (isOnlineGuest()) {
      sendGuestAction({ type: 'take', colors: ui.selection.slice() });
      return;
    }
    const result = E.takeTokens(state, 0, ui.selection);
    if (!result.ok) {
      toast(result.reason, 'error');
      Sound.error();
      updateSelectionUI();
      renderTray();
      return;
    }
    ui.selection = [];
    afterHumanAction();
  }

  // ------------------------------------------------------------
  // 玩家行动
  // ------------------------------------------------------------
  function afterHumanAction() {
    if (isOnlineHost()) broadcastState();
    ui.selection = [];
    ui.modal = null;
    handleEventSound();
    saveGame(false);
    render();
  }

  function humanBuy(cardId) {
    if (!canAct()) {
      toast('等其他玩家完成回合', 'error');
      return;
    }
    if (isOnlineGuest()) {
      sendGuestAction({ type: 'buy', cardId: cardId });
      return;
    }
    const result = E.buyCard(state, 0, cardId);
    if (!result.ok) {
      toast(result.reason, 'error');
      Sound.error();
      return;
    }
    afterHumanAction();
  }

  function humanReserve(cardId) {
    if (!canAct()) {
      toast('等其他玩家完成回合', 'error');
      return;
    }
    if (isOnlineGuest()) {
      sendGuestAction({ type: 'reserve', cardId: cardId });
      return;
    }
    const result = E.reserveCard(state, 0, cardId);
    if (!result.ok) {
      toast(result.reason, 'error');
      Sound.error();
      return;
    }
    afterHumanAction();
  }

  function humanReserveBlind(level) {
    if (!canAct()) {
      toast('等其他玩家完成回合', 'error');
      return;
    }
    if (isOnlineGuest()) {
      sendGuestAction({ type: 'reserveBlind', level: level });
      return;
    }
    const result = E.reserveCard(state, 0, null, { blindLevel: level });
    if (!result.ok) {
      toast(result.reason, 'error');
      Sound.error();
      return;
    }
    afterHumanAction();
  }

  function humanChooseNoble(nobleId) {
    if (!state || state.phase !== 'noble' || state.current !== 0 || isWaiting()) return;
    if (isOnlineGuest()) {
      sendGuestAction({ type: 'noble', nobleId: nobleId });
      return;
    }
    const result = E.chooseNoble(state, nobleId);
    if (!result.ok) {
      toast(result.reason, 'error');
      return;
    }
    ui.modal = null;
    afterHumanAction();
  }

  function humanDiscard(color) {
    if (!state || state.phase !== 'discard' || state.current !== 0 || isWaiting()) return;
    if (isOnlineGuest()) {
      sendGuestAction({ type: 'discard', color: color });
      return;
    }
    const result = E.discardToken(state, color);
    if (!result.ok) {
      toast(result.reason, 'error');
      return;
    }
    if (isOnlineHost()) broadcastState();
    Sound.click();
    handleEventSound();
    if (state.phase !== 'discard') ui.modal = null;
    saveGame(false);
    render();
  }

  // ------------------------------------------------------------
  // 联机
  // ------------------------------------------------------------
  function saveServerUrl(url) {
    online.serverUrl = url;
    try { localStorage.setItem(LS.server, url); } catch (e) { /* ignore */ }
  }

  function loadServerUrl() {
    try { return localStorage.getItem(LS.server) || ''; } catch (e) { return ''; }
  }

  function clearWaitingTimer() {
    if (online.waitingTimer) {
      clearTimeout(online.waitingTimer);
      online.waitingTimer = null;
    }
  }

  function resetOnlineFields() {
    clearWaitingTimer();
    clearAITimer();
    online.active = false;
    online.inGame = false;
    online.role = null;
    online.code = '';
    online.phase = 'idle';
    online.error = '';
    online.waiting = false;
    online.pendingJoinCode = '';
    online.gameId = null;
    online.connected = false;
    online.guests = [];
    online.guestSeats = [];
    online.seat = 0;
  }

  function removeRoomQuery() {
    try {
      const url = new URL(location.href);
      if (!url.searchParams.has('room')) return;
      url.searchParams.delete('room');
      history.replaceState(null, '', url.toString());
    } catch (e) { /* ignore */ }
  }

  function sendNetError(reason, seat) {
    if (!NET || !online.net) return;
    const data = { t: 'error', reason: String(reason || '操作失败') };
    if (Number.isInteger(seat) && seat > 0) data.to = seat;
    online.net.send({ type: 'relay', data });
  }

  function startOnlineGame(rematch) {
    if (online.role !== 'host' || !online.active || !online.net) return;
    const guests = (online.guests || []).slice().sort((a, b) => a.seat - b.seat);
    if (!guests.length) {
      toast('至少等一位朋友加入后再开始', 'error');
      return;
    }
    const gameId = Date.now();
    const aiNames = ['罗伦佐', '碧翠丝', '马可'];
    const seats = [
      { name: '房主', isAI: false },
      { name: aiNames[0], isAI: true },
      { name: aiNames[1], isAI: true },
      { name: aiNames[2], isAI: true },
    ];
    for (const guest of guests) {
      const seat = Number(guest.seat);
      if (seat >= 1 && seat <= 3) seats[seat] = { name: guest.name || ('朋友 ' + seat), isAI: false };
    }
    state = E.createGame(gameId, { first: 0, seats: seats });
    state.meta.online = {
      role: 'host',
      code: online.code,
      gameId: gameId,
      guests: guests.map((guest) => ({ seat: guest.seat, name: guest.name })),
    };
    state.meta.mode = 'online';
    online.guestSeats = guests.map((guest) => guest.seat).filter((seat) => seat >= 1 && seat <= 3);
    online.inGame = true;
    online.waiting = false;
    online.phase = 'playing';
    online.gameId = gameId;
    screen = 'game';
    ui.selection = [];
    ui.modal = null;
    ui.lastEventSeq = 0;
    ui.flashPlayer = null;
    ui.recordedKey = null;
    ui.soundGameOverKey = null;
    render();
    broadcastState();
    if (online.net) online.net.send({ type: 'start' });
    Sound.start();
    if (rematch) toast('新的一局开始了', 'gold');
  }

  function broadcastState() {
    if (!NET || online.role !== 'host' || !online.net || !state) return false;
    const seats = (online.guestSeats && online.guestSeats.length
      ? online.guestSeats
      : (online.guests || []).map((guest) => guest.seat));
    let sent = false;
    for (const seat of seats) {
      if (!Number.isInteger(seat) || seat < 1) continue;
      const payload = NET.viewState(state, seat);
      if (online.net.send({ type: 'relay', data: { t: 'state', state: payload, to: seat } })) sent = true;
    }
    return sent;
  }

  function applyOnlineState(raw) {
    if (!NET || online.role === 'host') return;
    if (!raw || typeof raw !== 'object') return;
    const next = E.loadState(JSON.stringify(raw));
    if (!next) {
      toast('同步数据损坏', 'error');
      return;
    }
    const gameId = next.meta && next.meta.online ? next.meta.online.gameId : null;
    const newGame = !online.inGame || (gameId && online.gameId !== gameId);
    clearWaitingTimer();
    online.waiting = false;
    online.inGame = true;
    online.active = true;
    online.role = 'guest';
    online.phase = 'playing';
    online.connected = true;
    if (next.meta && next.meta.online) {
      if (next.meta.online.code) online.code = next.meta.online.code;
      if (Number.isInteger(next.meta.online.seat)) online.seat = next.meta.online.seat;
    }
    online.gameId = gameId || online.gameId;
    state = next;
    screen = 'game';
    if (newGame) {
      ui.selection = [];
      ui.modal = null;
      ui.lastEventSeq = state.eventSeq;
      ui.flashPlayer = null;
      ui.recordedKey = null;
      ui.soundGameOverKey = null;
    } else {
      handleEventSound();
    }
    render();
  }

  function applyGuestAction(action, seat) {
    if (!state || online.role !== 'host' || !online.inGame) return;
    if (state.phase === 'over') return;
    const playerId = Number(seat);
    if (!Number.isInteger(playerId) || playerId < 1 || playerId >= state.players.length) {
      sendNetError('座位无效', playerId);
      return;
    }
    if (state.current !== playerId) {
      sendNetError('还没轮到你', playerId);
      broadcastState();
      return;
    }
    if (!action || typeof action !== 'object') {
      sendNetError('无效操作', playerId);
      broadcastState();
      return;
    }
    let result = { ok: false, reason: '无效操作' };
    switch (action.type) {
      case 'take':
        result = E.takeTokens(state, playerId, Array.isArray(action.colors) ? action.colors : []);
        break;
      case 'buy':
        result = E.buyCard(state, playerId, String(action.cardId || ''));
        break;
      case 'reserve':
        result = E.reserveCard(state, playerId, String(action.cardId || ''));
        break;
      case 'reserveBlind':
        result = E.reserveCard(state, playerId, null, { blindLevel: Number(action.level) });
        break;
      case 'discard':
        result = E.discardToken(state, String(action.color || ''));
        break;
      case 'noble':
        result = E.chooseNoble(state, String(action.nobleId || ''));
        break;
      default:
        break;
    }
    if (!result || !result.ok) {
      sendNetError(result ? result.reason : '无效操作', playerId);
      broadcastState();
      return;
    }
    handleEventSound();
    broadcastState();
    render();
  }

  function handleRelay(data, fromSeat) {
    if (!data || typeof data !== 'object') return;
    if (data.t === 'state' && online.role !== 'host') {
      applyOnlineState(data.state);
      return;
    }
    if (data.t === 'action' && online.role === 'host') {
      const seat = Number.isInteger(fromSeat) ? fromSeat : data.from;
      applyGuestAction(data.action, seat);
      return;
    }
    if (data.t === 'error' && online.role !== 'host') {
      clearWaitingTimer();
      online.waiting = false;
      toast(String(data.reason || '操作失败'), 'error');
      render();
    }
  }

  function handleNetMessage(message) {
    if (!message || typeof message.type !== 'string') return;
    switch (message.type) {
      case 'room':
        online.role = 'host';
        online.code = message.code;
        online.seat = 0;
        online.guests = [];
        online.active = true;
        online.error = '';
        online.phase = 'waiting-guest';
        if (ui.modal && ui.modal.type === 'online') renderModal();
        toast('房间已创建：' + message.code, 'gold');
        Sound.click();
        break;
      case 'joined':
        online.role = 'guest';
        online.code = message.code;
        online.seat = Number(message.seat) || 1;
        online.active = true;
        online.error = '';
        online.phase = 'waiting-host';
        removeRoomQuery();
        if (ui.modal && ui.modal.type === 'online') renderModal();
        toast('已加入房间 ' + message.code + ' · 座位 ' + online.seat, 'gold');
        Sound.click();
        break;
      case 'peer-joined':
        if (online.role === 'host' && !online.inGame) {
          const seat = Number(message.seat);
          if (seat >= 1 && seat <= 3 && !online.guests.some((guest) => guest.seat === seat)) {
            online.guests.push({ seat: seat, name: message.name || ('朋友 ' + seat) });
            online.guests.sort((a, b) => a.seat - b.seat);
          }
          if (ui.modal && ui.modal.type === 'online') renderModal();
        }
        break;
      case 'peer-left':
        endOnline(message.reason || '有玩家离开了房间');
        break;
      case 'relay':
        handleRelay(message.data, message.from);
        break;
      case 'error':
        if (online.inGame) {
          toast(String(message.reason || '联机错误'), 'error');
        } else {
          online.phase = 'error';
          online.error = String(message.reason || '联机错误');
          online.active = false;
          if (ui.modal && ui.modal.type === 'online') renderModal();
          toast(online.error, 'error');
        }
        break;
      case 'pong':
        break;
      default:
        break;
    }
  }

  function handleNetClose() {
    online.connected = false;
    if (online.inGame) {
      endOnline('与服务器断开连接');
      return;
    }
    if (online.active || online.phase === 'connecting' || online.phase === 'waiting-guest' || online.phase === 'waiting-host') {
      online.active = false;
      online.phase = 'error';
      online.error = '连接已断开';
      if (ui.modal && ui.modal.type === 'online') renderModal();
    }
  }

  function handleNetError() {
    if (online.inGame) toast('网络异常', 'error');
  }

  function sendGuestAction(action) {
    if (!NET || !online.net || online.role !== 'guest') {
      toast('联机未连接', 'error');
      return;
    }
    if (online.waiting) return;
    if (!online.net.send({ type: 'relay', data: { t: 'action', action: action } })) {
      toast('连接已断开', 'error');
      return;
    }
    online.waiting = true;
    clearWaitingTimer();
    online.waitingTimer = setTimeout(() => {
      if (!online.waiting) return;
      online.waiting = false;
      toast('房主同步超时，请检查网络', 'error');
      render();
    }, 8000);
    ui.selection = [];
    ui.modal = null;
    updateSelectionUI();
    renderTray();
    render();
  }

  function onlineCreate() {
    if (!NET || !online.net) {
      toast('联机模块未加载', 'error');
      return;
    }
    const input = document.getElementById('onlineServer');
    const url = NET.normalizeServerUrl(input ? input.value : online.serverUrl, location);
    if (!url) {
      online.phase = 'error';
      online.error = '服务器地址无效';
      renderModal();
      return;
    }
    saveServerUrl(url);
    online.phase = 'connecting';
    online.error = '';
    online.active = false;
    renderModal();
    online.net.connect(url, 8000).then(() => {
      if (!online.net.send({ type: 'create' })) throw new Error('发送建房请求失败');
    }).catch((err) => {
      online.phase = 'error';
      online.error = err && err.message ? err.message : '连接失败';
      online.active = false;
      if (online.net) online.net.close();
      if (ui.modal && ui.modal.type === 'online') renderModal();
      toast(online.error, 'error');
    });
  }

  function onlineJoin() {
    if (!NET || !online.net) {
      toast('联机模块未加载', 'error');
      return;
    }
    const input = document.getElementById('onlineServer');
    const url = NET.normalizeServerUrl(input ? input.value : online.serverUrl, location);
    if (!url) {
      online.phase = 'error';
      online.error = '服务器地址无效';
      renderModal();
      return;
    }
    const codeInput = document.getElementById('onlineRoom');
    const code = NET.cleanCode(codeInput ? codeInput.value : online.pendingRoom);
    if (code.length < 4) {
      toast('请输入 4 位房间码', 'error');
      return;
    }
    online.pendingRoom = code;
    saveServerUrl(url);
    online.phase = 'connecting';
    online.error = '';
    online.active = false;
    online.pendingJoinCode = code;
    renderModal();
    online.net.connect(url, 8000).then(() => {
      if (!online.net.send({ type: 'join', code: code })) throw new Error('发送加入请求失败');
    }).catch((err) => {
      online.phase = 'error';
      online.error = err && err.message ? err.message : '连接失败';
      online.active = false;
      if (online.net) online.net.close();
      if (ui.modal && ui.modal.type === 'online') renderModal();
      toast(online.error, 'error');
    });
  }

  function onlineCancel() {
    if (online.inGame) {
      leaveOnline();
      return;
    }
    if (online.net) {
      if (online.active) online.net.send({ type: 'leave' });
      online.net.close();
    }
    resetOnlineFields();
    ui.modal = null;
    ui.selection = [];
    ui.lastEventSeq = 0;
    render();
    toast('已取消联机');
    Sound.click();
  }

  function leaveOnline() {
    if (online.net) {
      if (online.active) online.net.send({ type: 'leave' });
      online.net.close();
    }
    resetOnlineFields();
    state = null;
    screen = 'title';
    ui.modal = null;
    ui.selection = [];
    ui.lastEventSeq = 0;
    render();
    toast('已离开房间');
    Sound.click();
  }

  function endOnline(message) {
    if (online.net) online.net.close();
    resetOnlineFields();
    state = null;
    screen = 'title';
    ui.modal = null;
    ui.selection = [];
    ui.lastEventSeq = 0;
    render();
    toast(message || '联机已结束', 'error', 'red');
  }

  function openOnline() {
    if (!NET) {
      toast('联机模块未加载', 'error');
      return;
    }
    if (online.inGame) {
      shareInvite();
      return;
    }
    ui.modal = { type: 'online' };
    renderModal();
    Sound.click();
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) { /* fall through */ }
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch (e) {
      return false;
    }
  }

  function inviteUrl() {
    if (!NET || !online.code) return '';
    return NET.shareUrl(location, online.code, online.serverUrl);
  }

  function copyInvite() {
    const url = inviteUrl();
    if (!url) {
      toast('联机分享需要先通过服务器打开游戏', 'error');
      return;
    }
    copyText(url).then((ok) => {
      toast(ok ? '邀请链接已复制' : '复制失败，请手动选择链接', ok ? 'gold' : 'error');
    });
  }

  function shareInvite() {
    const url = inviteUrl();
    if (!url) {
      toast('联机分享需要先通过服务器打开游戏', 'error');
      return;
    }
    if (navigator.share) {
      navigator.share({
        title: '宝石商人 · 联机对战',
        text: '来加入我的宝石商人房间：' + online.code,
        url: url,
      }).catch(function () {});
      return;
    }
    copyInvite();
  }

  function shareGame() {
    const url = (location.protocol === 'http:' || location.protocol === 'https:')
      ? location.origin + location.pathname
      : '';
    if (!url) {
      toast('当前是本地文件；可发送 index.html 文件，或先部署服务器', 'error');
      return;
    }
    if (navigator.share) {
      navigator.share({ title: '宝石商人', text: '来玩这个宝石商人小游戏', url: url }).catch(function () {});
      return;
    }
    copyText(url).then((ok) => toast(ok ? '游戏链接已复制' : '复制失败', ok ? 'gold' : 'error'));
  }

  async function downloadGame() {
    try {
      const base = location.href.split('?')[0].split('#')[0];
      if (!/^https?:/i.test(base)) throw new Error('file');
      const response = await fetch(base, { cache: 'no-store' });
      if (!response.ok) throw new Error('fetch');
      const blob = await response.blob();
      const anchor = document.createElement('a');
      anchor.href = URL.createObjectURL(blob);
      anchor.download = 'gem-merchant.html';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(anchor.href), 2000);
      toast('游戏文件已开始下载', 'gold');
    } catch (e) {
      toast('当前环境不能直接下载，请用浏览器菜单保存页面', 'error');
    }
  }

  function initOnline() {
    if (!NET) return;
    const fromUrl = NET.serverFromUrl(location);
    const stored = loadServerUrl();
    const fallback = NET.defaultServerUrl(location);
    const chosen = NET.normalizeServerUrl(fromUrl || stored || '', location) || fallback;
    online.serverUrl = chosen;
    if (fromUrl) saveServerUrl(chosen);
    online.pendingRoom = NET.roomFromUrl(location);
    online.connected = false;
    online.net = new NET.Net({
      onOpen: function () { online.connected = true; },
      onMessage: handleNetMessage,
      onClose: handleNetClose,
      onError: handleNetError,
    });
  }

  // ------------------------------------------------------------
  // 弹窗
  // ------------------------------------------------------------
  function bigCardHTML(card) {
    const player = state.players[0];
    const aff = E.affordability(player, card);
    const tint = E.GEM[card.bonus];
    const cost = E.COLORS.filter((c) => card.cost[c] > 0).map((c) =>
      '<span class="pip">' + gemSVG(c) + '<b>' + card.cost[c] + '</b></span>'
    ).join('');
    const art = ART
      ? ART.cardScene(card)
      : '<span class="card-gem-fallback">' + gemSVG(card.bonus) + '</span>';
    return '<div class="card big' + (aff.ok ? ' affordable' : '') + '" ' +
      'data-level="' + card.level + '" data-points="' + card.points + '" ' +
      'style="--tint:' + tint.hex + ';--tint-soft:' + tint.hex + '33" role="img" aria-label="' + esc(cardLabel(card)) + '">' +
      '<span class="card-art-wrap">' + art + '</span>' +
      '<span class="card-shade" aria-hidden="true"></span>' +
      '<span class="card-frame" aria-hidden="true"></span>' +
      '<span class="card-pts' + (card.points ? '' : ' zero') + (card.points >= 3 ? ' high' : '') + '">' + card.points + '</span>' +
      '<span class="card-level">' + E.LEVEL_NUMERALS[card.level] + '</span>' +
      '<span class="card-cost">' + cost + '</span>' +
    '</div>';
  }

  function costRowsHTML(card) {
    const player = state.players[0];
    let goldLeft = player.tokens.gold;
    return E.COLORS.filter((c) => card.cost[c] > 0).map((c) => {
      const cost = card.cost[c];
      const bonus = Math.min(player.bonuses[c], cost);
      const need = cost - bonus;
      const paid = Math.min(need, player.tokens[c]);
      const short = need - paid;
      const useGold = Math.min(short, goldLeft);
      goldLeft -= useGold;
      let statusClass = 'miss';
      let statusText = '缺 ' + short;
      if (need === 0) {
        statusClass = 'ok';
        statusText = '永久覆盖';
      } else if (short === 0) {
        statusClass = 'ok';
        statusText = '已备齐';
      } else if (useGold === short) {
        statusClass = 'gold';
        statusText = '黄金补 ' + short;
      } else if (useGold > 0) {
        statusClass = 'miss';
        statusText = '金补 ' + useGold + ' · 缺 ' + (short - useGold);
      }
      return '<div class="cost-row">' +
        '<span class="mini-gem">' + gemSVG(c) + '</span>' +
        '<span class="cost-name">' + E.GEM[c].name +
          (bonus ? ' <em>永久−' + bonus + '</em>' : '') + '</span>' +
        '<span class="cost-val">×' + cost + '</span>' +
        '<span class="cost-state ' + statusClass + '">' + statusText + '</span>' +
      '</div>';
    }).join('');
  }

  function cardModalHTML(cardId) {
    if (!state) return null;
    const loc = E.locateCard(state, cardId);
    if (!loc) return null;
    if (loc.zone === 'reserved' && loc.player !== 0) return null;
    const card = E.cardAt(state, loc);
    if (!card) return null;

    const player = state.players[0];
    const aff = E.affordability(player, card);
    const humanTurn = state.current === 0 && state.phase === 'play' && !isWaiting();
    const isReserved = loc.zone === 'reserved';
    const canBuy = humanTurn && aff.ok;
    const canReserve = humanTurn && !isReserved && player.reserved.length < 3;
    const goldText = state.bank.gold > 0 ? '+1 黄金' : '无黄金';
    const note = !humanTurn
      ? (isWaiting() ? '已提交，等待房主同步。' : isOnlineGame() ? '等待其他玩家完成回合。' : '等待 AI 完成回合。')
      : isReserved
        ? '这张卡已在你的预订区。购买它不会消耗市场补牌。'
        : player.reserved.length >= 3
          ? '预订区已满（3/3）。先购买一张预订卡，或直接购买场上卡牌。'
          : '预订可立即获得 1 枚黄金。黄金能替代任意颜色的宝石。';

    return '<div class="modal-backdrop" data-act="backdrop">' +
      '<div class="sheet wide" role="dialog" aria-modal="true" aria-label="' + esc(card.fullName || card.name) + '">' +
        '<button class="sheet-close" data-act="closeModal" aria-label="关闭">' + icon('close') + '</button>' +
        '<div class="sheet-kicker">LEVEL ' + E.LEVEL_NUMERALS[card.level] + ' · ' + E.LEVEL_NAMES[card.level] +
          (isReserved ? ' · 已预订' : '') + '</div>' +
        '<div class="card-detail">' +
          '<div class="big-card-wrap">' + bigCardHTML(card) + '</div>' +
          '<div class="card-info">' +
            '<h3>' + esc(card.fullName || card.name) + '</h3>' +
            '<div class="card-sub">永久获得 1 枚' + E.GEM[card.bonus].name + '折扣，之后购买卡牌自动抵扣。</div>' +
            '<div class="prestige"><b>' + card.points + '</b><small>声望</small></div>' +
            '<div class="cost-box">' + costRowsHTML(card) + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="card-note">' + note + '</div>' +
        '<div class="sheet-actions">' +
          '<button class="btn primary" data-act="buy" data-id="' + card.id + '"' + (canBuy ? '' : ' disabled') + '>' +
            (aff.ok ? '购买' : '宝石不足') + '</button>' +
          (isReserved ? '' :
            '<button class="btn ghost" data-act="reserve" data-id="' + card.id + '"' + (canReserve ? '' : ' disabled') + '>' +
              '预订 <span class="sub">' + goldText + '</span></button>') +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function reservedModalHTML() {
    if (!state) return null;
    const player = state.players[0];
    const humanTurn = state.current === 0 && state.phase === 'play' && !isWaiting();
    const items = player.reserved.map((card) => {
      const aff = E.affordability(player, card);
      return '<div class="reserved-item">' +
        cardHTML(card) +
        '<div class="res-info">' +
          '<div class="res-name">' + esc(card.fullName || card.name) + '</div>' +
          '<div class="res-meta">' + card.points + ' 分 · ' +
            E.COLORS.filter((c) => card.cost[c] > 0).map((c) => E.GEM[c].short + card.cost[c]).join(' ') +
            (aff.ok ? ' · 可购买' : ' · 还差宝石') + '</div>' +
        '</div>' +
        '<button class="btn primary small" data-act="buy" data-id="' + card.id + '"' +
          (humanTurn && aff.ok ? '' : ' disabled') + '>购买</button>' +
      '</div>';
    }).join('');

    const blind = [3, 2, 1].map((level) => {
      const cards = state.decks[level].length;
      const disabled = !humanTurn || cards <= 0 || player.reserved.length >= 3;
      return '<button class="btn ghost" data-act="blind" data-level="' + level + '"' + (disabled ? ' disabled' : '') + '>' +
        E.LEVEL_NUMERALS[level] + ' <span class="sub">' + cards + ' 张</span></button>';
    }).join('');

    return '<div class="modal-backdrop" data-act="backdrop">' +
      '<div class="sheet" role="dialog" aria-modal="true" aria-label="我的预订">' +
        '<button class="sheet-close" data-act="closeModal" aria-label="关闭">' + icon('close') + '</button>' +
        '<div class="sheet-kicker">YOUR RESERVE · ' + player.reserved.length + ' / 3</div>' +
        '<h2>我的预订</h2>' +
        '<p class="lead">预订的卡牌只有你能购买。购买前它不会占用市场补牌。</p>' +
        (player.reserved.length
          ? '<div class="reserved-list">' + items + '</div>'
          : '<div class="empty-state">' + gemSVG('white') + '还没有预订卡牌<br>在市场上点一张卡即可预订</div>') +
        '<div class="blind-box">' +
          '<h4>盲抽预订</h4>' +
          '<p>从指定等级牌堆顶抽一张，立即获得 1 枚黄金。看不看运气，都是商人的一部分。</p>' +
          '<div class="blind-levels">' + blind + '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function nobleInfoModalHTML(nobleId) {
    if (!state) return null;
    const noble = state.nobles.find((n) => n.id === nobleId);
    if (!noble) return null;
    const rows = E.COLORS.filter((c) => noble.req[c] > 0).map((c) => {
      const req = noble.req[c];
      const met = state.players[0].bonuses[c] >= req;
      const players = state.players.map((player, index) => {
        const value = Math.min(player.bonuses[c], req);
        return '<span class="req-player' + (index === 0 ? ' me' : '') + (value >= req ? ' met' : '') + '">' +
          '<i>' + (index === 0 ? '你' : esc(player.name.slice(0, 2))) + '</i>' +
          '<b>' + value + '/' + req + '</b></span>';
      }).join('');
      return '<div class="req-line' + (met ? ' met' : '') + '">' +
        '<span class="mini-gem">' + gemSVG(c) + '</span>' +
        '<span class="req-name">' + E.GEM[c].name + '</span>' +
        '<span class="req-count">×' + req + '</span>' +
        '<span class="req-players">' + players + '</span>' +
      '</div>';
    }).join('');
    return '<div class="modal-backdrop" data-act="backdrop">' +
      '<div class="sheet" role="dialog" aria-modal="true" aria-label="' + esc(noble.name) + '">' +
        '<button class="sheet-close" data-act="closeModal" aria-label="关闭">' + icon('close') + '</button>' +
        '<div class="noble-hero">' +
          '<span class="noble-portrait-big">' + (ART ? ART.noblePortrait(noble) : icon('crown')) + '</span>' +
          '<div><div class="noble-title">' + esc(noble.name) + '<small>NOBLE VISITOR · 3 PRESTIGE</small></div></div>' +
        '</div>' +
        '<div class="req-table">' + rows + '</div>' +
        '<div class="card-note">当你的永久宝石达到全部要求时，贵族会在你的回合结束后自动来访。' +
          '多位贵族同时满足时，你只能选择一位。</div>' +
        '<div class="sheet-actions"><button class="btn ghost" data-act="closeModal">知道了</button></div>' +
      '</div>' +
    '</div>';
  }

  function nobleChoiceModalHTML() {
    if (!state || state.phase !== 'noble' || !state.pending) return null;
    const choices = state.pending.eligible.map((id) => {
      const noble = state.nobles.find((n) => n.id === id);
      if (!noble) return '';
      const reqs = E.COLORS.filter((c) => noble.req[c] > 0).map((c) =>
        '<span class="mini-gem">' + gemSVG(c) + '<b style="position:absolute;inset:0;display:grid;place-items:center;font-size:7px;color:#fff;text-shadow:0 1px 2px #000">' +
          noble.req[c] + '</b></span>'
      ).join('');
      return '<button class="noble-choice" data-act="chooseNoble" data-id="' + noble.id + '">' +
        '<span class="noble-portrait-choice">' + (ART ? ART.noblePortrait(noble) : icon('crown')) + '</span>' +
        '<span class="nc-main">' +
          '<span class="nc-name">' + esc(noble.name) + '</span>' +
          '<span class="nc-reqs">' + reqs + '</span>' +
        '</span>' +
        '<span class="btn primary small">选择</span>' +
      '</button>';
    }).join('');
    return '<div class="modal-backdrop">' +
      '<div class="sheet" role="dialog" aria-modal="true" aria-label="选择贵族">' +
        '<div class="sheet-kicker">A NOBLE VISIT · 3 PRESTIGE</div>' +
        '<h2>贵族的青睐</h2>' +
        '<p class="lead">你同时满足了多位贵族的要求。选择一位来访，获得 3 分；其余贵族留在场上。</p>' +
        '<div class="noble-choice-list">' + choices + '</div>' +
      '</div>' +
    '</div>';
  }

  function discardModalHTML() {
    if (!state || state.phase !== 'discard' || !state.pending) return null;
    const player = state.players[0];
    const need = state.pending.returnCount;
    const buttons = E.ALL_GEMS.map((c) => {
      const count = player.tokens[c];
      return '<button class="discard-gem" data-act="discardGem" data-color="' + c + '"' +
        (count > 0 ? '' : ' disabled') + '>' +
        '<span class="dg-svg">' + gemSVG(c) + '</span>' +
        '<span class="dg-name">' + E.GEM[c].name + '</span>' +
        '<span class="dg-count">×' + count + '</span>' +
      '</button>';
    }).join('');
    return '<div class="modal-backdrop">' +
      '<div class="sheet" role="dialog" aria-modal="true" aria-label="归还宝石">' +
        '<div class="discard-head">' +
          gemSVG('gold') +
          '<h2>宝石太多啦</h2>' +
          '<p>最多只能持有 <b>10</b> 枚宝石。请归还 <span class="discard-count">' + need + '</span> 枚。</p>' +
        '</div>' +
        '<div class="discard-gems">' + buttons + '</div>' +
        '<div class="discard-progress">还需要归还 <b>' + need + '</b> 枚 · 黄金也可以归还</div>' +
      '</div>' +
    '</div>';
  }

  function gameOverModalHTML() {
    if (!state || state.phase !== 'over') return null;
    recordResultOnce();
    playGameOverSoundOnce();

    const w = state.winner;
    const draw = w === -1;
    const humanWin = w === 0;
    const lose = !draw && !humanWin;
    const winner = draw ? null : state.players[w];
    const title = draw ? '平分秋色' : humanWin ? '你赢了' : (winner ? winner.name + ' 赢了' : '对局结束');
    const verdict = draw ? '宝石与荣耀，平分秋色' : humanWin ? '宝石与荣耀，尽归你手' : '下次，把贵族也一并赢回来';
    const elapsed = Math.max(1, Math.round(((state.finishedAt || Date.now()) - (state.createdAt || Date.now())) / 60000));
    const top = state.players.slice().sort((a, b) => b.points - a.points || a.cards.length - b.cards.length)[0];
    const samePoints = state.players.filter((p) => p.points === top.points).length > 1;
    const onlineMode = isOnlineGame();
    let note = draw
      ? '总分与卡牌数完全相同，这一局不分胜负。'
      : (samePoints ? '最高分相同，以已购卡牌更少者取胜。' : '最后一轮结束') + ' · 本局用时 ' + elapsed + ' 分钟';
    if (onlineMode) {
      const room = online.code ? '房间 ' + esc(online.code) + ' · ' : '';
      note += online.role === 'host' ? ' ' + room + '可以再来一局。' : ' ' + room + '等待房主再开一局，或离开房间。';
    }
    const actions = onlineMode
      ? (online.role === 'host'
        ? '<button class="btn primary" data-act="rematchHost">再来一局</button>' +
          '<button class="btn ghost" data-act="leaveOnline">离开房间</button>'
        : '<button class="btn primary" data-act="leaveOnline">离开房间</button>')
      : '<button class="btn primary" data-act="again">再来一局</button>' +
        '<button class="btn ghost" data-act="home">返回首页</button>';

    const confetti = (humanWin || draw)
      ? '<div class="confetti" aria-hidden="true">' + Array.from({ length: 18 }).map(() => {
          const colors = ['#e2b256', '#f4e2a9', '#d84a5c', '#1da578', '#3d82e8'];
          const left = Math.random() * 100;
          const delay = Math.random() * 2.4;
          const dur = 2.6 + Math.random() * 2.2;
          const size = 4 + Math.random() * 4;
          return '<i style="left:' + left.toFixed(1) + '%;width:' + size.toFixed(1) + 'px;height:' +
            (size * 1.6).toFixed(1) + 'px;background:' + colors[Math.floor(Math.random() * colors.length)] +
            ';animation-delay:' + delay.toFixed(2) + 's;animation-duration:' + dur.toFixed(2) + 's"></i>';
        }).join('') + '</div>'
      : '';

    const scoreCards = state.players.map((player, index) => {
      const isWinner = w === index;
      const isLoser = !draw && index === 0 && w !== 0;
      return '<div class="over-score ' + (isWinner ? 'winner' : isLoser ? 'loser' : '') + '">' +
        '<div class="os-name">' + (index === 0 ? '你' : esc(player.name)) + '</div>' +
        '<div class="os-points">' + player.points + '</div>' +
        '<div class="os-meta">卡牌 ' + player.cards.length + ' · 贵族 ' + player.nobles.length + '</div>' +
      '</div>';
    }).join('');

    return '<div class="modal-backdrop gameover">' +
      '<div class="over-panel' + (lose ? ' lose' : '') + '">' + confetti +
        '<div class="over-crown">' + icon(humanWin ? 'trophy' : draw ? 'crown' : 'crown') + '</div>' +
        '<div class="over-kicker">THE GEM EXCHANGE</div>' +
        '<h2>' + title + '</h2>' +
        '<div class="over-verdict">' + verdict + '</div>' +
        '<div class="over-scores four">' + scoreCards + '</div>' +
        '<div class="over-note">' + note + '</div>' +
        '<div class="over-actions">' + actions + '</div>' +
      '</div>' +
    '</div>';
  }

  function rulesModalHTML() {
    return '<div class="modal-backdrop" data-act="backdrop">' +
      '<div class="sheet wide" role="dialog" aria-modal="true" aria-label="玩法说明">' +
        '<button class="sheet-close" data-act="closeModal" aria-label="关闭">' + icon('close') + '</button>' +
        '<div class="sheet-kicker">HOW TO PLAY</div>' +
        '<h2>玩法说明</h2>' +
        '<div class="rules-body">' +
          '<h3>' + gemSVG('white') + '目标</h3>' +
          '<p>率先获得 <b>15 分</b>。达到 15 分后，本轮会补完，让所有玩家回合数相同，再比总分。同分时，<b>卡牌更少</b>的玩家获胜。</p>' +

          '<h3>' + gemSVG('blue') + '每回合四选一</h3>' +
          '<div class="rule-card"><span class="rule-no">1</span><span class="rule-text">拿 <b>3 种不同颜色</b>的宝石，每种 1 枚。</span></div>' +
          '<div class="rule-card"><span class="rule-no">2</span><span class="rule-text">拿 <b>2 枚同色</b>宝石。该颜色银行库存必须至少有 <b>4 枚</b>。</span></div>' +
          '<div class="rule-card"><span class="rule-no">3</span><span class="rule-text"><b>预订</b> 1 张卡牌，并立即拿 1 枚黄金。最多预订 3 张。</span></div>' +
          '<div class="rule-card"><span class="rule-no">4</span><span class="rule-text"><b>购买</b> 1 张场上或自己预订的卡牌。</span></div>' +

          '<h3>' + gemSVG('green') + '卡牌怎么读</h3>' +
          '<p>左上角是<b>声望分</b>，底部是<b>费用</b>，中央大宝石是<b>永久折扣</b>。每买一张，之后买卡时该颜色就自动少付 1 枚。</p>' +
          '<p><b>黄金</b>可以替代任意颜色，但只能通过预订获得。</p>' +

          '<h3>' + gemSVG('red') + '贵族</h3>' +
          '<p>贵族价值 <b>3 分</b>。当你的永久宝石达到贵族要求时，贵族会在行动结束后自动来访。一次行动最多一位；同时满足多位时，你选择一位。</p>' +

          '<h3>' + gemSVG('black') + '限制</h3>' +
          '<ul><li>最多持有 <b>10 枚</b>宝石（含黄金），超出部分必须归还。</li><li>预订区最多 <b>3 张</b>，预订的卡牌不能被其他玩家购买。</li><li>黄金不参与四人局的移除，始终为 5 枚。</li></ul>' +

          '<h3>' + gemSVG('gold') + '四人局</h3>' +
          '<p>每种宝石 <b>10 枚</b>，黄金 <b>5 枚</b>，贵族 <b>5 位</b>。你先手；另外 3 位是 AI 对手。</p>' +

          '<h3>' + gemSVG('white') + '操作</h3>' +
          '<p>点银行宝石拿取；再点一次同色可拿 2 枚。点市场卡牌查看详情、购买或预订。点右下角“预订”查看手牌与盲抽预订。顶部的三名对手会显示永久宝石、宝石总数、预订与贵族数。</p>' +
          '<p class="small">完整规则书（12 页 A4，含 90 张卡牌图鉴）：<a href="rulebook.html" target="_blank" rel="noopener">rulebook.html</a>。联机服务器会同时托管该文件；单机版可在完整包中找到。</p>' +

          '<div class="credit">玩法源自 Marc André 的桌游《璀璨宝石》(Splendor)。<br>本作是学习交流用的同人小游戏，无商业用途。</div>' +
        '</div>' +
        '<div class="sheet-actions"><button class="btn primary" data-act="closeModal">明白了</button></div>' +
      '</div>' +
    '</div>';
  }

  function menuModalHTML() {
    const onlineMode = isOnlineGame();
    const turn = Math.floor((state.turnCount || 0) / 4) + 1;
    const kicker = onlineMode
      ? 'ONLINE · ' + (online.role === 'host' ? '房主' : '访客') + ' · 房间 ' + esc(online.code || '')
      : 'PAUSE · 第 ' + turn + ' 回合';
    const title = onlineMode ? '联机对局' : '暂停';
    const canStart = onlineMode && online.role === 'host' && !online.inGame && online.guests.length > 0;
    const items = onlineMode
      ? '<button class="btn ghost" data-act="closeModal"><span class="menu-ico">' + icon('arrowLeft') + '</span>继续游戏</button>' +
        (canStart ? '<button class="btn primary" data-act="onlineStart"><span class="menu-ico">' + icon('play') + '</span>开始对局</button>' : '') +
        '<button class="btn ghost" data-act="shareInvite"><span class="menu-ico">' + icon('share') + '</span>邀请好友</button>' +
        '<button class="btn ghost" data-act="rules"><span class="menu-ico">' + icon('book') + '</span>玩法说明</button>' +
        '<button class="btn ghost" data-act="sound"><span class="menu-ico">' + icon(ui.sound ? 'sound' : 'mute') + '</span>音效' +
          '<span class="menu-state">' + (ui.sound ? '开' : '关') + '</span></button>' +
        '<button class="btn ghost" data-act="downloadGame"><span class="menu-ico">' + icon('download') + '</span>下载游戏文件</button>' +
        '<button class="btn ghost danger" data-act="leaveOnline"><span class="menu-ico">' + icon('home') + '</span>离开房间</button>'
      : '<button class="btn ghost" data-act="closeModal"><span class="menu-ico">' + icon('arrowLeft') + '</span>继续游戏</button>' +
        '<button class="btn ghost" data-act="rules"><span class="menu-ico">' + icon('book') + '</span>玩法说明</button>' +
        '<button class="btn ghost" data-act="sound"><span class="menu-ico">' + icon(ui.sound ? 'sound' : 'mute') + '</span>音效' +
          '<span class="menu-state">' + (ui.sound ? '开' : '关') + '</span></button>' +
        '<button class="btn ghost" data-act="shareGame"><span class="menu-ico">' + icon('share') + '</span>分享游戏</button>' +
        '<button class="btn ghost" data-act="downloadGame"><span class="menu-ico">' + icon('download') + '</span>下载游戏文件</button>' +
        '<button class="btn ghost danger" data-act="restart"><span class="menu-ico">' + icon('refresh') + '</span>重新开始</button>' +
        '<button class="btn ghost" data-act="home"><span class="menu-ico">' + icon('home') + '</span>返回首页</button>';
    return '<div class="modal-backdrop" data-act="backdrop">' +
      '<div class="sheet" role="dialog" aria-modal="true" aria-label="菜单">' +
        '<button class="sheet-close" data-act="closeModal" aria-label="关闭">' + icon('close') + '</button>' +
        '<div class="sheet-kicker">' + kicker + '</div>' +
        '<h2>' + title + '</h2>' +
        '<div class="menu-list">' + items + '</div>' +
        '<div class="menu-foot">' + (onlineMode ? '对局由房主同步 · 断线后需重新建房' : '对局会自动保存 · 可随时回来') + '</div>' +
      '</div>' +
    '</div>';
  }

  function confirmRestartModalHTML() {
    return '<div class="modal-backdrop" data-act="backdrop">' +
      '<div class="sheet" role="dialog" aria-modal="true" aria-label="确认重新开始">' +
        '<button class="sheet-close" data-act="cancelRestart" aria-label="关闭">' + icon('close') + '</button>' +
        '<div class="sheet-kicker">RESTART</div>' +
        '<h2 style="text-align:center">重新开始？</h2>' +
        '<p class="confirm-copy">当前对局会被放弃。<br>已经获得的分数和卡牌不会保留。</p>' +
        '<div class="sheet-actions">' +
          '<button class="btn ghost" data-act="cancelRestart">取消</button>' +
          '<button class="btn primary" data-act="confirmRestart">确定重开</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function onlineModalHTML() {
    if (!NET) {
      return '<div class="modal-backdrop" data-act="backdrop"><div class="sheet" role="dialog" aria-modal="true">' +
        '<button class="sheet-close" data-act="closeModal" aria-label="关闭">' + icon('close') + '</button>' +
        '<div class="sheet-kicker">ONLINE</div><h2>联机模块未加载</h2>' +
        '<p class="lead">请检查 index.html 是否包含 net.js。单机模式仍然可以玩。</p>' +
        '<div class="sheet-actions"><button class="btn primary" data-act="closeModal">知道了</button></div>' +
      '</div></div>';
    }

    const fileMode = location.protocol === 'file:';
    const defaultServer = NET.defaultServerUrl(location);
    const server = online.serverUrl || defaultServer;
    const code = online.code || online.pendingRoom || '';
    const invite = online.code ? NET.shareUrl(location, online.code, server) : '';
    const customServer = server !== defaultServer;
    const closeBtn = '<button class="sheet-close" data-act="closeModal" aria-label="关闭">' + icon('close') + '</button>';

    let body = '';
    if (online.inGame) {
      body = '<div class="sheet-kicker">ONLINE · ROOM</div>' +
        '<h2>联机对局</h2>' +
        '<p class="lead">当前房间码。把链接发给朋友，下一局可以一起加入。</p>' +
        '<div class="room-code">' + esc(online.code) + '</div>' +
        (invite
          ? '<div class="invite-row"><input class="text-input invite-input" readonly value="' + esc(invite) + '" aria-label="邀请链接"><button class="icon-btn" data-act="copyInvite" aria-label="复制邀请链接">' + icon('copy') + '</button></div>'
          : '<div class="online-warning">当前是本地文件，无法生成分享链接；请用服务器地址打开。</div>') +
        '<div class="online-actions">' +
          '<button class="btn primary" data-act="shareInvite">' + icon('share') + '分享邀请</button>' +
          '<button class="btn ghost" data-act="closeModal">返回对局</button>' +
        '</div>';
    } else if (online.phase === 'waiting-guest') {
      const seats = [0, 1, 2, 3].map((index) => {
        if (index === 0) return '<div class="seat filled"><b>你</b><span>房主 · 先手</span></div>';
        const guest = online.guests.find((item) => item.seat === index);
        if (guest) return '<div class="seat filled"><b>' + esc(guest.name) + '</b><span>朋友 · 座位 ' + index + '</span></div>';
        return '<div class="seat empty"><b>空位</b><span>AI 补位</span></div>';
      }).join('');
      const joined = online.guests.length + 1;
      body = '<div class="sheet-kicker">ONLINE · LOBBY</div>' +
        '<h2>房间大厅</h2>' +
        '<p class="lead">把房间码或邀请链接发给朋友。至少 1 位朋友加入即可开始，空位由 AI 补足到 4 人。</p>' +
        '<div class="room-code">' + esc(code) + '</div>' +
        (invite
          ? '<div class="invite-row"><input class="text-input invite-input" readonly value="' + esc(invite) + '" aria-label="邀请链接"><button class="icon-btn" data-act="copyInvite" aria-label="复制邀请链接">' + icon('copy') + '</button></div>'
          : '<div class="online-warning">当前是本地文件，无法生成分享链接。请把房间码发给朋友，并让他们打开同一个服务器地址。</div>') +
        '<div class="seat-list">' + seats + '</div>' +
        '<div class="online-actions">' +
          '<button class="btn primary" data-act="onlineStart"' + (online.guests.length ? '' : ' disabled') + '>开始对局 · ' + joined + '/4 人</button>' +
          '<button class="btn ghost" data-act="shareInvite">' + icon('share') + '分享邀请</button>' +
        '</div>' +
        '<div class="online-status"><i></i> ' + (online.guests.length ? '已加入 ' + joined + ' 人，等待开始' : '等待朋友加入') + '<span class="dots"><i></i><i></i><i></i></span></div>' +
        '<div class="online-note">房间码 <b>' + esc(code) + '</b> · ' + esc(server) + '</div>' +
        '<button class="btn ghost danger online-cancel" data-act="onlineCancel">取消房间</button>';
    } else if (online.phase === 'waiting-host') {
      body = '<div class="sheet-kicker">ONLINE · ROOM</div>' +
        '<h2>已加入房间</h2>' +
        '<div class="room-code">' + esc(code) + '</div>' +
        '<p class="lead">你坐在第 <b>' + (online.seat || 1) + '</b> 位。等待房主开始对局；空位会由 AI 补足到 4 人。</p>' +
        '<div class="online-status"><i></i> 等待房主开始<span class="dots"><i></i><i></i><i></i></span></div>' +
        '<div class="online-note">房间码 <b>' + esc(code) + '</b> · ' + esc(server) + '</div>' +
        '<button class="btn ghost danger online-cancel" data-act="onlineCancel">离开房间</button>';
    } else if (online.phase === 'connecting') {
      body = '<div class="sheet-kicker">ONLINE</div>' +
        '<h2>正在连接…</h2>' +
        '<p class="lead">' + esc(server) + '</p>' +
        '<div class="online-status"><i></i> 连接服务器<span class="dots"><i></i><i></i><i></i></span></div>' +
        '<button class="btn ghost danger online-cancel" data-act="onlineCancel">取消</button>';
    } else {
      body = '<div class="sheet-kicker">ONLINE PLAY · 2–4 人联机</div>' +
        '<h2>联机对战</h2>' +
        '<p class="lead">创建房间，把房间码发给朋友；2–4 人同局，空位由 AI 补足。房主先手。</p>' +
        (online.error ? '<div class="online-error">' + esc(online.error) + '</div>' : '') +
        '<div class="online-form">' +
          '<label class="field"><span>房间码</span>' +
            '<div class="join-row">' +
              '<input id="onlineRoom" class="text-input code-input" maxlength="5" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="例如 K6K9" value="' + esc(online.pendingRoom || '') + '" aria-label="房间码">' +
              '<button class="btn primary small" data-act="onlineJoin">加入</button>' +
            '</div>' +
          '</label>' +
          '<button class="btn ghost online-create" data-act="onlineCreate">' + icon('plus') + '创建新房间</button>' +
        '</div>' +
        '<p class="online-hint">联机需要 WebSocket 服务器：本地运行 <code>npm start</code>，或部署 <code>server.mjs</code>。静态托管请展开「服务器设置」。</p>' +
        '<details class="online-server"' + (fileMode || customServer ? ' open' : '') + '>' +
          '<summary>服务器设置</summary>' +
          '<label class="field"><span>WebSocket 地址</span>' +
            '<input id="onlineServer" class="text-input" inputmode="url" spellcheck="false" value="' + esc(server) + '" placeholder="wss://your-app.onrender.com/ws" aria-label="WebSocket 地址">' +
          '</label>' +
          '<p class="online-hint">默认使用当前站点的 /ws。如果页面放在 GitHub Pages 等静态托管上，请填部署好的 WebSocket 地址。</p>' +
        '</details>' +
        (fileMode ? '<div class="online-warning">当前是本地文件。联机请通过服务器地址打开；同一设备可填 <code>ws://localhost:8787/ws</code>，朋友需要能访问你的服务器。</div>' : '') +
        '<div class="online-note">房主权威：访客动作会先发给房主校验再同步。断线后需重新建房，v1 暂不支持中途重连。</div>';
    }

    return '<div class="modal-backdrop" data-act="backdrop">' +
      '<div class="sheet online-sheet" role="dialog" aria-modal="true" aria-label="联机对战">' +
        closeBtn + body +
      '</div>' +
    '</div>';
  }

  function renderModal() {
    if (!modalEl) return;
    if (!ui.modal) {
      modalEl.innerHTML = '';
      document.body.classList.remove('modal-open');
      return;
    }
    let html = null;
    switch (ui.modal.type) {
      case 'card': html = cardModalHTML(ui.modal.cardId); break;
      case 'reserved': html = reservedModalHTML(); break;
      case 'noble': html = nobleInfoModalHTML(ui.modal.nobleId); break;
      case 'nobleChoice': html = nobleChoiceModalHTML(); break;
      case 'discard': html = discardModalHTML(); break;
      case 'gameover': html = gameOverModalHTML(); break;
      case 'rules': html = rulesModalHTML(); break;
      case 'menu': html = menuModalHTML(); break;
      case 'online': html = onlineModalHTML(); break;
      case 'confirmRestart': html = confirmRestartModalHTML(); break;
      default: html = null;
    }
    if (!html) {
      ui.modal = null;
      modalEl.innerHTML = '';
      document.body.classList.remove('modal-open');
      return;
    }
    modalEl.innerHTML = html;
    document.body.classList.add('modal-open');
  }

  function syncPhaseModal() {
    if (!state) {
      if (ui.modal && !['rules', 'menu'].includes(ui.modal.type)) ui.modal = null;
      return;
    }
    if (isWaiting() && state.phase !== 'over') {
      if (ui.modal && ['discard', 'nobleChoice'].includes(ui.modal.type)) ui.modal = null;
      return;
    }
    if (state.phase === 'over') {
      if (!ui.modal || ui.modal.type !== 'gameover') ui.modal = { type: 'gameover' };
      return;
    }
    if (state.current === 0 && state.phase === 'discard') {
      if (!ui.modal || ui.modal.type !== 'discard') ui.modal = { type: 'discard' };
      return;
    }
    if (state.current === 0 && state.phase === 'noble') {
      if (!ui.modal || ui.modal.type !== 'nobleChoice') ui.modal = { type: 'nobleChoice' };
      return;
    }
    if (ui.modal && ['discard', 'nobleChoice', 'gameover'].includes(ui.modal.type)) {
      ui.modal = null;
    }
  }

  function closeModal() {
    if (!ui.modal) return;
    if (ui.modal.type === 'online' && !online.inGame &&
        (online.active || online.connected || online.phase === 'connecting')) {
      onlineCancel();
      return;
    }
    if (['discard', 'nobleChoice', 'gameover'].includes(ui.modal.type)) return;
    ui.modal = null;
    renderModal();
    Sound.click();
  }

  function openCard(cardId) {
    if (!state || screen !== 'game') return;
    const loc = E.locateCard(state, cardId);
    if (!loc) return;
    if (loc.zone === 'reserved' && loc.player !== 0) {
      toast('这是其他玩家预订的卡牌', 'error');
      return;
    }
    if (state.phase !== 'play') return;
    ui.selection = [];
    updateSelectionUI();
    renderTray();
    ui.modal = { type: 'card', cardId: cardId };
    renderModal();
    Sound.click();
  }

  function openReserved() {
    if (!state || screen !== 'game') return;
    ui.selection = [];
    updateSelectionUI();
    renderTray();
    ui.modal = { type: 'reserved' };
    renderModal();
    Sound.click();
  }

  function openNobleInfo(nobleId) {
    if (!state) return;
    ui.modal = { type: 'noble', nobleId: nobleId };
    renderModal();
    Sound.click();
  }

  function openRules() {
    ui.modal = { type: 'rules' };
    renderModal();
    Sound.click();
  }

  function openMenu() {
    if (!state) return;
    ui.modal = { type: 'menu' };
    renderModal();
    Sound.click();
  }

  // ------------------------------------------------------------
  // 事件音效 / 战绩
  // ------------------------------------------------------------
  function handleEventSound() {
    if (!state || !state.lastEvent) return;
    const ev = state.lastEvent;
    if (!ev.seq || ev.seq <= ui.lastEventSeq) return;
    ui.lastEventSeq = ev.seq;

    if (ev.type === 'buy' || ev.type === 'noble') {
      ui.flashPlayer = ev.player;
      if (ui.flashTimer) clearTimeout(ui.flashTimer);
      ui.flashTimer = setTimeout(() => { ui.flashPlayer = null; }, 850);
    }

    switch (ev.type) {
      case 'buy':
        Sound.buy(ev.points || 0);
        break;
      case 'noble':
        Sound.noble();
        toast(state.players[ev.player].name + '获得贵族【' + ev.nobleName + '】 +3', 'gold',
          ev.player === 0 ? 'white' : 'red');
        break;
      case 'reserve':
        Sound.reserve();
        break;
      case 'take':
        Sound.take();
        break;
      case 'final':
        Sound.final();
        toast(ev.immediate ? '本轮结束 · 终局' : '最后一轮 · 终局', 'gold');
        break;
      case 'discard':
        Sound.click();
        break;
      case 'gameover':
        break;
    }
  }

  function recordResultOnce() {
    if (!state || state.phase !== 'over' || isOnlineGame()) return;
    const key = state.seed + ':' + (state.finishedAt || 'end');
    if (ui.recordedKey === key) return;
    ui.recordedKey = key;
    if (state.winner === 0) ui.record.wins += 1;
    else if (state.winner === -1) ui.record.draws += 1;
    else ui.record.losses += 1;
    writeJSON(LS.record, ui.record);
    removeKey(LS.save);
  }

  function playGameOverSoundOnce() {
    if (!state || state.phase !== 'over') return;
    const key = state.seed + ':' + (state.finishedAt || 'end');
    if (ui.soundGameOverKey === key) return;
    ui.soundGameOverKey = key;
    if (state.winner === 0) Sound.win();
    else if (state.winner === -1) Sound.final();
    else Sound.lose();
  }

  // ------------------------------------------------------------
  // AI 调度 / 渲染
  // ------------------------------------------------------------
  function maybeScheduleAI(delay) {
    if (!state || screen !== 'game' || state.phase === 'over') return;
    if (isOnlineGame() && online.role !== 'host') return;
    const current = state.players[state.current];
    if (!current || !current.isAI) return;
    if (ui.aiTimer) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    const seat = state.current;
    const wait = delay || (state.phase === 'play' ? 760 : 440);
    ui.aiTimer = setTimeout(() => {
      ui.aiTimer = null;
      if (!state || screen !== 'game' || state.current !== seat || state.phase === 'over') return;
      const ok = E.aiPlay(state);
      if (!ok && state.current === seat && state.phase !== 'over') {
        ui.aiRetries += 1;
        if (ui.aiRetries < 3) {
          maybeScheduleAI(600);
          return;
        }
      }
      ui.aiRetries = 0;
      handleEventSound();
      if (state.current === 0 && state.phase === 'play') saveGame();
      if (isOnlineGame() && online.role === 'host' && online.inGame) broadcastState();
      render();
    }, wait);
  }

  function render() {
    if (!screenEl) return;
    if (screen === 'game' && state) {
      screenEl.className = 'screen game-screen';
      screenEl.innerHTML = gameHTML();
      syncPhaseModal();
    } else {
      screenEl.className = 'screen';
      screenEl.innerHTML = titleHTML();
      if (ui.modal && ui.modal.type !== 'rules') ui.modal = null;
    }
    renderModal();
    renderTray();
    maybeScheduleAI();
  }

  // ------------------------------------------------------------
  // 开始 / 继续 / 返回
  // ------------------------------------------------------------
  function startNewGame() {
    clearAITimer();
    state = E.createGame(Date.now(), { first: 0 });
    screen = 'game';
    ui.selection = [];
    ui.modal = null;
    ui.aiRetries = 0;
    ui.lastEventSeq = 0;
    ui.flashPlayer = null;
    ui.recordedKey = null;
    ui.soundGameOverKey = null;
    saveGame(true);
    render();
    Sound.start();
    setTimeout(() => {
      if (state && screen === 'game' && state.turnCount === 0) {
        toast('你先手 · 点击宝石，或点卡牌购买', 'gold', 'white');
      }
    }, 420);
  }

  function continueGame() {
    const saved = readSave();
    if (!saved) {
      toast('没有可继续的对局', 'error');
      render();
      return;
    }
    clearAITimer();
    state = saved;
    screen = 'game';
    ui.selection = [];
    ui.modal = null;
    ui.aiRetries = 0;
    ui.lastEventSeq = state.eventSeq || 0;
    ui.flashPlayer = null;
    render();
    Sound.start();
  }

  function goHome() {
    clearAITimer();
    if (state && state.phase === 'play' && state.current === 0) saveGame();
    screen = 'title';
    state = null;
    ui.selection = [];
    ui.modal = null;
    ui.lastEventSeq = 0;
    render();
    Sound.click();
  }

  function toggleSound() {
    ui.sound = !ui.sound;
    Sound.enabled = ui.sound;
    writeJSON(LS.settings, { sound: ui.sound });
    if (ui.sound) {
      Sound.init();
      Sound.click();
    }
    render();
  }

  // ------------------------------------------------------------
  // 点击与键盘
  // ------------------------------------------------------------
  function onClick(event) {
    const el = event.target.closest('[data-act]');
    if (!el) return;
    const act = el.getAttribute('data-act');

    switch (act) {
      case 'new': startNewGame(); break;
      case 'continue': continueGame(); break;
      case 'online': openOnline(); break;
      case 'onlineCreate': onlineCreate(); break;
      case 'onlineJoin': onlineJoin(); break;
      case 'onlineStart': startOnlineGame(false); break;
      case 'onlineCancel': onlineCancel(); break;
      case 'shareInvite': shareInvite(); break;
      case 'copyInvite': copyInvite(); break;
      case 'leaveOnline': leaveOnline(); break;
      case 'rematchHost': startOnlineGame(true); break;
      case 'shareGame': shareGame(); break;
      case 'downloadGame': downloadGame(); break;
      case 'rules': openRules(); break;
      case 'sound': toggleSound(); break;
      case 'menu': openMenu(); break;
      case 'card': openCard(el.getAttribute('data-id')); break;
      case 'gem': toggleGem(el.getAttribute('data-color')); break;
      case 'clearTake': clearSelection(); break;
      case 'confirmTake': confirmTake(); break;
      case 'buy': humanBuy(el.getAttribute('data-id')); break;
      case 'reserve': humanReserve(el.getAttribute('data-id')); break;
      case 'reserved': openReserved(); break;
      case 'noble': openNobleInfo(el.getAttribute('data-id')); break;
      case 'chooseNoble': humanChooseNoble(el.getAttribute('data-id')); break;
      case 'discardGem': humanDiscard(el.getAttribute('data-color')); break;
      case 'blind': humanReserveBlind(Number(el.getAttribute('data-level'))); break;
      case 'closeModal': closeModal(); break;
      case 'backdrop':
        if (event.target === el) closeModal();
        break;
      case 'again': startNewGame(); break;
      case 'home': goHome(); break;
      case 'restart':
        ui.modal = { type: 'confirmRestart' };
        renderModal();
        break;
      case 'cancelRestart':
        ui.modal = { type: 'menu' };
        renderModal();
        break;
      case 'confirmRestart': startNewGame(); break;
      default: break;
    }
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      if (ui.modal) {
        closeModal();
      } else if (ui.selection.length) {
        clearSelection();
      }
      return;
    }
    if (event.key === 'Enter' && ui.selection.length) {
      const active = document.activeElement;
      if (active && active.tagName === 'BUTTON') return;
      event.preventDefault();
      confirmTake();
    }
  }

  // ------------------------------------------------------------
  // 初始化
  // ------------------------------------------------------------
  function init() {
    const defs = document.getElementById('gem-defs');
    if (defs) defs.innerHTML = gemDefs();

    const settings = readJSON(LS.settings, null) || {};
    ui.sound = settings.sound !== false;
    Sound.enabled = ui.sound;
    ui.record = loadRecord();
    initOnline();

    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('input', (event) => {
      if (!event.target) return;
      if (event.target.id === 'onlineRoom') {
        online.pendingRoom = NET ? NET.cleanCode(event.target.value) : event.target.value;
      } else if (event.target.id === 'onlineServer') {
        online.serverUrl = event.target.value;
      }
    });
    document.addEventListener('pointerdown', () => Sound.init(), { passive: true });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        saveGame(false);
      } else {
        maybeScheduleAI(260);
      }
    });
    window.addEventListener('beforeunload', () => saveGame(false));

    render();

    if (online.pendingRoom && !online.inGame && !online.active) {
      setTimeout(() => {
        if (online.inGame || online.active) return;
        ui.modal = { type: 'online' };
        renderModal();
      }, 260);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
