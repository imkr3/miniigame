import * as THREE from '../../vendor/three.module.min.js';

const horizons = {
  forest: ['#547fa9', '#9cb9bd', '#678b88'],
  yard: ['#457da7', '#9caeb5', '#798d9d'],
  town: ['#ba936e', '#ddba97', '#b58a71'],
  base: ['#668aa9', '#adbfce', '#859aaa'],
};

// 맵을 열 때 한 번 그리는 원경. 양 끝의 산등성이가 이어지는 파노라마다.
export function buildSky(def) {
  const cv = document.createElement('canvas');
  cv.width = 2048; cv.height = 512;
  const c = cv.getContext('2d'), w = cv.width, h = cv.height;
  const [zenith, far, near] = horizons[def.id];
  const css = n => '#' + new THREE.Color(n).getHexString();
  const sky = c.createLinearGradient(0, 0, 0, h * 0.54);
  sky.addColorStop(0, zenith); sky.addColorStop(0.68, css(def.sky)); sky.addColorStop(1, css(def.fog));
  c.fillStyle = sky; c.fillRect(0, 0, w, h);
  let seed = 1729;
  const random = () => (seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296;
  for (let i = 0; i < 35; i++) {
    const x = random() * w, y = 100 + random() * 118, width = 30 + random() * 100;
    for (let j = 0; j < 5; j++) {
      const cx = x + (random() - 0.5) * width, cy = y + random() * 5, r = 8 + random() * 15;
      for (const offset of [-w, 0, w]) {
        c.save(); c.translate(cx + offset, cy); c.scale(2.7, 0.6);
        const cloud = c.createRadialGradient(0, 0, 0, 0, 0, r);
        cloud.addColorStop(0, 'rgba(255,250,240,.42)'); cloud.addColorStop(1, 'rgba(255,250,240,0)');
        c.fillStyle = cloud; c.fillRect(-r, -r, r * 2, r * 2); c.restore();
      }
    }
  }
  for (let layer = 0; layer < 2; layer++) {
    const points = [];
    for (let i = 0; i < 96; i++) {
      const angle = i / 96 * 2 * Math.PI, ridge = Math.sin(3 * angle + layer) + 0.55 * Math.sin(7 * angle - layer);
      let y = 235 + layer * 14 - ridge * (def.snow ? 20 : 10) - random() * 9;
      if (def.id === 'town') y = Math.round(y / 8) * 8;
      points.push(y);
    }
    const step = w / points.length;
    c.fillStyle = layer ? near : far; c.beginPath(); c.moveTo(0, h);
    points.forEach((y, i) => c.lineTo(i * step, y));
    c.lineTo(w, points[0]); c.lineTo(w, h); c.fill();
    for (let i = 1; i < points.length - 1; i++) {
      const x = step * i, y = points[i];
      if (def.snow && y < points[i - 1] && y < points[i + 1]) {
        c.fillStyle = '#e3edf3'; c.beginPath(); c.moveTo(x, y); c.lineTo(x + step, points[i + 1]);
        c.lineTo(x + 3, y + 4); c.lineTo(x - step, points[i - 1]); c.fill();
      } else if (def.id === 'forest' && layer) {
        for (let j = 0; j < 5; j++) {
          const px = x + j * step / 5, py = y + (points[i + 1] - y) * j / 5;
          c.beginPath(); c.moveTo(px - 3, py + 2); c.lineTo(px, py - 5 - random() * 5); c.lineTo(px + 3, py + 2); c.fill();
        }
      } else if (def.id === 'yard' && layer && i % 13 === 4) {
        c.fillRect(x, y - 19, 3, 20); c.fillRect(x - 8, y - 19, 30, 2); c.fillRect(x + 19, y - 18, 1, 9);
      }
    }
  }
  const map = new THREE.CanvasTexture(cv); map.colorSpace = THREE.SRGBColorSpace; map.wrapS = THREE.RepeatWrapping;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(260, 48, 24), new THREE.MeshBasicMaterial({ map, side: THREE.BackSide, fog: false, depthWrite: false }));
  dome.renderOrder = -10;
  return dome;
}

// 큰 색 변화와 접지 그림자를 지면 꼭짓점에 구워 낮은 품질에서도 깊이를 유지한다.
export function groundColors(geo, boxes, width, depth) {
  const pos = geo.attributes.position, shades = new Float32Array(pos.count);
  const { widthSegments: nx, heightSegments: nz } = geo.parameters;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = -pos.getY(i);
    shades[i] = 0.92 + 0.045 * Math.sin(x * 0.24 + Math.cos(z * 0.32)) + 0.035 * Math.cos(z * 0.41 - x * 0.13);
  }
  for (const b of boxes) {
    if (b.y0 > 0.15 || !b.vis || b.y1 < 0.4) continue;
    const radius = Math.min(2.5, 0.7 + b.y1 * 0.2);
    const left = Math.max(0, Math.floor((0.5 + (b.x0 - radius) / width) * nx));
    const right = Math.min(nx, Math.ceil((0.5 + (b.x1 + radius) / width) * nx));
    const top = Math.max(0, Math.floor((0.5 + (b.z0 - radius) / depth) * nz));
    const bottom = Math.min(nz, Math.ceil((0.5 + (b.z1 + radius) / depth) * nz));
    for (let row = top; row <= bottom; row++) for (let col = left; col <= right; col++) {
      const i = row * (nx + 1) + col, x = pos.getX(i), z = -pos.getY(i);
      const dist = Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.z0 - z, 0, z - b.z1));
      shades[i] = Math.min(shades[i], 0.55 + 0.45 * Math.min(1, dist / radius));
    }
  }
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < shades.length; i++) colors.fill(shades[i], i * 3, i * 3 + 3);
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}
