// 미니게임 멀티플레이 서버 (Node.js + ws)
//
// 1) 단독 실행 (게임 파일도 같이 서빙 → 바로 테스트 가능)
//      npm install && npm run server          → http://localhost:8787  (WebSocket: ws://localhost:8787/miniigame-ws)
//    같은 와이파이의 폰·PC 는 화면에 나오는 http://<이 PC의 IP>:8787 로 접속하면 서버가 자동으로 연결됨
//    (윈도우는 start-lan.bat, 맥은 start-lan.command 를 더블클릭해도 됨)
//
// 2) 다른 사이트의 기존 Node 서버에 붙이기
//      import { attachMiniigame } from './miniigame/server/server.js';
//      const httpServer = app.listen(3000);              // Express 등
//      attachMiniigame(httpServer, { path: '/miniigame-ws' });
//    클라이언트에서는  mountGame(id, el, { server: 'wss://내사이트/miniigame-ws' })
//    또는 페이지에서  window.MINIIGAME_SERVER = 'wss://내사이트/miniigame-ws'
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { WebSocketServer } from 'ws';
import { RoomServer } from '../src/net/server-core.js';

/**
 * 기존 http.Server 에 멀티플레이 WebSocket 을 붙인다.
 * @returns {{ wss: WebSocketServer, rooms: RoomServer, close(): void }}
 */
export function attachMiniigame(server, { path: wsPath = '/miniigame-ws', log = () => {} } = {}) {
  const rooms = new RoomServer({ log });
  const wss = new WebSocketServer({ server, path: wsPath, maxPayload: 32 * 1024 });
  wss.on('connection', (ws) => {
    ws.alive = true;
    ws.on('pong', () => { ws.alive = true; });
    const conn = rooms.connect((obj) => { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); });
    ws.on('message', (data) => conn.message(data.toString()));
    ws.on('close', () => conn.close());
    ws.on('error', () => {});
  });
  // 끊긴 연결 정리 (30초마다 ping)
  const timer = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.alive) { ws.terminate(); continue; }
      ws.alive = false;
      ws.ping();
    }
  }, 30000);
  wss.on('close', () => clearInterval(timer));
  return { wss, rooms, close: () => { clearInterval(timer); wss.close(); } };
}

// ---------------- 단독 실행 ----------------
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const port = Number(process.env.PORT) || 8787;
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/health') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ ok: true, ...api.rooms.stats() })); }
    if (url.pathname === '/lan') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ urls: lanUrls(port) })); }
    let file = path.normalize(path.join(root, decodeURIComponent(url.pathname)));
    if (!file.startsWith(root) || file.includes(`${path.sep}server${path.sep}`) || file.includes('node_modules')) { res.writeHead(403); return res.end(); }
    if (url.pathname.endsWith('/')) file = path.join(file, 'index.html');
    try {
      let body = await readFile(file);
      // 이 서버가 준 페이지는 멀티플레이 서버를 자동으로 이 서버로 (같은 와이파이 기기는 주소만 열면 됨)
      if (file.endsWith('.html')) body = body.toString().replace('</head>', `<script>window.MINIIGAME_SERVER=(location.protocol==='https:'?'wss://':'ws://')+location.host+'/miniigame-ws';window.MINIIGAME_LAN=true;</script></head>`);
      res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
      res.end(body);
    } catch { res.writeHead(404); res.end('not found'); }
  });
  const api = attachMiniigame(server, { log: (...a) => console.log(new Date().toISOString(), ...a) });
  server.listen(port, '0.0.0.0', () => {
    console.log(`\n미니게임 서버가 켜졌어요: http://localhost:${port}`);
    const urls = lanUrls(port);
    if (urls.length) { console.log('\n같은 와이파이의 휴대폰·다른 PC 에서는 브라우저로 이 주소를 여세요:'); for (const u of urls) console.log(`   ${u}`); }
    else console.log('\n(와이파이·랜 주소를 찾지 못했어요. 네트워크 연결을 확인하세요)');
    console.log('\n→ 게임의 🌐 멀티플레이 → 방 만들기 → 방 코드를 친구에게 알려 주세요. 이 창을 닫으면 서버가 꺼집니다.\n');
  });
}

/** 이 PC 의 와이파이·랜 IPv4 주소들 → 접속 주소 */
function lanUrls(port) {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    if (/vmware|virtualbox|vEthernet|docker|br-|veth|utun|tailscale/i.test(name)) continue; // 가상 어댑터 제외
    for (const a of list ?? []) if ((a.family === 'IPv4' || a.family === 4) && !a.internal) out.push(`http://${a.address}:${port}`);
  }
  return out;
}
