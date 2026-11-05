# miniigame

다른 웹사이트에 붙여 쓰기 위한 브라우저 미니게임 모음. 빌드 도구 없이 순수 JS(ES 모듈) + Canvas로 만들었습니다.

| id | 게임 | 장르 |
|---|---|---|
| `blocks` | 블록 낙하 | 낙하 블록 퍼즐 |
| `maze` | 미로 추격 | 미로 점 먹기 + 추격자 |
| `snake` | 스네이크 | 스네이크 |
| `breakout` | 벽돌깨기 | 벽돌깨기 |
| `runner` | 점프 러너 | 무한 러너 |

## 실행

ES 모듈을 쓰기 때문에 `file://`로 열면 안 되고 로컬 서버가 필요합니다.

```bash
python3 -m http.server 8000
# 또는: npx serve .
```

- 게임 목록: http://localhost:8000/
- 단일 게임: http://localhost:8000/embed.html?game=snake

## 다른 사이트에 붙이는 방법

### 1) iframe (가장 간단)

```html
<iframe src="https://<배포주소>/embed.html?game=blocks" width="400" height="560" style="border:0"></iframe>
<script>
  window.addEventListener('message', (e) => {
    if (e.data?.source === 'miniigame' && e.data.type === 'gameover') {
      console.log(e.data.game, '점수', e.data.score);
    }
  });
</script>
```

### 2) 모듈로 직접 삽입

```html
<div id="game"></div>
<script type="module">
  import { mountGame } from '/miniigame/src/registry.js';
  const game = await mountGame('snake', document.getElementById('game'), {
    onEvent: (e) => console.log(e), // { type: 'start'|'pause'|'resume'|'gameover', game, score, best? }
  });
  // game.pause(); game.resume(); game.destroy();
</script>
```

## 구조

```
src/
  engine.js     공통 엔진 (GameBase: 캔버스·HUD·오버레이·루프·입력·최고점수)
  registry.js   게임 목록 + mountGame()
  games/*.js    게임별 구현
index.html      게임 목록 페이지
embed.html      iframe용 단일 게임 페이지
```

### 새 게임 추가

1. `src/games/xxx.js`에서 `GameBase`를 상속하고 `static meta`, `init()`, `update(dt)`, `draw(ctx)`, `onAction(action)`을 구현
2. `src/registry.js`의 `GAMES`에 한 줄 추가

입력은 엔진이 `left/right/up/down/action/pause`로 통일해서 넘겨줍니다 (키보드: 방향키·WASD·Space·P/Esc, 터치: 스와이프·탭).
최고 점수는 `localStorage`의 `miniigame:<id>:best`에 저장됩니다.
