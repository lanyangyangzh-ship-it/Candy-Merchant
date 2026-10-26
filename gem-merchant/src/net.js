/*
 * 宝石商人 · 联机协议辅助
 * ------------------------------------------------------------
 * 纯函数部分（sanitizeState / mirrorState / URL 工具）不依赖 DOM，
 * 可以在 Node 里单独测试；Net 只是浏览器 WebSocket 的薄封装。
 */
(function (global) {
  'use strict';

  const E = global.GemEngine;
  if (!E) throw new Error('GemNet 需要先加载 GemEngine');

  const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function hiddenCard(id, level) {
    return {
      id: id,
      level: level,
      bonus: 'white',
      points: 0,
      cost: { white: 1, blue: 0, green: 0, red: 0, black: 0 },
      name: '隐藏卡牌',
      hidden: true,
    };
  }

  /**
   * 出生给访客的公开快照：隐藏牌堆顺序和房主预订的卡牌。
   * 房主的分数、永久宝石、已购卡牌、贵族都是公开信息，保留。
   */
  function sanitizeState(state) {
    const copy = clone(state);
    copy.seed = 0;
    for (const level of [1, 2, 3]) {
      copy.decks[level] = (copy.decks[level] || []).map((_, i) => hiddenCard('hidden-deck-' + level + '-' + i, level));
    }
    if (copy.players && copy.players[0]) {
      copy.players[0].reserved = (copy.players[0].reserved || []).map((_, i) => hiddenCard('hidden-res-' + i, 1));
    }
    if (copy.lastEvent && copy.lastEvent.type === 'reserve' && copy.lastEvent.blind &&
        copy.lastEvent.player === 0) {
      copy.lastEvent.cardId = 'hidden';
    }
    return copy;
  }

  function replaceNames(text, a, b) {
    if (!a || !b || a === b) return text;
    const A = '\u0001';
    const B = '\u0002';
    return String(text)
      .split(a).join(A)
      .split(b).join(B)
      .split(A).join(b)
      .split(B).join(a);
  }

  /**
   * 访客视角：交换两名玩家，让本机永远是“玩家 0”。
   * 这样 UI 里所有硬编码 players[0] / current === 0 都能直接复用。
   */
  function mirrorState(raw) {
    const s = clone(raw);
    const hostName = s.players[0].name;
    const guestName = s.players[1].name;

    const host = s.players[0];
    s.players[0] = s.players[1];
    s.players[1] = host;
    s.players[0].name = '你';
    s.players[1].name = '罗伦佐';

    if (typeof s.current === 'number') s.current = 1 - s.current;
    if (typeof s.firstPlayer === 'number') s.firstPlayer = 1 - s.firstPlayer;
    if (s.finalTurnFor !== null && s.finalTurnFor !== undefined) s.finalTurnFor = 1 - s.finalTurnFor;
    if (s.winner !== null && s.winner !== undefined && s.winner !== -1) s.winner = 1 - s.winner;

    if (Array.isArray(s.log)) {
      for (const entry of s.log) {
        if (entry && typeof entry.text === 'string') {
          entry.text = replaceNames(entry.text, hostName, guestName);
        }
      }
    }

    if (s.lastEvent) {
      if (typeof s.lastEvent.player === 'number') s.lastEvent.player = 1 - s.lastEvent.player;
      if (s.lastEvent.type === 'gameover' && Array.isArray(s.lastEvent.points)) {
        s.lastEvent.points = [s.lastEvent.points[1], s.lastEvent.points[0]];
      }
    }

    s.meta = s.meta || {};
    s.meta.online = Object.assign({}, s.meta.online || {}, { role: 'guest' });
    return s;
  }

  /**
   * 4 人访客视角：把该访客旋转到玩家 0，隐藏其他人的预订与牌堆。
   * 返回的是可以直接 loadState 的完整状态，不需要再镜像。
   */
  function viewState(raw, seat) {
    const s = clone(raw);
    const count = s.players.length;
    const viewer = ((Number(seat) || 0) % count + count) % count;
    const order = [];
    for (let i = 0; i < count; i += 1) order.push((viewer + i) % count);

    s.players = order.map((index) => s.players[index]);
    s.players[0].name = '你';
    for (let i = 1; i < s.players.length; i += 1) {
      s.players[i].reserved = (s.players[i].reserved || [])
        .map((_, index) => hiddenCard('hidden-res-' + viewer + '-' + i + '-' + index, 1));
    }

    const rotate = (value) => (
      typeof value === 'number' && value >= 0 && value < count
        ? (value - viewer + count) % count
        : value
    );
    s.current = rotate(s.current);
    s.firstPlayer = rotate(s.firstPlayer);
    if (typeof s.winner === 'number' && s.winner >= 0) s.winner = rotate(s.winner);

    if (s.lastEvent) {
      if (typeof s.lastEvent.player === 'number') s.lastEvent.player = rotate(s.lastEvent.player);
      if (Array.isArray(s.lastEvent.points)) {
        const points = s.lastEvent.points.slice();
        s.lastEvent.points = order.map((index) => points[index]);
      }
      if (s.lastEvent.type === 'reserve' && s.lastEvent.player !== 0) {
        s.lastEvent.cardId = 'hidden';
        s.lastEvent.cardName = '隐藏卡牌';
      }
    }

    // 预订日志会暴露卡名；其他玩家的预订只保留“已预订”的事实
    if (Array.isArray(s.log)) s.log = s.log.filter((entry) => !entry || entry.kind !== 'reserve');

    for (const level of [1, 2, 3]) {
      s.decks[level] = (s.decks[level] || []).map((_, index) =>
        hiddenCard('hidden-deck-' + viewer + '-' + level + '-' + index, level));
    }
    s.seed = 0;
    s.meta = s.meta || {};
    s.meta.online = Object.assign({}, s.meta.online || {}, {
      role: 'guest',
      seat: viewer,
    });
    return s;
  }

  function defaultServerUrl(loc) {
    const l = loc || (typeof location !== 'undefined' ? location : null);
    if (!l) return 'ws://localhost:8787/ws';
    if (l.protocol === 'http:' || l.protocol === 'https:') {
      return (l.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + l.host + '/ws';
    }
    return 'ws://localhost:8787/ws';
  }

  function normalizeServerUrl(input, loc) {
    let value = String(input || '').trim();
    if (!value) return defaultServerUrl(loc);
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) && !/^(?:wss?|https?):\/\//i.test(value)) return null;
    if (/^http:\/\//i.test(value)) value = 'ws://' + value.slice(7);
    else if (/^https:\/\//i.test(value)) value = 'wss://' + value.slice(8);
    else if (!/^wss?:\/\//i.test(value)) value = 'ws://' + value;
    let url;
    try {
      url = new URL(value);
    } catch (e) {
      return null;
    }
    if (url.protocol !== 'ws:' && url.protocol !== 'wss:') return null;
    const securePage = loc
      ? loc.protocol === 'https:'
      : (typeof location !== 'undefined' && location.protocol === 'https:');
    if (securePage && url.protocol === 'ws:') url.protocol = 'wss:';
    if (!url.pathname || url.pathname === '/') url.pathname = '/ws';
    url.hash = '';
    return url.toString();
  }

  function shareUrl(loc, code, serverUrl) {
    const l = loc || (typeof location !== 'undefined' ? location : null);
    if (!l || !/^https?:$/.test(l.protocol)) return '';
    const url = new URL(l.href);
    url.search = '';
    url.hash = '';
    if (serverUrl && serverUrl !== defaultServerUrl(l)) url.searchParams.set('server', serverUrl);
    if (code) url.searchParams.set('room', code);
    return url.toString();
  }

  function roomFromUrl(loc) {
    const l = loc || (typeof location !== 'undefined' ? location : null);
    if (!l) return '';
    try {
      const room = new URL(l.href).searchParams.get('room') || '';
      return room.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
    } catch (e) {
      return '';
    }
  }

  function serverFromUrl(loc) {
    const l = loc || (typeof location !== 'undefined' ? location : null);
    if (!l) return '';
    try {
      return new URL(l.href).searchParams.get('server') || '';
    } catch (e) {
      return '';
    }
  }

  function cleanCode(code) {
    return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
  }

  /**
   * 浏览器 WebSocket 的薄封装。只负责连接、收发、超时和关闭，
   * 房间协议由 UI 层处理。
   */
  class Net {
    constructor(handlers) {
      this.handlers = handlers || {};
      this.ws = null;
      this.url = '';
    }

    get open() {
      return !!this.ws && this.ws.readyState === 1;
    }

    connect(url, timeoutMs) {
      this.close();
      this.url = url;
      return new Promise((resolve, reject) => {
        let settled = false;
        let ws;
        try {
          ws = new WebSocket(url);
        } catch (e) {
          reject(new Error('无法创建 WebSocket：' + e.message));
          return;
        }
        this.ws = ws;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          if (this.ws === ws) this.ws = null;
          try { ws.close(); } catch (e) { /* ignore */ }
          reject(new Error('连接超时，请检查服务器地址'));
        }, timeoutMs || 8000);

        ws.onopen = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (this.handlers.onOpen) this.handlers.onOpen();
          resolve();
        };
        ws.onmessage = (event) => {
          let message;
          try {
            message = JSON.parse(event.data);
          } catch (e) {
            return;
          }
          if (this.ws !== ws) return;
          if (this.handlers.onMessage) this.handlers.onMessage(message);
        };
        ws.onerror = () => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            if (this.ws === ws) this.ws = null;
            reject(new Error('无法连接服务器'));
          } else if (this.handlers.onError) {
            this.handlers.onError(new Error('连接异常'));
          }
        };
        ws.onclose = (event) => {
          if (this.ws !== ws) return;
          this.ws = null;
          if (this.handlers.onClose) this.handlers.onClose(event);
        };
      });
    }

    send(message) {
      if (!this.open) return false;
      try {
        this.ws.send(JSON.stringify(message));
        return true;
      } catch (e) {
        return false;
      }
    }

    close() {
      const ws = this.ws;
      this.ws = null;
      if (!ws) return;
      try { ws.close(); } catch (e) { /* ignore */ }
    }
  }

  global.GemNet = {
    ROOM_ALPHABET,
    sanitizeState,
    mirrorState,
    viewState,
    defaultServerUrl,
    normalizeServerUrl,
    shareUrl,
    roomFromUrl,
    serverFromUrl,
    cleanCode,
    Net,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
