// 게임 목록. 새 게임을 추가하려면 src/games/에 파일을 만들고 여기에 한 줄 추가하면 된다.
export const GAMES = [
  { id: 'blocks',   title: '블록 낙하', emoji: '🧱', color: '#7c3aed', desc: '줄을 채워 없애는 퍼즐', load: () => import('./games/blocks.js') },
  { id: 'maze',     title: '미로 추격', emoji: '🌀', color: '#0891b2', desc: '점을 모으고 박쥐를 피하기', load: () => import('./games/maze.js') },
  { id: 'snake',    title: '스네이크',  emoji: '🐍', color: '#16a34a', desc: '먹고, 길어지고, 피하기', load: () => import('./games/snake.js') },
  { id: 'breakout', title: '벽돌깨기',  emoji: '🧨', color: '#dc2626', desc: '공을 튕겨 벽돌 부수기', load: () => import('./games/breakout.js') },
  { id: 'kart',     title: '카트 레이스', emoji: '🏎️', color: '#e11d48', desc: '드리프트와 아이템의 3D 레이스', load: () => import('./games/kart.js') },
  { id: 'bridge',   title: '다리 잇기', emoji: '🌉', color: '#f59e0b', desc: '눌러서 막대 늘리고 다리 건너기', load: () => import('./games/bridge.js') },
  { id: 'runner',   title: '점프 러너', emoji: '⚔️', color: '#65a30d', desc: '무기·증강으로 싸우는 플랫포머', load: () => import('./games/runner.js') },
  { id: 'fps',      title: '스쿼드 슈터', emoji: '🔫', color: '#475569', desc: '봇 분대와 싸우는 1인칭 슈팅', load: () => import('./games/fps.js') },
];

/**
 * 게임을 컨테이너에 붙인다. 반환값으로 start/pause/resume/destroy 를 호출할 수 있다.
 * @param {string} id
 * @param {HTMLElement} container
 * @param {{fit?:boolean, maxWidth?:number, controls?:'auto'|'always'|'never', onEvent?:(e:{type:string,game:string,score:number})=>void}} [opts]
 */
export async function mountGame(id, container, opts = {}) {
  const entry = GAMES.find((g) => g.id === id);
  if (!entry) throw new Error(`알 수 없는 게임: ${id}`);
  const { default: Game } = await entry.load();
  return new Game(container, opts);
}

export { getBest, getTop } from './engine.js';
