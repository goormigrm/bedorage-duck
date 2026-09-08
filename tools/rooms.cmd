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
rem git pull 만 하고 npm ci 를 안 하면 playwright 가 없어서 모듈 오류로 죽는다.
rem 스택 트레이스 대신 여기서 알아서 깐다 (2026-09-08)
if not exist "node_modules\playwright\package.json" (
  echo [setup] playwright is missing. Installing dependencies... this runs only once.
  echo [setup] If a dev server is running, close it first - npm ci wipes node_modules.
  echo.
  call npm.cmd ci
  if errorlevel 1 (
    echo.
    echo [ERROR] npm ci failed. Close the dev server / editor and run "npm ci" yourself.
    pause
    exit /b 1
  )
  echo.
)
node tools/rooms.mjs
echo.
echo (room keeper exited)
pause
