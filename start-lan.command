#!/bin/bash
# 맥: 더블클릭하면 같은 와이파이용 미니게임 서버가 켜짐 (Node.js 필요)
cd "$(dirname "$0")"
if ! command -v node >/dev/null; then echo "Node.js 가 필요해요. https://nodejs.org 에서 설치한 뒤 다시 실행하세요."; read -r; exit 1; fi
[ -d node_modules/ws ] || npm install --omit=dev
node server/server.js
