/*
 * 宝石商人 · 卡牌与人物美术
 * ------------------------------------------------------------
 * 全部为内联 SVG，不依赖图片或网络。
 * 每张卡根据 等级 / 宝石色 / 费用模板 / 点数 / id 生成独特的场景。
 */
(function (global) {
  'use strict';

  const GOLD = '#d9b15f';
  const GOLD_LIGHT = '#f4e2a9';
  const GOLD_DIM = '#a77c32';

  const P = {
    white: {
      deep: '#060d12', mid: '#173039', glow: '#dff6f6', accent: '#b9e6ef',
      rock: '#0e1c20', rock2: '#15292d', light: '#f2fbfb', gold: '#e6c784',
      warm: '#f0d8a0', shadow: '#03080a', skin: '#d8b98f',
    },
    blue: {
      deep: '#050b18', mid: '#0f2a4d', glow: '#9fd0ff', accent: '#4d9cff',
      rock: '#0b1626', rock2: '#12243a', light: '#eaf4ff', gold: '#e4c27a',
      warm: '#f2dca6', shadow: '#02060d', skin: '#cfa477',
    },
    green: {
      deep: '#04120d', mid: '#0b3529', glow: '#8ff0c8', accent: '#26c08d',
      rock: '#0a1c16', rock2: '#123026', light: '#eafff7', gold: '#e2c27c',
      warm: '#f3dca4', shadow: '#020805', skin: '#c99a72',
    },
    red: {
      deep: '#150508', mid: '#47121b', glow: '#ffb0ae', accent: '#e04a5a',
      rock: '#1b0b0e', rock2: '#2c1318', light: '#fff0ee', gold: '#e6c27a',
      warm: '#f6d9a0', shadow: '#080203', skin: '#d9ae83',
    },
    black: {
      deep: '#0a0d16', mid: '#293147', glow: '#d5ddf2', accent: '#93a2cc',
      rock: '#121722', rock2: '#1d2534', light: '#eef2fb', gold: '#e9c87e',
      warm: '#f3dfae', shadow: '#03050a', skin: '#c4956d',
    },
    gold: {
      deep: '#160f05', mid: '#4a3412', glow: '#ffe7a3', accent: '#e2b256',
      rock: '#1d1508', rock2: '#31230c', light: '#fff8df', gold: '#f0c96e',
      warm: '#ffe9b8', shadow: '#080501', skin: '#d8b98f',
    },
    teal: {
      deep: '#041416', mid: '#0b3d42', glow: '#8ff2ee', accent: '#2cc7c0',
      rock: '#0a2022', rock2: '#113236', light: '#eafffd', gold: '#e2c27c',
      warm: '#f3dca4', shadow: '#020809', skin: '#c99a72',
    },
    purple: {
      deep: '#0d0716', mid: '#32194f', glow: '#e2c4ff', accent: '#a66cff',
      rock: '#160e25', rock2: '#24163a', light: '#f7efff', gold: '#e6c27a',
      warm: '#f6d9a0', shadow: '#05020a', skin: '#c4956d',
    },
    amber: {
      deep: '#1a1004', mid: '#4d2f0d', glow: '#ffe0a0', accent: '#e8a63e',
      rock: '#20160a', rock2: '#33230f', light: '#fff8e6', gold: '#f0c96e',
      warm: '#ffe9b8', shadow: '#080401', skin: '#d8b98f',
    },
    silver: {
      deep: '#0a0d12', mid: '#2a303c', glow: '#eef4ff', accent: '#b9c7dd',
      rock: '#121720', rock2: '#1e2632', light: '#ffffff', gold: '#e6c784',
      warm: '#f6e7c0', shadow: '#030508', skin: '#c4956d',
    },
  };

  let seq = 0;
  function uid() { seq += 1; return 'ma' + seq; }

  function hash(value) {
    let h = 2166136261;
    const s = String(value);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function rng(seed) { return mulberry32(hash(seed)); }
  function range(r, a, b) { return a + r() * (b - a); }
  function int(r, a, b) { return Math.floor(range(r, a, b + 1)); }
  function f(v) { return Math.round(v * 10) / 10; }

  function poly(points, fill, extra) {
    return '<polygon points="' + points.map((p) => f(p[0]) + ',' + f(p[1])).join(' ') + '" fill="' + fill + '"' + (extra || '') + '/>';
  }
  function path(d, fill, extra) {
    return '<path d="' + d + '" fill="' + fill + '"' + (extra || '') + '/>';
  }
  function circle(cx, cy, r, fill, extra) {
    return '<circle cx="' + f(cx) + '" cy="' + f(cy) + '" r="' + f(r) + '" fill="' + fill + '"' + (extra || '') + '/>';
  }
  function ellipse(cx, cy, rx, ry, fill, extra) {
    return '<ellipse cx="' + f(cx) + '" cy="' + f(cy) + '" rx="' + f(rx) + '" ry="' + f(ry) + '" fill="' + fill + '"' + (extra || '') + '/>';
  }
  function line(x1, y1, x2, y2, stroke, width, extra) {
    return '<line x1="' + f(x1) + '" y1="' + f(y1) + '" x2="' + f(x2) + '" y2="' + f(y2) +
      '" stroke="' + stroke + '" stroke-width="' + (width || 1) + '"' + (extra || '') + '/>';
  }
  function rect(x, y, w, h, fill, extra) {
    return '<rect x="' + f(x) + '" y="' + f(y) + '" width="' + f(w) + '" height="' + f(h) +
      '" fill="' + fill + '"' + (extra || '') + '/>';
  }

  // ------------------------------------------------------------
  // 宝石
  // ------------------------------------------------------------
  function gemDefs() {
    return '<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>' +
      ['white', 'blue', 'green', 'red', 'black', 'gold', 'teal', 'purple', 'amber', 'silver'].map((color) => {
        const m = {
          white: ['#fffdf4', '#e9e4d4', '#8e8874'],
          blue: ['#c4e2ff', '#3d82e8', '#123b82'],
          green: ['#a6f7d9', '#1da578', '#07563e'],
          red: ['#ffc3c6', '#d84a5c', '#731624'],
          black: ['#dbe2f2', '#59627c', '#161b26'],
          gold: ['#fff6cf', '#e2b256', '#7a4d0d'],
          teal: ['#d6fffc', '#1aa39e', '#064b49'],
          purple: ['#f4e3ff', '#8a4de0', '#3a1668'],
          amber: ['#fff0c9', '#e8a63e', '#7a4a0d'],
          silver: ['#ffffff', '#aebbd0', '#3f4a5c'],
        }[color];
        return '<radialGradient id="gemGrad-' + color + '" cx="32%" cy="24%" r="86%">' +
          '<stop offset="0" stop-color="' + m[0] + '"/>' +
          '<stop offset=".46" stop-color="' + m[1] + '"/>' +
          '<stop offset="1" stop-color="' + m[2] + '"/>' +
          '</radialGradient>';
      }).join('') + '</defs></svg>';
  }

  function gemSVG(color, cls) {
    return '<svg class="gem ' + (cls || '') + '" viewBox="0 0 100 100" aria-hidden="true" focusable="false">' +
      gemShape(color, 50, 50, 96, { glow: false }) + '</svg>';
  }

  function gemShape(color, cx, cy, size, options) {
    const opts = options || {};
    const s = size / 100;
    const outer = [];
    const inner = [];
    for (let i = 0; i < 8; i++) {
      const a1 = (-90 + i * 45) * Math.PI / 180;
      const a2 = (-90 + 22.5 + i * 45) * Math.PI / 180;
      outer.push([50 + 46 * Math.cos(a1), 50 + 46 * Math.sin(a1)]);
      inner.push([50 + 24 * Math.cos(a2), 50 + 24 * Math.sin(a2)]);
    }
    const pts = (arr) => arr.map((p) => f(p[0]) + ',' + f(p[1])).join(' ');
    let facets = '';
    for (let i = 0; i < 8; i++) {
      const tri = [outer[i], inner[(i + 7) % 8], inner[i]];
      facets += poly(tri, i % 2 ? 'rgba(255,255,255,.17)' : 'rgba(0,0,0,.15)');
    }
    const glow = opts.glow === false ? '' :
      '<circle cx="50" cy="50" r="54" fill="url(#gemGrad-' + color + ')" opacity=".16"/>';
    const rotate = opts.rotate ? ' rotate(' + f(opts.rotate) + ' 50 50)' : '';
    return '<g transform="translate(' + f(cx) + ' ' + f(cy) + ') scale(' + f(s) + ') translate(-50 -50)' + rotate + '">' +
      (opts.glow === false ? '' : '<circle cx="50" cy="50" r="58" fill="' + (P[color] || P.blue).accent + '" opacity=".1"/>') +
      '<polygon points="' + pts(outer) + '" fill="url(#gemGrad-' + color + ')"/>' +
      facets +
      '<polygon points="' + pts(inner) + '" fill="rgba(255,255,255,.17)" stroke="rgba(255,255,255,.4)" stroke-width="1.1"/>' +
      '<polygon points="' + pts(outer) + '" fill="none" stroke="rgba(255,255,255,.6)" stroke-width="1.25"/>' +
      '<polygon points="50,6 64,15 56,25 45,20" fill="rgba(255,255,255,.58)"/>' +
      '<circle cx="34" cy="31" r="2.6" fill="rgba(255,255,255,.8)"/>' +
      '</g>';
  }

  // ------------------------------------------------------------
  // 场景小工具
  // ------------------------------------------------------------
  function starField(r, count, color, x1, x2, y1, y2) {
    let s = '';
    for (let i = 0; i < count; i++) {
      s += circle(range(r, x1, x2), range(r, y1, y2), range(r, 0.35, 1.25), color,
        ' opacity="' + f(range(r, 0.12, 0.6)) + '"');
    }
    return s;
  }

  function dust(r, count, color) {
    let s = '';
    for (let i = 0; i < count; i++) {
      s += circle(range(r, 8, 152), range(r, 28, 170), range(r, 0.4, 1.3), color,
        ' opacity="' + f(range(r, 0.08, 0.35)) + '"');
    }
    return s;
  }

  function crystal(x, y, w, h, color, opacity) {
    return '<g opacity="' + (opacity == null ? 1 : opacity) + '">' +
      '<polygon points="' + f(x) + ',' + f(y) + ' ' + f(x + w / 2) + ',' + f(y - h) + ' ' + f(x + w) + ',' + f(y) + '" fill="' + color + '"/>' +
      '<polygon points="' + f(x + w / 2) + ',' + f(y - h) + ' ' + f(x + w * 0.72) + ',' + f(y) + ' ' + f(x + w) + ',' + f(y) + '" fill="rgba(255,255,255,.16)"/>' +
      '</g>';
  }

  function diamond(cx, cy, r, fill, extra) {
    return '<polygon points="' + f(cx) + ',' + f(cy - r) + ' ' + f(cx + r) + ',' + f(cy) + ' ' +
      f(cx) + ',' + f(cy + r) + ' ' + f(cx - r) + ',' + f(cy) + '" fill="' + fill + '"' + (extra || '') + '/>';
  }

  function laurel(cx, cy, rx, color, opacity) {
    let s = '<g stroke="' + color + '" stroke-width="1.2" fill="none" opacity="' + (opacity == null ? 0.55 : opacity) + '">';
    s += '<path d="M' + f(cx - rx) + ' ' + f(cy + 8) + ' Q' + f(cx - rx * 0.65) + ' ' + f(cy - 16) + ' ' + f(cx) + ' ' + f(cy - 20) + '"/>';
    s += '<path d="M' + f(cx + rx) + ' ' + f(cy + 8) + ' Q' + f(cx + rx * 0.65) + ' ' + f(cy - 16) + ' ' + f(cx) + ' ' + f(cy - 20) + '"/>';
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      const lx = cx - rx + t * rx * 0.82;
      const ly = cy + 8 - t * 22 - Math.sin(t * Math.PI) * 4;
      s += '<path d="M' + f(lx) + ' ' + f(ly) + ' q-5 -3 -7 2 q4 3 7 -2"/>';
      const rx2 = cx + rx - t * rx * 0.82;
      s += '<path d="M' + f(rx2) + ' ' + f(ly) + ' q5 -3 7 2 q-4 3 -7 -2"/>';
    }
    return s + '</g>';
  }

  function rays(cx, cy, count, r1, r2, color, opacity) {
    let s = '<g stroke="' + color + '" stroke-width=".7" opacity="' + (opacity == null ? 0.2 : opacity) + '">';
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      s += line(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, cx + Math.cos(a) * r2, cy + Math.sin(a) * r2, color, 0.7);
    }
    return s + '</g>';
  }

  function camel(x, y, s, color, flip) {
    const dir = flip ? -1 : 1;
    const g = 'translate(' + f(x) + ' ' + f(y) + ') scale(' + f(s * dir) + ' ' + f(s) + ')';
    return '<g transform="' + g + '" fill="' + color + '">' +
      '<path d="M-10 0 q2 -7 6 -8 q2 -6 7 -6 q6 0 7 6 q2 1 3 4 l4 0 l1 4 l-3 1 q-1 3 -4 3 q-2 0 -3 -2 l-9 0 q-1 3 -4 3 q-2 0 -3 -3 l-2 0 z"/>' +
      '<path d="M5 -8 q6 -5 10 -1 l-2 3 q-4 -2 -8 1z"/>' +
      '</g>';
  }

  function ship(x, y, s, color, sail) {
    const g = 'translate(' + f(x) + ' ' + f(y) + ') scale(' + f(s) + ')';
    return '<g transform="' + g + '">' +
      '<path d="M-26 8 q26 10 52 0 l-6 8 q-20 6 -40 0z" fill="' + color + '"/>' +
      '<path d="M0 8 L0 -30" stroke="' + color + '" stroke-width="1.4"/>' +
      '<path d="M1 -28 L20 -4 L1 -4 Z" fill="' + sail + '" opacity=".9"/>' +
      '<path d="M-1 -24 L-18 -6 L-1 -6 Z" fill="' + sail + '" opacity=".65"/>' +
      '<path d="M-26 8 L26 8" stroke="' + GOLD + '" stroke-opacity=".35" stroke-width=".8"/>' +
      '</g>';
  }

  // ------------------------------------------------------------
  // 卡牌场景
  // ------------------------------------------------------------
  function dominantColor(card) {
    let best = card.bonus;
    let value = -1;
    for (const c of ['white', 'blue', 'green', 'red', 'black']) {
      if ((card.cost[c] || 0) > value) { value = card.cost[c] || 0; best = c; }
    }
    return best;
  }

  function smallGems(card, r, positions, color) {
    const total = Object.keys(card.cost).reduce((sum, c) => sum + card.cost[c], 0);
    let n = 2 + (total % 3) + (card.points > 0 ? 1 : 0);
    n = Math.min(n, positions.length);
    let s = '';
    for (let i = 0; i < n; i++) {
      const pos = positions[i];
      s += gemShape(color, pos[0] + range(r, -2, 2), pos[1] + range(r, -1.5, 1.5), pos[2] + range(r, -1, 1), { glow: false, rotate: range(r, -20, 20) });
    }
    return s;
  }

  function pointMarks(card, r, color) {
    if (!card.points) return '';
    let s = '<g opacity=".85">';
    for (let i = 0; i < card.points; i++) {
      const t = card.points === 1 ? 0.5 : i / (card.points - 1);
      const a = -Math.PI * 0.82 + t * Math.PI * 0.64;
      const x = 80 + Math.cos(a) * 42;
      const y = 62 + Math.sin(a) * 18;
      s += diamond(x, y, 2.6, color, ' opacity=".9"');
    }
    return s + '</g>';
  }

  function cardScene(card) {
    const p = P[card.bonus] || P.blue;
    const pattern = card.pattern != null ? card.pattern : 0;
    const rand = rng(card.id + '|' + JSON.stringify(card.cost) + '|' + card.bonus);
    const id = uid();
    const defs = '<defs>' +
      '<linearGradient id="' + id + 'sky" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="' + p.deep + '"/>' +
        '<stop offset=".55" stop-color="' + p.mid + '"/>' +
        '<stop offset="1" stop-color="' + p.rock + '"/>' +
      '</linearGradient>' +
      '<radialGradient id="' + id + 'glow" cx="50%" cy="48%" r="52%">' +
        '<stop offset="0" stop-color="' + p.light + '" stop-opacity=".55"/>' +
        '<stop offset=".45" stop-color="' + p.accent + '" stop-opacity=".18"/>' +
        '<stop offset="1" stop-color="' + p.accent + '" stop-opacity="0"/>' +
      '</radialGradient>' +
      '<radialGradient id="' + id + 'vig" cx="50%" cy="48%" r="72%">' +
        '<stop offset=".52" stop-color="' + p.shadow + '" stop-opacity="0"/>' +
        '<stop offset="1" stop-color="' + p.shadow + '" stop-opacity=".62"/>' +
      '</radialGradient>' +
      '<linearGradient id="' + id + 'water" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="' + p.mid + '" stop-opacity=".85"/>' +
        '<stop offset="1" stop-color="' + p.deep + '"/>' +
      '</linearGradient>' +
      '<linearGradient id="' + id + 'wood" x1="0" y1="0" x2="1" y2="0">' +
        '<stop offset="0" stop-color="#2a1b12"/>' +
        '<stop offset=".5" stop-color="#4a3020"/>' +
        '<stop offset="1" stop-color="#24170f"/>' +
      '</linearGradient>' +
      '</defs>';

    let scene = '';
    if (card.level === 1) scene = sceneMine(p, card, pattern, rand, id);
    else if (card.level === 2) scene = sceneWorkshop(p, card, pattern, rand, id);
    else scene = sceneRoute(p, card, pattern, rand, id);

    return '<svg class="card-art" viewBox="0 0 160 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">' +
      defs + scene +
      '<rect width="160" height="200" fill="url(#' + id + 'vig)"/>' +
      '</svg>';
  }

  // ---------- 一级：矿脉 ----------
  function sceneMine(p, card, pattern, r, id) {
    const out = [];
    out.push('<rect width="160" height="200" fill="url(#' + id + 'sky)"/>');
    out.push(ellipse(80, 104, 70, 72, 'url(#' + id + 'glow)'));
    out.push(path('M0 58 L16 44 L30 52 L44 36 L60 48 L78 30 L96 46 L112 34 L130 50 L146 38 L160 54 L160 0 L0 0Z', p.rock2, ' opacity=".8"'));
    out.push(path('M0 32 L20 50 L12 74 L26 100 L10 126 L22 152 L0 174Z', p.rock));
    out.push(path('M160 28 L140 48 L148 74 L134 100 L150 126 L138 152 L160 174Z', p.rock));
    for (let i = 0; i < 7; i++) {
      const x = 8 + i * 24 + range(r, -4, 4);
      const w = range(r, 5, 11);
      const h = range(r, 12, 34);
      out.push('<path d="M' + f(x - w) + ' 58 L' + f(x) + ' ' + f(58 + h) + ' L' + f(x + w) + ' 58Z" fill="' + p.rock + '" opacity=".92"/>');
    }
    out.push(path('M0 166 L22 158 L40 164 L58 156 L78 162 L98 154 L118 164 L138 156 L160 164 L160 200 L0 200Z', p.rock));
    out.push('<path d="M0 166 L22 158 L40 164 L58 156 L78 162 L98 154 L118 164 L138 156 L160 164" fill="none" stroke="' + p.gold + '" stroke-opacity=".14" stroke-width="1"/>');
    out.push('<path d="M18 132 C18 68 42 40 80 40 C118 40 142 68 142 132" fill="none" stroke="' + p.gold + '" stroke-opacity=".18" stroke-width="1.1"/>');
    out.push(dust(r, 18, p.light));

    let back = '';
    let front = '';

    if (pattern === 0) {
      back += crystal(17, 150, 24, 46, p.accent, 0.75);
      back += crystal(122, 148, 21, 38, p.light, 0.62);
      back += crystal(35, 86, 16, 30, p.accent, 0.28);
      front += crystal(46, 164, 14, 26, p.accent, 0.8);
      front += crystal(104, 167, 12, 22, p.light, 0.55);
      front += '<g transform="translate(131 44)"><path d="M0 0 L0 14" stroke="' + GOLD + '" stroke-width="1"/><circle cx="0" cy="18" r="6" fill="' + p.warm + '" opacity=".55"/><circle cx="0" cy="18" r="3" fill="' + GOLD_LIGHT + '"/></g>';
    } else if (pattern === 1) {
      back += rect(22, 24, 8, 154, '#3a2718');
      back += rect(130, 24, 8, 154, '#3a2718');
      back += rect(18, 44, 124, 5, '#5a3c24');
      back += rect(18, 96, 124, 5, '#5a3c24');
      back += rect(18, 148, 124, 5, '#5a3c24');
      back += '<path d="M60 0 L76 0 L92 62 L78 62Z" fill="' + p.light + '" opacity=".13"/>';
      back += '<path d="M62 0 L70 0 L84 60 L78 60Z" fill="' + p.light + '" opacity=".12"/>';
      front += '<g stroke="' + GOLD + '" stroke-opacity=".35" stroke-width="1.2">' +
        '<path d="M38 58 L38 170"/><path d="M50 58 L50 170"/>' +
        '<path d="M38 76 L50 76"/><path d="M38 94 L50 94"/><path d="M38 112 L50 112"/><path d="M38 130 L50 130"/><path d="M38 148 L50 148"/>' +
        '</g>';
      front += '<g transform="translate(122 150)"><path d="M0 0 L0 -20" stroke="' + p.gold + '" stroke-width="1"/><path d="M-7 0 L7 0 L5 10 L-5 10Z" fill="#3a2718" stroke="' + GOLD + '" stroke-opacity=".4"/><circle cx="0" cy="4" r="2" fill="' + p.accent + '"/></g>';
    } else if (pattern === 2) {
      back += rect(0, 154, 160, 46, 'url(#' + id + 'water)');
      back += ellipse(80, 172, 42, 7, p.accent, ' opacity=".13"');
      front += '<g fill="none" stroke="' + p.light + '" stroke-opacity=".2" stroke-width=".9">' +
        '<path d="M44 168 q10 -3 20 0 t20 0 t20 0"/><path d="M34 180 q12 -4 24 0 t24 0 t24 0"/><path d="M50 190 q10 -3 20 0 t20 0"/>' +
        '</g>';
      front += '<path d="M20 154 L36 154 L32 164 L24 164Z" fill="#2a1b12" stroke="' + GOLD + '" stroke-opacity=".25"/>';
      front += '<g opacity=".2" transform="translate(0 58)">' + gemShape(card.bonus, 80, 108, 50, { glow: false }) + '</g>';
    } else if (pattern === 3) {
      const glow = p.accent;
      back += '<g fill="none" stroke="' + glow + '" stroke-width="1.5" opacity=".55">' +
        '<path d="M80 108 L42 78 L12 84"/><path d="M80 108 L112 76 L146 84"/><path d="M80 108 L56 142 L24 148"/><path d="M80 108 L104 144 L138 150"/>' +
        '<path d="M42 78 L30 58"/><path d="M112 76 L126 52"/><path d="M56 142 L44 164"/><path d="M104 144 L120 168"/>' +
        '</g>';
      back += '<g fill="' + glow + '" opacity=".7">' + circle(30, 58, 1.2, glow) + circle(126, 52, 1.4, glow) + circle(44, 164, 1, glow) + circle(120, 168, 1.2, glow) + '</g>';
      front += '<path d="M52 160 L108 160 L100 174 L60 174Z" fill="#24170f" stroke="' + p.gold + '" stroke-opacity=".3"/>';
    } else if (pattern === 4) {
      back += '<g stroke="' + p.gold + '" stroke-opacity=".28" fill="none">' +
        '<path d="M24 166 L24 76 Q24 58 40 58 L120 58 Q136 58 136 76 L136 166"/>' +
        '<path d="M32 166 L32 80 Q32 66 44 66 L116 66 Q128 66 128 80 L128 166"/>' +
        '</g>';
      back += '<g stroke="' + p.gold + '" stroke-opacity=".32" fill="none">' +
        '<path d="M46 66 l3 -6 l3 6"/><path d="M64 66 l3 -6 l3 6"/><path d="M82 66 l3 -6 l3 6"/><path d="M100 66 l3 -6 l3 6"/>' +
        '</g>';
      front += '<g transform="translate(38 158)"><path d="M-8 0 L8 0 L6 12 L-6 12Z" fill="#24170f" stroke="' + p.gold + '" stroke-opacity=".35"/><path d="M0 0 q-4 -12 0 -20 q4 8 0 20" fill="' + p.warm + '" opacity=".8"/></g>';
      front += '<g transform="translate(122 158)"><path d="M-8 0 L8 0 L6 12 L-6 12Z" fill="#24170f" stroke="' + p.gold + '" stroke-opacity=".35"/><path d="M0 0 q-4 -12 0 -20 q4 8 0 20" fill="' + p.warm + '" opacity=".8"/></g>';
    } else if (pattern === 5) {
      back += '<g stroke="#3a2718" stroke-width="3">' +
        '<path d="M42 200 L76 142"/><path d="M118 200 L84 142"/>' +
        '</g>';
      back += '<g stroke="' + p.gold + '" stroke-opacity=".18">' +
        '<path d="M42 194 L118 194"/><path d="M46 186 L114 186"/><path d="M52 176 L108 176"/><path d="M58 168 L102 168"/>' +
        '</g>';
      front += '<g transform="translate(34 154)">' +
        '<path d="M-16 0 L16 0 L14 16 L-14 16Z" fill="#24170f" stroke="' + p.gold + '" stroke-opacity=".3"/>' +
        '<circle cx="-10" cy="20" r="4" fill="none" stroke="' + p.gold + '" stroke-opacity=".4"/><circle cx="10" cy="20" r="4" fill="none" stroke="' + p.gold + '" stroke-opacity=".4"/>' +
        gemShape(card.bonus, -6, -2, 12, { glow: false }) + gemShape(card.bonus, 5, -1, 10, { glow: false }) +
        '</g>';
      front += '<g transform="translate(126 146) rotate(18)"><path d="M0 0 L26 0" stroke="' + p.gold + '" stroke-width="1.6"/><path d="M-4 -5 L8 -5 L8 5 L-4 5Z" fill="#3a2718"/></g>';
    } else if (pattern === 6) {
      back += '<path d="M14 162 Q8 100 36 70 Q56 48 80 48 Q104 48 124 70 Q152 100 146 162 Q120 174 80 174 Q40 174 14 162Z" fill="#1c1210" stroke="' + p.gold + '" stroke-opacity=".25"/>';
      back += '<path d="M24 156 Q20 104 42 80 Q60 64 80 64 Q100 64 118 80 Q140 104 136 156 Q112 164 80 164 Q48 164 24 156Z" fill="' + p.rock2 + '"/>';
      front += '<g>';
      for (let i = 0; i < 9; i++) {
        const a = -Math.PI * 0.9 + (i / 8) * Math.PI * 1.8;
        const x = 80 + Math.cos(a) * 46;
        const y = 122 + Math.sin(a) * 38;
        front += '<path d="M' + f(x) + ' ' + f(y) + ' L' + f(x + range(r, -6, 6)) + ' ' + f(y - range(r, 6, 14)) + ' L' + f(x + range(r, 3, 9)) + ' ' + f(y + 2) + 'Z" fill="' + p.accent + '" opacity=".5"/>';
      }
      front += '</g>';
      front += '<g transform="translate(120 160) rotate(-20)"><path d="M0 0 L26 0" stroke="' + p.gold + '" stroke-width="1.3"/><path d="M-3 -4 L8 -4 L8 4 L-3 4Z" fill="#3a2718"/></g>';
    } else {
      back += '<path d="M-6 108 Q40 54 80 58 Q120 54 166 108" fill="none" stroke="' + p.rock2 + '" stroke-width="15"/>';
      back += '<path d="M-6 108 Q40 62 80 66 Q120 62 166 108" fill="none" stroke="' + p.gold + '" stroke-opacity=".12" stroke-width="1"/>';
      for (let i = 0; i < 7; i++) {
        const x = 20 + i * 20;
        const y = 90 - Math.sin((i / 6) * Math.PI) * 10;
        const h = range(r, 8, 22);
        back += '<path d="M' + f(x) + ' ' + f(y) + ' L' + f(x + 2) + ' ' + f(y + h) + ' L' + f(x + 4) + ' ' + f(y) + 'Z" fill="' + p.accent + '" opacity=".35"/>';
      }
      front += '<g fill="none" stroke="' + p.gold + '" stroke-opacity=".25">' +
        '<path d="M2 166 Q80 156 158 166"/><path d="M6 172 Q80 164 154 172"/>' +
        '<path d="M18 166 L18 158"/><path d="M46 164 L46 156"/><path d="M80 162 L80 154"/><path d="M114 164 L114 156"/><path d="M142 166 L142 158"/>' +
        '</g>';
    }

    out.push(back);
    out.push('<path d="M62 150 L70 128 L90 128 L98 150Z" fill="#1c1210" stroke="' + p.gold + '" stroke-opacity=".22"/>');
    out.push(ellipse(80, 151, 26, 5, p.shadow, ' opacity=".5"'));
    out.push(gemShape(card.bonus, 80, 104, 54));
    out.push(pointMarks(card, r, GOLD_LIGHT));
    out.push(front);
    return out.join('');
  }

  // ---------- 二级：工坊 ----------
  function sceneWorkshop(p, card, pattern, r, id) {
    const out = [];
    const win = id + 'win';
    out.push('<rect width="160" height="200" fill="' + p.rock + '"/>');
    out.push('<rect x="0" y="0" width="160" height="200" fill="url(#' + id + 'sky)" opacity=".35"/>');
    for (let i = 0; i < 6; i++) {
      out.push(line(10 + i * 28, 0, 10 + i * 28, 148, p.gold, 0.8, ' stroke-opacity=".05"'));
    }
    out.push('<path d="M0 16 L160 16" stroke="' + p.gold + '" stroke-opacity=".18"/>');
    out.push('<path d="M0 22 L160 22" stroke="' + p.gold + '" stroke-opacity=".08"/>');
    out.push('<clipPath id="' + win + '"><path d="M44 132 L44 70 Q44 30 80 30 Q116 30 116 70 L116 132Z"/></clipPath>');
    out.push('<path d="M44 132 L44 70 Q44 30 80 30 Q116 30 116 70 L116 132Z" fill="url(#' + id + 'sky)"/>');
    out.push('<g clip-path="url(#' + win + ')">');
    out.push(starField(r, 16, p.light, 48, 112, 36, 100));
    out.push(circle(98, 52, 9, p.light, ' opacity=".55"'));
    out.push(circle(95, 49, 8, p.mid, ' opacity=".85"'));
    out.push('<path d="M44 116 Q64 108 80 112 Q96 116 116 110 L116 132 L44 132Z" fill="' + p.deep + '" opacity=".55"/>');
    out.push('</g>');
    out.push('<g stroke="' + p.gold + '" stroke-opacity=".5" fill="none">' +
      '<path d="M44 132 L44 70 Q44 30 80 30 Q116 30 116 70 L116 132"/>' +
      '<path d="M80 30 L80 132"/><path d="M44 74 L116 74"/><path d="M44 104 L116 104"/>' +
      '</g>');
    out.push('<path d="M0 148 L160 148 L160 200 L0 200Z" fill="#24170f"/>');
    out.push('<path d="M0 148 L160 148" stroke="' + p.gold + '" stroke-opacity=".35" stroke-width="1.3"/>');
    out.push('<path d="M0 154 L160 154" stroke="' + p.gold + '" stroke-opacity=".1"/>');
    for (let i = 0; i < 5; i++) {
      out.push(line(i * 38 + 8, 160, i * 38 + 24, 198, '#170f09', 0.8, ' stroke-opacity=".6"'));
    }
    out.push(dust(r, 10, p.warm));
    out.push('<g transform="translate(132 16)"><path d="M0 0 L0 18" stroke="' + p.gold + '" stroke-opacity=".45"/><path d="M-8 18 L8 18 L5 30 L-5 30Z" fill="' + p.gold + '" opacity=".45"/><circle cx="0" cy="25" r="8" fill="' + p.warm + '" opacity=".16"/></g>');

    let back = '';
    let front = '';
    if (pattern === 0) {
      back += circle(80, 96, 38, 'none', ' stroke="' + p.gold + '" stroke-opacity=".38" stroke-width="1.4"');
      back += circle(80, 96, 31, 'none', ' stroke="' + p.gold + '" stroke-opacity=".2"');
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        back += line(80 + Math.cos(a) * 8, 96 + Math.sin(a) * 8, 80 + Math.cos(a) * 31, 96 + Math.sin(a) * 31, p.gold, 0.7, ' stroke-opacity=".25"');
      }
      back += circle(80, 96, 8, '#3a2718', ' stroke="' + p.gold + '" stroke-opacity=".5"');
      front += '<g fill="' + p.gold + '">' + circle(108, 76, 1.3, GOLD_LIGHT) + circle(116, 84, 1, GOLD) + circle(54, 70, 1.2, GOLD_LIGHT) + circle(46, 82, .9, GOLD) + '</g>';
      front += '<path d="M96 146 L118 132" stroke="' + p.gold + '" stroke-width="2" stroke-opacity=".5"/><path d="M114 128 L122 134 L120 140 L110 136Z" fill="#4a3020" stroke="' + p.gold + '" stroke-opacity=".3"/>';
    } else if (pattern === 1) {
      back += circle(102, 92, 23, 'none', ' stroke="' + p.gold + '" stroke-opacity=".55" stroke-width="2"');
      back += circle(102, 92, 19, p.light, ' opacity=".06"');
      back += '<path d="M116 110 L132 128" stroke="' + p.gold + '" stroke-width="3" stroke-opacity=".5"/>';
      front += '<path d="M22 152 L22 136 L52 136 L52 152" fill="none" stroke="' + p.gold + '" stroke-opacity=".35"/>';
      front += '<path d="M26 148 L26 138 M30 146 L30 136 M34 148 L34 138" stroke="' + p.gold + '" stroke-opacity=".25"/>';
      front += '<circle cx="40" cy="160" r="3" fill="' + p.gold + '" opacity=".6"/><circle cx="48" cy="158" r="2" fill="' + p.light + '" opacity=".4"/>';
    } else if (pattern === 2) {
      back += circle(80, 94, 38, '#1b120c', ' stroke="' + p.gold + '" stroke-opacity=".45" stroke-width="1.6"');
      back += circle(80, 94, 31, 'none', ' stroke="' + p.gold + '" stroke-opacity=".3"');
      back += circle(80, 94, 24, 'none', ' stroke="' + p.gold + '" stroke-opacity=".18"');
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        back += circle(80 + Math.cos(a) * 34, 94 + Math.sin(a) * 34, 1.6, p.gold, ' opacity=".55"');
      }
      front += '<path d="M50 148 Q80 138 110 148 L110 160 Q80 150 50 160Z" fill="' + p.accent + '" opacity=".13"/>';
      front += '<path d="M54 148 Q80 141 106 148" stroke="' + p.gold + '" stroke-opacity=".35" fill="none"/>';
    } else if (pattern === 3) {
      back += '<g transform="translate(34 124)">' +
        '<path d="M-16 0 L16 0 L12 34 L-12 34Z" fill="#24170f" stroke="' + p.gold + '" stroke-opacity=".35"/>' +
        '<path d="M-10 4 Q0 18 10 4" fill="none" stroke="' + p.warm + '" stroke-opacity=".5"/>' +
        '<circle cx="0" cy="6" r="8" fill="' + p.warm + '" opacity=".16"/>' +
        '</g>';
      back += '<path d="M18 30 L18 100 L30 100 L30 30" fill="#2a1b12" opacity=".8"/>';
      front += '<g stroke="' + p.gold + '" stroke-opacity=".4" fill="none"><path d="M64 146 L84 146"/><path d="M74 146 L74 136"/><path d="M66 136 L82 136"/></g>';
      front += '<g fill="' + p.warm + '">' + circle(26, 106, 1.2, p.warm) + circle(34, 94, .9, p.warm) + circle(24, 82, .8, p.warm) + '</g>';
    } else if (pattern === 4) {
      back += '<g transform="translate(24 142) rotate(-6)">' +
        '<path d="M0 0 L52 0 L52 26 L0 26Z" fill="#d9c9a6" opacity=".16" stroke="' + p.gold + '" stroke-opacity=".25"/>' +
        '<path d="M6 7 L42 7 M6 12 L38 12 M6 17 L30 17" stroke="' + p.gold + '" stroke-opacity=".3"/>' +
        '</g>';
      back += '<g transform="translate(120 144)"><circle cx="0" cy="0" r="10" fill="none" stroke="' + p.gold + '" stroke-opacity=".4"/><circle cx="0" cy="0" r="2" fill="' + p.gold + '"/><path d="M0 -10 L4 -2 L10 0 L4 2 L0 10 L-4 2 L-10 0 L-4 -2Z" fill="' + p.gold + '" opacity=".35"/></g>';
      front += '<path d="M94 150 L104 140 L110 146 L100 156Z" fill="#24170f" stroke="' + p.gold + '" stroke-opacity=".3"/>';
      front += '<circle cx="58" cy="156" r="2" fill="' + p.gold + '" opacity=".5"/>';
    } else {
      back += '<g stroke="' + p.gold + '" stroke-opacity=".3" fill="none">' +
        '<path d="M22 140 L22 54 L138 54 L138 140"/><path d="M30 62 L130 62"/><path d="M30 96 L130 96"/><path d="M30 130 L130 130"/>' +
        '</g>';
      back += '<g>' +
        gemShape(card.bonus, 38, 78, 15, { glow: false }) + gemShape(card.bonus, 64, 84, 12, { glow: false }) +
        gemShape(card.bonus, 118, 78, 14, { glow: false }) + gemShape(card.bonus, 102, 116, 13, { glow: false }) +
        '</g>';
      front += '<path d="M32 150 L128 150" stroke="' + p.gold + '" stroke-opacity=".25"/>';
    }

    out.push(back);
    out.push('<path d="M56 150 Q80 142 104 150 L104 158 Q80 150 56 158Z" fill="' + p.accent + '" opacity=".13"/>');
    out.push('<g stroke="' + p.gold + '" stroke-opacity=".35" fill="none"><path d="M62 156 L70 138 L90 138 L98 156"/><path d="M70 138 L76 130 L84 130 L90 138"/></g>');
    out.push(ellipse(80, 153, 28, 5, p.shadow, ' opacity=".45"'));
    out.push(gemShape(card.bonus, 80, 104, 58));
    out.push(pointMarks(card, r, GOLD_LIGHT));
    out.push(front);
    return out.join('');
  }

  // ---------- 三级：商路 ----------
  function sceneRoute(p, card, pattern, r, id) {
    const out = [];
    out.push('<rect width="160" height="200" fill="url(#' + id + 'sky)"/>');
    out.push(rays(80, 74, 22, 18, 58, p.gold, 0.16));
    out.push(circle(80, 72, 30, p.warm, ' opacity=".13"'));
    out.push(circle(80, 72, 18, p.warm, ' opacity=".72"'));
    out.push(circle(80, 72, 13, p.light, ' opacity=".55"'));
    out.push(starField(r, 18, p.light, 10, 150, 14, 100));
    out.push('<g fill="' + p.light + '" opacity=".08">' +
      ellipse(34, 48, 22, 6, p.light) + ellipse(126, 38, 18, 5, p.light) + ellipse(112, 58, 26, 7, p.light) +
      '</g>');
    out.push(laurel(80, 128, 52, p.gold, 0.34));

    let back = '';
    let front = '';

    if (pattern === 0) {
      back += '<path d="M0 142 Q36 114 72 136 Q108 158 160 126 L160 200 L0 200Z" fill="' + p.mid + '"/>';
      back += '<path d="M0 156 Q40 132 80 150 Q120 168 160 144 L160 200 L0 200Z" fill="' + p.rock2 + '"/>';
      back += '<path d="M0 172 Q46 152 86 168 Q126 182 160 164 L160 200 L0 200Z" fill="' + p.rock + '"/>';
      back += camel(38, 143, 0.8, p.deep, false);
      back += camel(58, 146, 0.7, p.deep, false);
      back += camel(114, 142, 0.65, p.deep, true);
      back += '<g fill="' + p.deep + '"><path d="M92 150 L104 122 L116 150Z"/><path d="M100 150 L100 134" stroke="' + p.deep + '"/></g>';
      back += '<g stroke="' + p.gold + '" stroke-opacity=".35"><path d="M94 123 L94 108"/><path d="M88 108 L100 108 L97 116 L91 116Z" fill="' + p.gold + '" fill-opacity=".25"/></g>';
      front += '<path d="M0 168 L160 168 L160 200 L0 200Z" fill="#120c06"/>';
      front += '<g stroke="' + p.gold + '" stroke-opacity=".28"><path d="M0 168 L160 168"/><path d="M14 168 L14 154"/><path d="M40 168 L40 156"/><path d="M120 168 L120 156"/><path d="M146 168 L146 154"/></g>';
      front += '<g fill="' + p.gold + '" opacity=".45"><path d="M8 148 L18 148 L14 138Z"/><path d="M142 148 L152 148 L148 138Z"/></g>';
    } else if (pattern === 1) {
      back += '<path d="M0 132 Q40 124 80 132 Q120 140 160 130 L160 200 L0 200Z" fill="' + p.mid + '" opacity=".8"/>';
      back += ship(38, 128, 0.9, p.deep, p.light);
      back += '<g fill="' + p.deep + '"><path d="M124 150 L128 112 L136 112 L140 150Z"/><path d="M126 112 L138 112 L132 100Z"/></g>';
      back += circle(132, 108, 3, p.warm, ' opacity=".8"');
      back += '<g stroke="' + p.light + '" stroke-opacity=".18" fill="none">' +
        '<path d="M0 148 Q20 142 40 148 T80 148 T120 148 T160 148"/>' +
        '<path d="M0 158 Q20 152 40 158 T80 158 T120 158 T160 158"/>' +
        '<path d="M0 168 Q20 162 40 168 T80 168 T120 168 T160 168"/>' +
        '</g>';
      front += '<g transform="translate(118 160)"><path d="M-10 0 L10 0 L8 12 L-8 12Z" fill="#24170f" stroke="' + p.gold + '" stroke-opacity=".3"/><path d="M-10 3 L10 3" stroke="' + p.gold + '" stroke-opacity=".25"/></g>';
      front += '<g stroke="' + p.gold + '" stroke-opacity=".3"><path d="M0 174 L160 174"/><path d="M22 174 L22 160"/><path d="M138 174 L138 160"/></g>';
    } else if (pattern === 2) {
      back += '<g fill="' + p.deep + '">' +
        '<path d="M0 160 L0 68 L12 68 L12 160Z"/><path d="M148 160 L148 68 L160 68 L160 160Z"/>' +
        '<path d="M12 68 L22 60 L22 80 L12 88Z"/><path d="M148 68 L138 60 L138 80 L148 88Z"/>' +
        '</g>';
      back += '<g stroke="' + p.gold + '" stroke-opacity=".3" fill="none"><path d="M12 72 L12 160"/><path d="M148 72 L148 160"/><path d="M20 88 L20 160"/><path d="M140 88 L140 160"/></g>';
      back += '<path d="M28 126 L132 126 L124 150 L36 150Z" fill="#1b120c" stroke="' + p.gold + '" stroke-opacity=".3"/>';
      back += '<g fill="' + p.gold + '" opacity=".4"><path d="M40 74 L50 74 L45 62Z"/><path d="M110 74 L120 74 L115 62Z"/></g>';
      front += '<g stroke="' + p.gold + '" stroke-opacity=".3"><path d="M0 176 L160 176"/><path d="M18 176 L18 164"/><path d="M142 176 L142 164"/></g>';
      front += '<path d="M50 156 Q80 146 110 156 L110 162 Q80 152 50 162Z" fill="' + p.accent + '" opacity=".12"/>';
    } else {
      back += '<path d="M0 146 Q44 126 80 142 Q116 158 160 136 L160 200 L0 200Z" fill="' + p.mid + '"/>';
      back += '<g fill="' + p.deep + '"><path d="M8 154 L40 88 L72 154Z"/><path d="M96 154 L126 96 L156 154Z"/></g>';
      back += '<g fill="' + p.rock2 + '"><path d="M0 156 L26 104 L52 156Z"/><path d="M112 156 L138 110 L160 156Z"/></g>';
      back += '<g stroke="' + p.gold + '" stroke-opacity=".3">' +
        '<path d="M4 116 L36 116"/><path d="M4 116 L4 108"/><path d="M36 116 L36 108"/>' +
        '<path d="M124 122 L156 122"/><path d="M124 122 L124 114"/><path d="M156 122 L156 114"/>' +
        '</g>';
      back += '<g fill="' + p.gold + '" opacity=".55">' + circle(20, 132, 1.2, p.gold) + circle(46, 120, 1, p.gold) + circle(130, 136, 1.1, p.gold) + circle(148, 126, .9, p.gold) + '</g>';
      front += '<g transform="translate(22 156)"><path d="M-10 0 L10 0 L8 12 L-8 12Z" fill="#24170f" stroke="' + p.gold + '" stroke-opacity=".3"/><path d="M-10 3 L10 3" stroke="' + p.gold + '" stroke-opacity=".25"/></g>';
      front += '<g transform="translate(138 156)"><path d="M-10 0 L10 0 L8 12 L-8 12Z" fill="#24170f" stroke="' + p.gold + '" stroke-opacity=".3"/><path d="M-10 3 L10 3" stroke="' + p.gold + '" stroke-opacity=".25"/></g>';
      front += '<path d="M0 176 L160 176" stroke="' + p.gold + '" stroke-opacity=".3"/>';
    }

    out.push(back);
    out.push('<path d="M54 164 L106 164 L100 178 L60 178Z" fill="' + p.rock2 + '" stroke="' + p.gold + '" stroke-opacity=".28"/>');
    out.push('<path d="M54 164 L106 164" stroke="' + p.gold + '" stroke-opacity=".5"/>');
    out.push('<path d="M50 158 L110 158 L106 164 L54 164Z" fill="' + p.rock + '" stroke="' + p.gold + '" stroke-opacity=".22"/>');
    out.push('<path d="M76 146 L80 138 L84 146 L82 158 L78 158Z" fill="' + p.gold + '" opacity=".28"/>');
    out.push(ellipse(80, 164, 34, 6, p.shadow, ' opacity=".5"'));
    out.push(gemShape(card.bonus, 80, 112, 66));
    out.push(pointMarks(card, r, GOLD_LIGHT));
    out.push(front);
    out.push('<g fill="' + GOLD_LIGHT + '" opacity=".55">' + circle(24, 42, 1.2, GOLD_LIGHT) + circle(134, 52, 1, GOLD_LIGHT) + circle(118, 24, .8, GOLD_LIGHT) + '</g>');
    return out.join('');
  }

  // ------------------------------------------------------------
  // 贵族肖像（侧面浮雕）
  // ------------------------------------------------------------
  function noblePortrait(noble) {
    const NOBLE_COLORS = ['green', 'blue', 'red', 'black', 'white', 'gold', 'teal', 'purple', 'amber', 'silver'];
    const match = /^n(\d)-(\d)$/.exec(noble.id || '');
    const idx = match ? Number(match[1]) * 5 + Number(match[2]) : hash(noble.id || noble.name) % 10;
    const accent = NOBLE_COLORS[idx] || 'blue';
    const p = P[accent];
    const id = uid();
    const rr = rng(noble.id + '|crest');
    const shield = 'M32 8 C44 8 54 16 54 28 L54 47 C54 60 44 69 32 75 C20 69 10 60 10 47 L10 28 C10 16 20 8 32 8Z';
    let s = '<svg class="noble-art" viewBox="0 0 64 80" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">';
    s += '<defs>' +
      '<radialGradient id="' + id + 'bg" cx="50%" cy="38%" r="66%">' +
        '<stop offset="0" stop-color="' + p.accent + '" stop-opacity=".24"/>' +
        '<stop offset=".58" stop-color="' + p.mid + '" stop-opacity=".12"/>' +
        '<stop offset="1" stop-color="' + p.deep + '" stop-opacity="0"/>' +
      '</radialGradient>' +
      '<linearGradient id="' + id + 'sh" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="' + p.rock2 + '"/>' +
        '<stop offset="1" stop-color="' + p.deep + '"/>' +
      '</linearGradient>' +
      '</defs>';
    s += '<rect width="64" height="80" rx="7" fill="' + p.deep + '"/>';
    s += '<rect width="64" height="80" rx="7" fill="url(#' + id + 'bg)"/>';
    for (let i = 0; i < 4; i++) {
      s += line(8 + i * 16, 4, 8 + i * 16, 76, p.gold, 0.3, ' stroke-opacity=".035"');
      s += line(4, 10 + i * 16, 60, 10 + i * 16, p.gold, 0.3, ' stroke-opacity=".035"');
    }
    s += '<path d="M6 74 L6 30 Q6 6 32 6 Q58 6 58 30 L58 74" fill="none" stroke="' + p.gold + '" stroke-opacity=".2"/>';
    s += laurel(32, 50, 23, p.gold, 0.26);
    s += '<clipPath id="' + id + 'c"><path d="' + shield + '"/></clipPath>';
    s += '<path d="' + shield + '" fill="url(#' + id + 'sh)" stroke="' + p.gold + '" stroke-opacity=".58" stroke-width="1.1"/>';
    let field = '';
    if (idx === 0) {
      field += '<g fill="none" stroke="' + p.gold + '" stroke-opacity=".16" stroke-width="1.2">' +
        '<path d="M10 40 L32 18 L54 40"/><path d="M10 50 L32 28 L54 50"/></g>';
    } else if (idx === 1) {
      for (let yy = 14; yy < 76; yy += 10) {
        const offset = (Math.floor(yy / 10) % 2) * 5;
        for (let xx = 10 + offset; xx < 56; xx += 10) {
          field += diamond(xx, yy, 3, 'none', ' stroke="' + p.gold + '" stroke-opacity=".13"');
        }
      }
    } else if (idx === 2) {
      for (let i = 0; i < 6; i++) {
        field += line(12 + i * 8, 8, 12 + i * 8, 76, p.gold, 0.8, ' stroke-opacity=".09"');
      }
    } else if (idx === 3) {
      field += '<g stroke="' + p.gold + '" stroke-opacity=".15">' +
        '<path d="M32 8 L32 76"/><path d="M10 36 L54 36"/><path d="M10 48 L54 48"/></g>';
      field += '<path d="M32 12 L36 36 L32 60 L28 36Z" fill="' + p.accent + '" opacity=".07"/>';
    } else if (idx === 4) {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        field += line(32, 44, 32 + Math.cos(a) * 36, 44 + Math.sin(a) * 36, p.gold, 0.7, ' stroke-opacity=".08"');
      }
    } else if (idx === 5) {
      for (let i = 0; i < 12; i++) {
        field += diamond(12 + rr() * 40, 12 + rr() * 58, 1.2 + rr() * 1.3, p.gold, ' opacity=".2"');
      }
    } else if (idx === 6) {
      field += '<g fill="none" stroke="' + p.gold + '" stroke-opacity=".1">';
      for (let i = 0; i < 4; i++) {
        const y = 24 + i * 12;
        field += '<path d="M10 ' + y + ' Q20 ' + (y - 5) + ' 30 ' + y + ' T50 ' + y + ' T54 ' + y + '"/>';
      }
      field += '</g>';
    } else if (idx === 7) {
      field += '<path d="M32 10 L32 74" stroke="' + p.gold + '" stroke-opacity=".12"/>';
      for (let i = 0; i < 5; i++) {
        const y = 22 + i * 10;
        field += '<path d="M32 ' + y + ' q-7 3 0 7 q7 -3 0 -7" fill="none" stroke="' + p.gold + '" stroke-opacity=".12"/>';
      }
    } else if (idx === 8) {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        field += line(32, 44, 32 + Math.cos(a) * 34, 44 + Math.sin(a) * 34, p.gold, 0.7, ' stroke-opacity=".06"');
      }
      field += circle(32, 44, 24, p.accent, ' opacity=".05"');
    } else {
      field += '<g fill="none" stroke="' + p.gold + '" stroke-opacity=".15">' +
        '<path d="M10 42 L32 20 L54 42"/><path d="M10 52 L32 30 L54 52"/></g>';
      field += '<path d="M32 18 L34 24 L40 26 L34 28 L32 34 L30 28 L24 26 L30 24Z" fill="' + p.accent + '" opacity=".13"/>';
    }
    s += '<g clip-path="url(#' + id + 'c)">' + field + '</g>';
    s += '<path d="' + shield + '" fill="none" stroke="' + p.gold + '" stroke-opacity=".28" transform="translate(32 41) scale(.92) translate(-32 -41)"/>';
    s += diamond(32, 43, 19, p.accent, ' opacity=".08"');
    s += diamond(32, 43, 16, p.gold, ' opacity=".14"');
    s += gemShape(accent, 32, 43, 27);
    s += '<g fill="' + p.gold + '" opacity=".8">' +
      diamond(17, 30, 1.2, p.gold) + diamond(47, 30, 1.2, p.gold) +
      diamond(17, 56, 1.2, p.gold) + diamond(47, 56, 1.2, p.gold) + '</g>';

    if (idx === 0) {
      s += '<g fill="' + p.gold + '"><path d="M20 13 L23 3 L28 9 L32 1 L36 9 L41 3 L44 13Z"/>' +
        '<path d="M20 13 L44 13 L42 16 L22 16Z"/></g>';
      s += '<circle cx="32" cy="9" r="1.7" fill="' + p.accent + '"/>';
    } else if (idx === 1) {
      s += '<path d="M19 13 L21 4 L25 9 L28 2 L32 8 L36 2 L39 9 L43 4 L45 13Z" fill="' + p.gold + '"/>';
      s += '<circle cx="32" cy="11" r="1.5" fill="' + p.accent + '"/>';
    } else if (idx === 2) {
      s += '<path d="M20 12 Q32 4 44 12" fill="none" stroke="' + p.gold + '" stroke-width="1.5"/>';
      s += '<circle cx="24" cy="10" r="1.2" fill="' + p.light + '"/><circle cx="32" cy="6" r="1.4" fill="' + p.light + '"/>' +
        '<circle cx="40" cy="10" r="1.2" fill="' + p.light + '"/>';
    } else if (idx === 3) {
      s += '<path d="M25 14 L28 2 L32 6 L36 2 L39 14Z" fill="' + p.rock2 + '" stroke="' + p.gold + '" stroke-opacity=".55"/>';
      s += '<path d="M32 4 L32 13" stroke="' + p.gold + '" stroke-opacity=".55"/>';
      s += '<circle cx="32" cy="9" r="1.5" fill="' + p.accent + '"/>';
    } else if (idx === 4) {
      s += '<g fill="none" stroke="' + p.gold + '" stroke-opacity=".65">' +
        '<path d="M18 14 Q22 2 32 2 Q42 2 46 14"/></g>';
      for (let i = 0; i < 4; i++) {
        const t = i / 3;
        const lx = 18 + t * 12;
        const ly = 14 - Math.sin(t * Math.PI) * 10;
        s += '<ellipse cx="' + f(lx) + '" cy="' + f(ly) + '" rx="2" ry="1" fill="' + p.gold + '" opacity=".6" transform="rotate(-30 ' + f(lx) + ' ' + f(ly) + ')"/>';
        const rx2 = 46 - t * 12;
        s += '<ellipse cx="' + f(rx2) + '" cy="' + f(ly) + '" rx="2" ry="1" fill="' + p.gold + '" opacity=".6" transform="rotate(30 ' + f(rx2) + ' ' + f(ly) + ')"/>';
      }
    } else if (idx === 5) {
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 - 0.7 + (i / 4) * 1.4;
        s += line(32, 14, 32 + Math.cos(a) * 18, 14 + Math.sin(a) * 18, p.gold, 1, ' stroke-opacity=".7"');
      }
      s += '<circle cx="32" cy="14" r="2" fill="' + p.accent + '"/>';
    } else if (idx === 6) {
      s += '<path d="M20 13 Q32 2 44 13" fill="none" stroke="' + p.gold + '" stroke-width="1.2"/>';
      s += '<path d="M26 12 L32 3 L38 12" fill="none" stroke="' + p.gold + '" stroke-opacity=".6"/>';
      s += '<circle cx="32" cy="8" r="1.5" fill="' + p.accent + '"/>';
    } else if (idx === 7) {
      s += '<path d="M32 14 Q38 2 47 2 Q42 10 35 15Z" fill="' + p.accent + '" opacity=".6"/>';
      s += '<path d="M32 14 L32 7" stroke="' + p.gold + '" stroke-opacity=".6"/>';
      s += '<circle cx="32" cy="14" r="1.4" fill="' + p.gold + '"/>';
    } else if (idx === 8) {
      s += '<path d="M32 1 L34 7 L40 9 L34 11 L32 17 L30 11 L24 9 L30 7Z" fill="' + p.gold + '"/>';
      s += '<circle cx="32" cy="9" r="1.4" fill="' + p.accent + '"/>';
    } else {
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI + (i / 6) * Math.PI;
        s += line(32, 14, 32 + Math.cos(a) * 16, 14 + Math.sin(a) * 16, p.gold, 0.9, ' stroke-opacity=".7"');
      }
      s += '<circle cx="32" cy="13" r="2" fill="' + p.gold + '"/>';
      s += '<circle cx="32" cy="13" r="1" fill="' + p.accent + '"/>';
    }

    s += '<path d="M22 64 Q32 70 42 64" fill="none" stroke="' + p.gold + '" stroke-opacity=".35"/>';
    s += '<g fill="' + p.gold + '" opacity=".8">' + diamond(24, 68, 1.5, p.gold) + diamond(32, 70, 1.7, p.gold) + diamond(40, 68, 1.5, p.gold) + '</g>';
    s += '<path d="M4 78 Q8 66 18 62" fill="none" stroke="' + p.gold + '" stroke-opacity=".2"/>';
    s += '<path d="M60 78 Q56 66 46 62" fill="none" stroke="' + p.gold + '" stroke-opacity=".2"/>';
    s += '</svg>';
    return s;
  }

  // ------------------------------------------------------------
  // 商人头像
  // ------------------------------------------------------------
  function merchantPortrait(kind) {
    const index = ((Number(kind) || 0) % 4 + 4) % 4;
    const palettes = [P.green, P.red, P.blue, P.amber];
    const gems = ['white', 'red', 'blue', 'gold'];
    const p = palettes[index];
    const gemColor = gems[index];
    const flat = index % 2 === 0;
    const id = uid();
    let s = '<svg class="merchant-art" viewBox="0 0 64 64" aria-hidden="true" focusable="false">';
    s += '<defs><radialGradient id="' + id + 'g" cx="50%" cy="38%" r="62%">' +
      '<stop offset="0" stop-color="' + p.accent + '" stop-opacity=".28"/>' +
      '<stop offset="1" stop-color="' + p.deep + '" stop-opacity="0"/></radialGradient></defs>';
    s += '<circle cx="32" cy="32" r="31" fill="' + p.deep + '"/>';
    s += '<circle cx="32" cy="32" r="31" fill="url(#' + id + 'g)"/>';
    for (let i = 0; i < 3; i++) {
      s += line(14 + i * 18, 8, 14 + i * 18, 56, p.gold, 0.3, ' stroke-opacity=".04"');
      s += line(8, 14 + i * 18, 56, 14 + i * 18, p.gold, 0.3, ' stroke-opacity=".04"');
    }
    s += laurel(32, 50, 19, p.gold, 0.28);
    s += '<circle cx="32" cy="32" r="30" fill="none" stroke="' + p.gold + '" stroke-opacity=".46"/>';
    s += '<circle cx="32" cy="32" r="27.5" fill="none" stroke="' + p.gold + '" stroke-opacity=".16"/>';

    if (flat) {
      s += '<path d="M19 23 Q18 12 32 10 Q46 12 45 23 Q38 20 32 20 Q26 20 19 23Z" fill="' + p.rock2 + '" stroke="' + p.gold + '" stroke-opacity=".35"/>';
      s += '<path d="M20 22 Q32 18 44 22" fill="none" stroke="' + p.gold + '" stroke-opacity=".55"/>';
      s += '<path d="M41 19 Q48 9 52 4 Q48 14 44 21Z" fill="' + p.light + '" opacity=".5"/>';
      s += '<circle cx="32" cy="17" r="1.6" fill="' + p.accent + '"/>';
    } else {
      s += '<ellipse cx="32" cy="22" rx="20" ry="4.5" fill="' + p.rock + '" stroke="' + p.gold + '" stroke-opacity=".45"/>';
      s += '<path d="M25 22 L27 10 L37 10 L39 22Z" fill="' + p.rock2 + '" stroke="' + p.gold + '" stroke-opacity=".3"/>';
      s += '<path d="M25 15 L39 15" stroke="' + p.gold + '" stroke-opacity=".55"/>';
      s += '<circle cx="32" cy="13" r="1.8" fill="' + p.accent + '"/>';
      s += '<path d="M41 19 Q52 8 50 2 Q46 12 39 18Z" fill="' + p.accent + '" opacity=".65"/>';
    }

    s += diamond(32, 41, 15, p.accent, ' opacity=".08"');
    s += diamond(32, 41, 12, p.gold, ' opacity=".1"');
    s += gemShape(gemColor, 32, 41, 23);
    s += '<path d="M20 55 Q32 61 44 55" fill="none" stroke="' + p.gold + '" stroke-opacity=".42"/>';
    s += '<g fill="' + p.gold + '" opacity=".85">' +
      diamond(25, 57, 1.1, p.gold) + diamond(32, 59, 1.3, p.gold) + diamond(39, 57, 1.1, p.gold) + '</g>';
    s += '<path d="M5 60 Q9 51 18 47" fill="none" stroke="' + p.gold + '" stroke-opacity=".2"/>';
    s += '<path d="M59 60 Q55 51 46 47" fill="none" stroke="' + p.gold + '" stroke-opacity=".2"/>';
    s += '</svg>';
    return s;
  }

  // ------------------------------------------------------------
  // 标题主视觉
  // ------------------------------------------------------------
  function heroScene() {
    const id = uid();
    let s = '<svg class="hero-art" viewBox="0 0 240 240" aria-hidden="true" focusable="false">';
    s += '<defs><radialGradient id="' + id + 'g" cx="50%" cy="48%" r="50%">' +
      '<stop offset="0" stop-color="#eafff8" stop-opacity=".35"/>' +
      '<stop offset=".4" stop-color="#2f9b78" stop-opacity=".14"/>' +
      '<stop offset="1" stop-color="#2f9b78" stop-opacity="0"/>' +
      '</radialGradient>' +
      '<linearGradient id="' + id + 'p" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#18251f"/><stop offset="1" stop-color="#050b08"/></linearGradient></defs>';
    s += '<circle cx="120" cy="112" r="104" fill="url(#' + id + 'g)"/>';
    s += '<g stroke="' + GOLD + '" fill="none" opacity=".5">' +
      '<circle cx="120" cy="112" r="96" stroke-opacity=".25"/>' +
      '<circle cx="120" cy="112" r="84" stroke-opacity=".35"/>' +
      '<circle cx="120" cy="112" r="64" stroke-opacity=".18"/>' +
      '</g>';
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      const r1 = i % 3 === 0 ? 78 : 88;
      s += line(120 + Math.cos(a) * r1, 112 + Math.sin(a) * r1, 120 + Math.cos(a) * 94, 112 + Math.sin(a) * 94, GOLD, i % 3 === 0 ? 1 : .6, ' opacity=".35"');
    }
    s += '<g fill="' + GOLD_LIGHT + '" opacity=".8">' +
      diamond(120, 6, 4, GOLD_LIGHT) + diamond(120, 218, 4, GOLD_LIGHT) +
      diamond(14, 112, 4, GOLD_LIGHT) + diamond(226, 112, 4, GOLD_LIGHT) + '</g>';
    s += '<g stroke="' + GOLD + '" stroke-opacity=".3">' +
      '<path d="M120 18 L120 44"/><path d="M120 180 L120 206"/><path d="M22 112 L48 112"/><path d="M192 112 L218 112"/>' +
      '</g>';
    s += '<path d="M76 188 L164 188 L150 208 L90 208Z" fill="url(#' + id + 'p)" stroke="' + GOLD + '" stroke-opacity=".4"/>';
    s += '<path d="M76 188 L164 188" stroke="' + GOLD_LIGHT + '" stroke-opacity=".4"/>';
    s += '<g fill="' + GOLD + '" opacity=".45">' +
      '<ellipse cx="66" cy="196" rx="10" ry="2.2"/><ellipse cx="174" cy="198" rx="9" ry="2"/>' +
      '<ellipse cx="58" cy="188" rx="7" ry="1.8"/><ellipse cx="184" cy="188" rx="6" ry="1.6"/>' +
      '</g>';
    s += gemShape('white', 120, 112, 104);
    s += '<g opacity=".9">' + gemShape('blue', 62, 168, 18) + gemShape('red', 180, 166, 16) + gemShape('green', 196, 186, 12) + '</g>';
    s += '<g fill="' + GOLD_LIGHT + '">' +
      circle(70, 64, 1.4, GOLD_LIGHT) + circle(176, 72, 1.1, GOLD_LIGHT) + circle(86, 150, 1, GOLD_LIGHT) + circle(162, 144, .9, GOLD_LIGHT) +
      '</g>';
    s += '</svg>';
    return s;
  }

  // ------------------------------------------------------------
  // 卡背
  // ------------------------------------------------------------
  function cardBack() {
    const id = uid();
    let s = '<svg class="card-back-art" viewBox="0 0 160 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">';
    s += '<defs><linearGradient id="' + id + 'b" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#132820"/><stop offset=".5" stop-color="#081410"/><stop offset="1" stop-color="#132820"/>' +
      '</linearGradient></defs>';
    s += '<rect width="160" height="200" fill="url(#' + id + 'b)"/>';
    s += '<g stroke="' + GOLD + '" fill="none" opacity=".55">' +
      '<rect x="7" y="7" width="146" height="186" rx="9"/>' +
      '<rect x="13" y="13" width="134" height="174" rx="6" stroke-opacity=".35"/>' +
      '</g>';
    for (let i = 0; i < 8; i++) {
      s += '<path d="M20 ' + (28 + i * 20) + ' L140 ' + (20 + i * 20) + '" stroke="' + GOLD + '" stroke-opacity=".05"/>';
    }
    s += '<g stroke="' + GOLD + '" stroke-opacity=".5" fill="none">' +
      '<path d="M20 36 L32 24 L44 36"/><path d="M116 36 L128 24 L140 36"/>' +
      '<path d="M20 164 L32 176 L44 164"/><path d="M116 164 L128 176 L140 164"/>' +
      '</g>';
    s += '<g transform="translate(80 100)">' +
      '<path d="M0 -58 L42 0 L0 58 L-42 0Z" fill="none" stroke="' + GOLD + '" stroke-opacity=".55"/>' +
      '<path d="M0 -46 L33 0 L0 46 L-33 0Z" fill="' + GOLD + '" opacity=".05"/>' +
      '</g>';
    s += gemShape('white', 80, 100, 54);
    s += '<g stroke="' + GOLD + '" stroke-opacity=".4"><path d="M56 130 L104 130"/><path d="M64 136 L96 136"/></g>';
    s += '<g fill="' + GOLD + '" opacity=".5">' + diamond(80, 150, 3, GOLD) + diamond(80, 50, 3, GOLD) + '</g>';
    s += '</svg>';
    return s;
  }

  global.GemArt = {
    palettes: P,
    defs: gemDefs,
    gemSVG: gemSVG,
    gem: gemShape,
    cardScene: cardScene,
    noblePortrait: noblePortrait,
    merchantPortrait: merchantPortrait,
    heroScene: heroScene,
    cardBack: cardBack,
    hash: hash,
    rng: rng,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
