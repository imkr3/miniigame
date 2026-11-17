@echo off
chcp 65001 >nul
title 미니게임 같은 와이파이 서버
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js 가 필요해요. https://nodejs.org 에서 설치한 뒤 다시 실행하세요. & pause & exit /b)
if not exist node_modules\ws call npm install --omit=dev
node server\server.js
pause
