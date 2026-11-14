// 오프라인 지원: 네트워크 우선, 실패하면 캐시 사용 (배포 후 항상 최신 버전이 먼저 보이도록)
const CACHE = 'miniigame-v32';
const CORE = [
  './', './index.html', './embed.html', './manifest.webmanifest',
  './src/engine.js', './src/sfx.js', './src/music.js', './src/registry.js',
  './src/games/blocks.js', './src/games/maze.js', './src/games/snake.js',
  './src/games/breakout.js', './src/games/runner.js',
  './src/games/runner/world.js', './src/games/runner/enemies.js',
  './src/games/bridge.js', './src/games/kart.js', './src/games/kart/data.js', './src/games/kart/track.js', './src/games/kart/models.js', './src/games/kart/features.js', './src/games/kart/course.js', './src/games/kart/courses.js', './src/games/kart/shapes.js',
  './src/games/fps.js', './src/games/fps/data.js', './src/games/fps/world.js', './src/games/fps/models.js', './src/games/fps/bots.js',
  './src/vendor/three.module.min.js',
  './src/net/net.js', './src/net/lobby.js', './src/net/server-core.js', './src/net/local-worker.js',
  './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: req.mode === 'navigate' })),
  );
});
