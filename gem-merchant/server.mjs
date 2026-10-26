/*
 * 宝石商人 · 联机服务器
 * ------------------------------------------------------------
 * - 托管 index.html（单文件游戏）
 * - /ws 提供房间码配对与消息中继
 * - 房主权威：房主浏览器运行规则引擎，访客只发送动作并接收快照
 *
 * 运行：
 *   npm install
 *   npm start
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomInt } from 'node:crypto';

let WebSocketServer;
try {
  ({ WebSocketServer } = await import('ws'));
} catch (e) {
  console.error('\n缺少依赖 ws。请先在项目目录运行：npm install\n');
  process.exit(1);
}

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const INDEX = path.join(ROOT, 'index.html');
const RULEBOOK = path.join(ROOT, 'rulebook.html');
const PORT = Number(process.env.PORT) || 8787;
const HOST = process.env.HOST || '0.0.0.0';
const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_PLAYERS = 4;
const ROOM_IDLE_MS = 30 * 60 * 1000;
const ROOM_MAX_MS = 2 * 60 * 60 * 1000;

const rooms = new Map();
const startedAt = Date.now();

// ------------------------------------------------------------
// HTTP：托管游戏页面
// ------------------------------------------------------------
function sendText(res, status, text, type) {
  res.writeHead(status, {
    'Content-Type': (type || 'text/plain') + '; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(text);
}

const server = http.createServer((req, res) => {
  let pathname = '/';
  try {
    pathname = new URL(req.url, 'http://localhost').pathname;
  } catch (e) { /* ignore */ }

  if (pathname === '/health') {
    sendText(res, 200, JSON.stringify({
      ok: true,
      rooms: rooms.size,
      clients: wss ? wss.clients.size : 0,
      uptime: Math.floor((Date.now() - startedAt) / 1000),
    }), 'application/json');
    return;
  }

  if (pathname === '/' || pathname === '/index.html') {
    fs.readFile(INDEX, (err, buf) => {
      if (err) {
        sendText(res, 500, 'index.html 读取失败，请先运行 node build.mjs');
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': buf.length,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      if (req.method === 'HEAD') res.end();
      else res.end(buf);
    });
    return;
  }

  if (pathname === '/rulebook.html') {
    fs.readFile(RULEBOOK, (err, buf) => {
      if (err) {
        sendText(res, 404, 'rulebook.html 不存在，请先运行 node build-rulebook.mjs');
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': buf.length,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      if (req.method === 'HEAD') res.end();
      else res.end(buf);
    });
    return;
  }

  if (pathname === '/favicon.ico') {
    res.writeHead(204);
    res.end();
    return;
  }

  sendText(res, 404, 'Not found');
});

// ------------------------------------------------------------
// WebSocket 房间
// ------------------------------------------------------------
const wss = new WebSocketServer({
  server,
  path: '/ws',
  maxPayload: 512 * 1024,
  perMessageDeflate: false,
});

function send(ws, message) {
  if (!ws || ws.readyState !== 1) return;
  try {
    ws.send(JSON.stringify(message));
  } catch (e) { /* ignore */ }
}

function makeCode() {
  for (let attempt = 0; attempt < 100; attempt++) {
    let code = '';
    for (let i = 0; i < 4; i++) code += ROOM_ALPHABET[randomInt(0, ROOM_ALPHABET.length)];
    if (!rooms.has(code)) return code;
  }
  return 'R' + String(Date.now()).slice(-3);
}

function cleanCode(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
}

function detach(ws, reason) {
  const code = ws.roomCode;
  if (!code) return;
  const room = rooms.get(code);
  const seat = ws.seat;
  const wasHost = !!room && room.host === ws;
  ws.roomCode = null;
  ws.role = null;
  ws.seat = null;
  if (!room) return;

  room.clients = room.clients.filter((client) => client !== ws);
  rooms.delete(code);

  if (wasHost) {
    for (const client of room.clients) {
      client.roomCode = null;
      client.role = null;
      client.seat = null;
      send(client, { type: 'peer-left', reason: reason || '房主离开了房间' });
    }
    return;
  }

  // v1：任何一名访客离开都关闭房间，房主可重新建房
  for (const client of room.clients) {
    client.roomCode = null;
    client.role = null;
    client.seat = null;
    send(client, {
      type: 'peer-left',
      seat,
      reason: reason || '有玩家离开了房间',
    });
  }
}

function giveError(ws, reason) {
  send(ws, { type: 'error', reason: reason });
}

function allowMessage(ws) {
  const now = Date.now();
  if (!ws.windowStart || now - ws.windowStart > 10000) {
    ws.windowStart = now;
    ws.windowCount = 0;
  }
  ws.windowCount += 1;
  if (ws.windowCount > 240) {
    giveError(ws, '操作太频繁，连接已断开');
    try { ws.close(); } catch (e) { /* ignore */ }
    return false;
  }
  return true;
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.roomCode = null;
  ws.role = null;
  ws.windowStart = Date.now();
  ws.windowCount = 0;

  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (buffer) => {
    if (!allowMessage(ws)) return;
    let message;
    try {
      message = JSON.parse(buffer.toString());
    } catch (e) {
      return;
    }
    if (!message || typeof message !== 'object') return;
    const type = String(message.type || '');

    if (type === 'create') {
      if (ws.roomCode) {
        giveError(ws, '你已经在房间中');
        return;
      }
      if (rooms.size >= 500) {
        giveError(ws, '服务器房间已满，请稍后再试');
        return;
      }
      const code = makeCode();
      const room = {
        code,
        host: ws,
        clients: [ws],
        createdAt: Date.now(),
        lastActivity: Date.now(),
      };
      rooms.set(code, room);
      ws.roomCode = code;
      ws.role = 'host';
      ws.seat = 0;
      send(ws, { type: 'room', code, role: 'host', seat: 0, max: MAX_PLAYERS });
      console.log(`[room ${code}] created`);
      return;
    }

    if (type === 'join') {
      if (ws.roomCode) {
        giveError(ws, '你已经在房间中');
        return;
      }
      const code = cleanCode(message.code);
      if (!code) {
        giveError(ws, '请输入房间码');
        return;
      }
      const room = rooms.get(code);
      if (!room) {
        giveError(ws, '房间不存在，请检查房间码');
        return;
      }
      if (room.started) {
        giveError(ws, '对局已经开始，请房主重新建房');
        return;
      }
      if (room.host === ws) {
        giveError(ws, '不能加入自己创建的房间');
        return;
      }
      if (room.clients.length >= MAX_PLAYERS) {
        giveError(ws, '房间已满');
        return;
      }
      const used = new Set(room.clients.map((client) => client.seat));
      let seat = 1;
      while (used.has(seat)) seat += 1;
      room.clients.push(ws);
      room.lastActivity = Date.now();
      ws.roomCode = code;
      ws.role = 'guest';
      ws.seat = seat;
      send(ws, { type: 'joined', code, role: 'guest', seat });
      for (const client of room.clients) {
        if (client !== ws) {
          send(client, { type: 'peer-joined', seat, name: '朋友 ' + seat });
        }
      }
      console.log(`[room ${code}] guest joined seat ${seat}`);
      return;
    }

    if (type === 'start') {
      const room = rooms.get(ws.roomCode);
      if (!room) {
        giveError(ws, '你还没有加入房间');
        return;
      }
      if (ws.role !== 'host') {
        giveError(ws, '只有房主可以开始对局');
        return;
      }
      room.started = true;
      room.lastActivity = Date.now();
      send(ws, { type: 'started' });
      return;
    }

    if (type === 'relay') {
      const room = rooms.get(ws.roomCode);
      if (!room) {
        giveError(ws, '你还没有加入房间');
        return;
      }
      if (room.clients.length < 2) {
        giveError(ws, '还没有其他玩家加入');
        return;
      }
      const data = message.data;
      if (!data || typeof data !== 'object' || typeof data.t !== 'string') {
        giveError(ws, '无效的消息');
        return;
      }
      room.lastActivity = Date.now();
      if (ws.role === 'host') {
        const targetSeat = Number(data.to);
        if (Number.isInteger(targetSeat) && targetSeat > 0) {
          const target = room.clients.find((client) => client.seat === targetSeat);
          if (target) send(target, { type: 'relay', data });
        } else {
          for (const client of room.clients) {
            if (client !== ws) send(client, { type: 'relay', data });
          }
        }
      } else {
        send(room.host, { type: 'relay', data, from: ws.seat });
      }
      return;
    }

    if (type === 'leave') {
      detach(ws, ws.role === 'host' ? '房主离开了房间' : '有玩家离开了房间');
      try { ws.close(); } catch (e) { /* ignore */ }
      return;
    }

    if (type === 'ping') {
      send(ws, { type: 'pong', t: Date.now() });
      return;
    }

    if (type === 'state' || type === 'action') {
      // 兼容旧客户端：访客动作转给房主，房主消息广播给所有访客
      const room = rooms.get(ws.roomCode);
      if (!room || room.clients.length < 2) {
        giveError(ws, '还没有其他玩家加入');
        return;
      }
      const data = { t: type, state: message.state, action: message.action };
      room.lastActivity = Date.now();
      if (ws.role === 'host') {
        for (const client of room.clients) {
          if (client !== ws) send(client, { type: 'relay', data });
        }
      } else {
        send(room.host, { type: 'relay', data, from: ws.seat });
      }
      return;
    }

    giveError(ws, '未知的消息类型');
  });

  ws.on('close', () => {
    const room = rooms.get(ws.roomCode);
    const code = ws.roomCode;
    const role = ws.role;
    detach(ws, role === 'host' ? '房主离开了房间' : '有玩家离开了房间');
    if (code && room) console.log(`[room ${code}] ${role || 'client'} left`);
  });

  ws.on('error', () => { /* close 会处理清理 */ });
});

// 心跳 + 过期房间清理
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      try { ws.terminate(); } catch (e) { /* ignore */ }
      continue;
    }
    ws.isAlive = false;
    try { ws.ping(); } catch (e) { /* ignore */ }
  }

  const now = Date.now();
  for (const room of Array.from(rooms.values())) {
    const waitingTooLong = room.clients.length === 1 && now - room.createdAt > ROOM_IDLE_MS;
    const gameTooLong = now - room.lastActivity > ROOM_MAX_MS;
    if (!waitingTooLong && !gameTooLong) continue;
    rooms.delete(room.code);
    const reason = waitingTooLong ? '房间等待超时，已关闭' : '房间空闲超时，已关闭';
    for (const client of room.clients) {
      client.roomCode = null;
      client.role = null;
      client.seat = null;
      send(client, { type: 'peer-left', reason });
    }
  }
}, 30000);

wss.on('close', () => clearInterval(heartbeat));

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n端口 ${PORT} 已被占用。换一个端口：PORT=8788 npm start\n`);
  } else {
    console.error(err);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log('\n  宝石商人 · 联机服务器');
  console.log(`  本机：  http://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const addr of list || []) {
      if (addr.family === 'IPv4' && !addr.internal) {
        console.log(`  局域网：http://${addr.address}:${PORT}`);
      }
    }
  }
  console.log(`  WebSocket：ws://localhost:${PORT}/ws`);
  console.log('\n  同一 Wi-Fi 下把“局域网”地址发给朋友即可；公网联机请部署到 Render/Railway 或使用隧道。\n');
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log('\n正在关闭服务器…');
    for (const ws of wss.clients) {
      try { ws.close(1001, 'server shutdown'); } catch (e) { /* ignore */ }
    }
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500);
  });
}
