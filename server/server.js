// 미니게임 멀티플레이 서버 (Node.js + ws)
//
// 1) 단독 실행 (게임 파일도 같이 서빙 → 바로 테스트 가능)
//      npm install && npm run server          → http://localhost:8787  (WebSocket: ws://localhost:8787/miniigame-ws)
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
    let file = path.normalize(path.join(root, decodeURIComponent(url.pathname)));
    if (!file.startsWith(root) || file.includes(`${path.sep}server${path.sep}`) || file.includes('node_modules')) { res.writeHead(403); return res.end(); }
    if (url.pathname.endsWith('/')) file = path.join(file, 'index.html');
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404); res.end('not found'); }
  });
  const api = attachMiniigame(server, { log: (...a) => console.log(new Date().toISOString(), ...a) });
  server.listen(port, () => console.log(`미니게임 서버: http://localhost:${port}  (WebSocket: ws://localhost:${port}/miniigame-ws)`));
}
