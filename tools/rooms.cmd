@echo off
setlocal
cd /d "%~dp0.."
title bedorage-duck rooms (close this window to stop)
echo === bedorage-duck room keeper ===
echo Close this window (or press Ctrl+C) to stop. Rooms disappear when stopped.
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] node.exe not found. Install Node.js 20+ and try again.
  pause
  exit /b 1
)
node tools/rooms.mjs
echo.
echo (room keeper exited)
pause
