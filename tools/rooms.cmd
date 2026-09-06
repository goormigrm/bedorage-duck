@echo off
chcp 65001 >nul
cd /d "%~dp0.."
title 배도라지 덕 - 방 지키기 (닫으면 방이 사라집니다)
echo 방 지키기를 켭니다. 이 창을 닫거나 Ctrl+C 를 누르면 방이 사라집니다.
node tools\rooms.mjs
pause
