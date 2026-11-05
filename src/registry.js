// 게임 목록. 새 게임을 추가하려면 src/games/에 파일을 만들고 여기에 한 줄 추가하면 된다.
export const GAMES = [
  { id: 'blocks',   title: '블록 낙하', emoji: '🧱', load: () => import('./games/blocks.js') },
  { id: 'maze',     title: '미로 추격', emoji: '🌀', load: () => import('./games/maze.js') },
  { id: 'snake',    title: '스네이크',  emoji: '🐍', load: () => import('./games/snake.js') },
  { id: 'breakout', title: '벽돌깨기',  emoji: '🏓', load: () => import('./games/breakout.js') },
  { id: 'runner',   title: '점프 러너', emoji: '🏃', load: () => import('./games/runner.js') },
];

/**
 * 게임을 컨테이너에 붙인다. 반환값으로 start/pause/resume/destroy 를 호출할 수 있다.
 * @param {string} id
 * @param {HTMLElement} container
 * @param {{onEvent?:(e:{type:string,game:string,score:number})=>void, maxWidth?:number}} [opts]
 */
export async function mountGame(id, container, opts = {}) {
  const entry = GAMES.find((g) => g.id === id);
  if (!entry) throw new Error(`알 수 없는 게임: ${id}`);
  const { default: Game } = await entry.load();
  return new Game(container, opts);
}
