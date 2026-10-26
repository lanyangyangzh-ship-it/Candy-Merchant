import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';

const PORT = 19000 + Math.floor(Math.random() * 800);
const BASE = `http://127.0.0.1:${PORT}`;
const WS = `ws://127.0.0.1:${PORT}/ws`;

const server = spawn(process.execPath, ['server.mjs'], {
  cwd: new URL('..', import.meta.url),
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (d) => { serverLog += d.toString(); });
server.stderr.on('data', (d) => { serverLog += d.toString(); });

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function waitForHealth(timeout = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      const res = await fetch(BASE + '/health');
      if (res.ok) return await res.json();
    } catch (e) { /* retry */ }
    await sleep(120);
  }
  throw new Error('server did not start\n' + serverLog);
}

class Client {
  constructor(ws) {
    this.ws = ws;
    this.queue = [];
    this.waiters = [];
    ws.on('message', (data) => {
      let message;
      try { message = JSON.parse(data.toString()); } catch (e) { return; }
      this.queue.push(message);
      this.flush();
    });
    ws.on('close', () => {
      for (const w of this.waiters.splice(0)) {
        clearTimeout(w.timer);
        w.reject(new Error('socket closed while waiting for ' + w.label));
      }
    });
  }
  flush() {
    while (this.waiters.length) {
      const waiter = this.waiters[0];
      const index = this.queue.findIndex(waiter.predicate);
      if (index < 0) break;
      const [message] = this.queue.splice(index, 1);
      this.waiters.shift();
      clearTimeout(waiter.timer);
      waiter.resolve(message);
    }
  }
  next(label, predicate, timeout = 3000) {
    const existing = this.queue.findIndex(predicate);
    if (existing >= 0) return Promise.resolve(this.queue.splice(existing, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter = { label, predicate, resolve, reject, timer: null };
      waiter.timer = setTimeout(() => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(new Error('timeout waiting for ' + label));
      }, timeout);
      this.waiters.push(waiter);
    });
  }
  send(message) { this.ws.send(JSON.stringify(message)); }
  close() { try { this.ws.close(); } catch (e) { /* ignore */ } }
}

async function openClient() {
  const ws = new WebSocket(WS);
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  return new Client(ws);
}

let host;
let guest;
let third;
let fourth;
let fifth;
let late;
let bad;
const clients = [];
try {
  const health = await waitForHealth();
  assert.equal(health.ok, true);
  console.log('health ok');

  const page = await fetch(BASE + '/');
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.ok(html.includes('宝石商人'));
  assert.ok(html.includes('GemEngine'));
  console.log('static page ok');

  const rulebook = await fetch(BASE + '/rulebook.html');
  assert.equal(rulebook.status, 200);
  const rb = await rulebook.text();
  assert.ok(rb.includes('宝石商人'));
  assert.ok(rb.includes('卡牌图鉴'));
  console.log('rulebook ok');

  host = await openClient();
  clients.push(host);
  host.send({ type: 'create' });
  const room = await host.next('room', (m) => m.type === 'room');
  assert.equal(room.role, 'host');
  assert.equal(room.code.length, 4);
  console.log('create room', room.code);

  bad = await openClient();
  clients.push(bad);
  bad.send({ type: 'join', code: 'ZZZZ' });
  const badError = await bad.next('error', (m) => m.type === 'error');
  assert.ok(badError.reason.includes('房间不存在'));

  guest = await openClient();
  clients.push(guest);
  guest.send({ type: 'join', code: room.code });
  const joined = await guest.next('joined', (m) => m.type === 'joined');
  assert.equal(joined.code, room.code);
  assert.equal(joined.role, 'guest');
  assert.equal(joined.seat, 1);
  const peer1 = await host.next('peer-joined', (m) => m.type === 'peer-joined' && m.seat === 1);
  assert.ok(peer1);
  console.log('join seat 1 ok');

  third = await openClient();
  clients.push(third);
  third.send({ type: 'join', code: room.code });
  const joined3 = await third.next('joined', (m) => m.type === 'joined');
  assert.equal(joined3.seat, 2);
  const peer2 = await host.next('peer-joined', (m) => m.type === 'peer-joined' && m.seat === 2);
  assert.ok(peer2);

  fourth = await openClient();
  clients.push(fourth);
  fourth.send({ type: 'join', code: room.code });
  const joined4 = await fourth.next('joined', (m) => m.type === 'joined');
  assert.equal(joined4.seat, 3);
  const peer3 = await host.next('peer-joined', (m) => m.type === 'peer-joined' && m.seat === 3);
  assert.ok(peer3);
  console.log('join seats 2/3 ok');

  fifth = await openClient();
  clients.push(fifth);
  fifth.send({ type: 'join', code: room.code });
  const full = await fifth.next('error', (m) => m.type === 'error');
  assert.ok(full.reason.includes('房间已满'));

  host.send({ type: 'relay', data: { t: 'state', state: { hello: 'guest' }, to: 1 } });
  const stateMsg = await guest.next('relay-state', (m) => m.type === 'relay' && m.data.t === 'state');
  assert.equal(stateMsg.data.state.hello, 'guest');

  guest.send({ type: 'relay', data: { t: 'action', action: { type: 'take', colors: ['white', 'blue', 'green'] } } });
  const actionMsg = await host.next('relay-action', (m) => m.type === 'relay' && m.data.t === 'action');
  assert.deepEqual(actionMsg.data.action.colors, ['white', 'blue', 'green']);
  assert.equal(actionMsg.from, 1);
  console.log('relay ok');

  host.send({ type: 'start' });
  const started = await host.next('started', (m) => m.type === 'started');
  assert.ok(started);

  late = await openClient();
  clients.push(late);
  late.send({ type: 'join', code: room.code });
  const lateError = await late.next('error', (m) => m.type === 'error');
  assert.ok(lateError.reason.includes('已经开始'));

  guest.close();
  const left = await host.next('peer-left', (m) => m.type === 'peer-left');
  assert.ok(left.reason.includes('玩家') || left.reason.includes('房主'));
  const left2 = await third.next('peer-left', (m) => m.type === 'peer-left');
  assert.ok(left2);
  await sleep(300);
  const healthAfter = await (await fetch(BASE + '/health')).json();
  assert.equal(healthAfter.rooms, 0);
  console.log('leave/cleanup ok');

  console.log('ALL SERVER TESTS PASSED');
} finally {
  for (const c of clients) c.close();
  server.kill('SIGTERM');
  await sleep(400);
  if (server.exitCode === null) server.kill('SIGKILL');
}
