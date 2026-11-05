# miniigame

다른 웹사이트에 붙여 쓰기 위한 브라우저 미니게임 모음. 빌드 도구 없이 순수 JS(ES 모듈) + Canvas로 만들었습니다.
PC(키보드·마우스)와 모바일(터치·화면 버튼) 모두 지원합니다.

**테스트 페이지:** https://imkr3.github.io/miniigame/

| id | 게임 | 장르 |
|---|---|---|
| `blocks` | 블록 낙하 | 낙하 블록 퍼즐 (SRS 회전·180°, T/올스핀, B2B, 콤보, 보관, 퍼펙트 클리어) |
| `maze` | 미로 추격 | 미로 점 먹기 + 추격자 (맵 2종, 보너스 별) |
| `snake` | 스네이크 | 스네이크 (황금 먹이) |
| `breakout` | 벽돌깨기 | 벽돌깨기 (아이템: 확장·멀티볼·슬로우·목숨) |
| `runner` | 점프 러너 | 액션 플랫포머 (무기 3종, 적 4종 + 보스, 증강 19종, 무작위 스테이지) |

## 실행

ES 모듈을 쓰기 때문에 `file://`로 열면 안 되고 로컬 서버가 필요합니다.

```bash
python3 -m http.server 8000
# 또는: npx serve .
```

- 게임 목록: http://localhost:8000/
- 단일 게임: http://localhost:8000/embed.html?game=snake

## 조작

| 게임 | PC | 모바일 |
|---|---|---|
| 블록 낙하 | ←→ 이동, ↓ 소프트드롭, Space 하드드롭, ↑/X 회전, Z/Ctrl 반대 회전, A 180°, C/Shift 보관 | 탭 회전, 좌우로 끌기 이동, 아래로 끌기 빠르게, 위로 밀기 보관 + 화면 버튼(역회전·180°·보관·낙하) |
| 미로 추격 | 방향키 / WASD | 스와이프 + 방향 버튼 |
| 스네이크 | 방향키 / WASD | 스와이프 + 방향 버튼 |
| 벽돌깨기 | 마우스 이동 또는 ←→, 클릭/Space 발사 | 화면 어디서나 좌우로 끌기, 탭 발사 |
| 점프 러너 | ←→/AD 이동, Shift 달리기, Space/Z 점프(길게 = 높이), X/J 공격, C/K 대쉬, Q 무기 교체, ↓+점프 발판 내려가기, 1~3 증강 선택 | ◀▶ 이동, 점프·공격·대쉬·달리기(토글)·무기 버튼, 화면 탭 = 공격 / 카드 선택 |

공통: P/Esc 일시정지, R 처음부터, M 소리 끄기. 모바일 화면 버튼은 터치 기기에서만 자동으로 나타나고, 폰을 가로로 눕히면 버튼이 화면 양옆으로 이동합니다.

### 설정 (⚙ 버튼)

- **조작키 변경**: 모든 게임, 동작마다 키 2개까지. 다른 동작에 쓰던 키를 지정하면 거기서 자동으로 빠집니다. 브라우저에 저장됩니다.
- **블록 낙하**: DAS, ARR(0 = 즉시), 소프트 드롭 속도(0 = 즉시), 고정 대기 시간, 스핀 판정(올스핀 / T만 / 끄기), 미리보기 개수, 착지 위치 표시
- **공통**: 진동, 화면 흔들림

### 점프 러너 구성

- 스테이지는 매번 무작위 생성: 절벽, 가시, 떠 있는 발판(아래에서 통과 가능), 계단, 블록. 테마 3종(초원·동굴·노을)
- 적: 슬라임(순찰), 벌 드론(추적 비행), 포탑(조준 사격), 멧돼지(예고 후 돌진). 머리를 밟으면 피해
- 3스테이지마다 보스 골렘: 내려찍기 충격파 / 돌 던지기 / 돌진 후 벽에 부딪히면 기절. 체력 절반 이하에서 분노(빨라짐)
- 무기: 검(기본), 블래스터(원거리), 망치(느리고 강함) - 증강으로 획득, 무기 교체로 전환
- 증강: 스테이지 중간 보물상자와 보스 처치 시 카드 3장 중 선택 (체력, 공격력, 공속, 이속, 2단 점프, 대쉬 강화, 치명타, 흡혈, 방패, 가시 갑옷, 자석, 밟기 강화, 검기, 관통탄, 삼연발 등)
- 조작 감각: 코요테 타임, 점프 선입력, 가변 점프, 대쉬 중 무적(공중 1회)
- 설정: 난이도(쉬움/보통/어려움), 항상 달리기, 피해 숫자 표시

### 블록 낙하 스핀 규칙

- 회전은 SRS 벽차기 테이블을 사용하고, 180°는 SRS+ 방식 킥을 사용합니다.
- **T-스핀**: 회전으로 끝났고 T 중심 주변 4모서리 중 3개 이상이 막혀 있으면 인정. 앞쪽 두 모서리가 막혀 있지 않으면 **미니** (단, 마지막 킥으로 들어간 경우는 정식 T-스핀)
- **올스핀 (J/L/S/Z/I)**: 회전으로 끝났고 좌·우·위 어느 쪽으로도 움직일 수 없으면 인정
- 점수(×레벨): 일반 100/300/500/800, 스핀 400(0줄)/800/1200/1600, 미니 100/200/400
- 쿼드나 스핀으로 줄을 연속으로 지우면 **Back-to-Back ×1.5**, 연속 클리어 시 콤보 +50×콤보

게임별 TOP 5 기록이 게임오버 화면에 표시됩니다 (`localStorage`).

## 앱으로 설치 (PWA)

안드로이드 Chrome은 목록 페이지의 "앱으로 설치" 버튼, iPhone은 Safari 공유 → "홈 화면에 추가".
한 번 열어두면 오프라인에서도 실행됩니다 (`sw.js`, 네트워크 우선 + 캐시 대비).

## 다른 사이트에 붙이는 방법

### 1) iframe (가장 간단)

```html
<iframe src="https://imkr3.github.io/miniigame/embed.html?game=blocks"
        style="width:100%;max-width:480px;aspect-ratio:9/16;border:0" allow="autoplay"></iframe>
<script>
  window.addEventListener('message', (e) => {
    if (e.data?.source === 'miniigame' && e.data.type === 'gameover') {
      console.log(e.data.game, '점수', e.data.score);
    }
  });
  // 부모에서 제어: iframe.contentWindow.postMessage({ source: 'miniigame-host', command: 'pause' }, '*')
</script>
```

`embed.html` 파라미터: `game=<id>`, `controls=auto|always|never` (화면 버튼 표시)

### 2) 모듈로 직접 삽입

```html
<div id="game"></div>
<script type="module">
  import { mountGame } from '/miniigame/src/registry.js';
  const game = await mountGame('snake', document.getElementById('game'), {
    fit: false,          // true면 컨테이너 높이까지 꽉 채움 (컨테이너에 높이 지정 필요)
    controls: 'auto',    // 화면 버튼: auto(터치 기기만) | always | never
    onExit: () => {},    // 지정하면 HUD에 '←' 나가기 버튼 표시
    onEvent: (e) => console.log(e), // { type: 'start'|'pause'|'resume'|'gameover', game, score, best? }
  });
  // game.pause(); game.resume(); game.restart(); game.destroy();
</script>
```

## 구조

```
src/
  engine.js     공통 엔진 (GameBase: 화면 맞춤·HUD·오버레이·루프·입력·화면 버튼·이펙트·최고점수)
  sfx.js        효과음 (WebAudio로 생성, 음원 파일 없음)
  registry.js   게임 목록 + mountGame()
  games/*.js    게임별 구현
index.html      게임 목록 페이지
manifest.webmanifest, sw.js, icons/   PWA(설치·오프라인)
embed.html      iframe용 단일 게임 페이지
```

### 새 게임 추가

1. `src/games/xxx.js`에서 `GameBase`를 상속하고 `static meta`, `init()`, `update(dt)`, `draw(ctx)`, `onAction(action)`을 구현
   - 모바일 버튼 배치는 `static pad`, 터치 제스처는 `static gestures`
   - 기본 키는 `static bindings` (`{ 액션: ['KeyCode', ...] }`), 설정창 이름은 `static actionLabels`
   - 설정 항목은 `static settings` (range / toggle / select), 값은 `this.cfg.<id>`로 읽기
   - 이펙트: `this.burst()`, `this.floatText()`, `this.shake()`, 소리: `this.sound(name)`
2. `src/registry.js`의 `GAMES`에 한 줄 추가

입력은 엔진이 `left/right/up/down/action/pause`로 통일해서 넘겨줍니다 (키보드: 방향키·WASD·Space·P/Esc, 터치: 스와이프·탭).
최고 점수는 `localStorage`의 `miniigame:<id>:best`에 저장됩니다.

## 배포 (GitHub Pages)

`.github/workflows/pages.yml`이 push 때마다 사이트를 배포합니다.
처음 한 번은 저장소 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 설정해야 합니다.
