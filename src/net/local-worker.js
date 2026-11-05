// 로컬 테스트 서버: 같은 브라우저의 여러 탭끼리 멀티플레이 (실제 서버 없이)
// SharedWorker 로 실행되어 server-core.js 를 그대로 사용한다.
import { RoomServer } from './server-core.js';

const rooms = new RoomServer();
self.onconnect = (e) => {
  const port = e.ports[0];
  const conn = rooms.connect((obj) => port.postMessage(obj));
  port.onmessage = (ev) => {
    if (ev.data === '__close') conn.close();
    else conn.message(ev.data);
  };
  port.start();
};
