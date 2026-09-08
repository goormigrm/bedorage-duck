@echo off
setlocal
rem UTF-8 console so the script's Korean log lines are readable in this window.
chcp 65001 >nul
rem ASCII ONLY. Korean text breaks cmd line parsing (it reads the file by byte offset,
rem so UTF-8 multibyte chars desync the pointer and later lines get sliced). 2026-09-06, again 2026-09-08.
rem Also keep CRLF line endings - LF-only breaks parenthesised blocks.
pushd "%~dp0.."
title bedorage-duck rooms (close this window to stop)
echo === bedorage-duck room keeper ===
echo Close this window (or press Ctrl+C) to stop. Rooms disappear when stopped.
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] node.exe not found. Install Node.js 20+ and try again.
  popd
  pause
  exit /b 1
)
rem git pull without npm ci leaves playwright missing - install it instead of dying with a stack trace.
if not exist "node_modules\playwright\package.json" (
  echo [setup] playwright is missing. Installing dependencies... this runs only once.
  echo [setup] If a dev server is running, close it first - npm ci wipes node_modules.
  echo.
  call npm.cmd ci
  if errorlevel 1 (
    echo.
    echo [ERROR] npm ci failed. Close the dev server / editor and run "npm ci" yourself.
    popd
    pause
    exit /b 1
  )
  echo.
)
node "%~dp0rooms.mjs"
echo.
echo (room keeper exited)
popd
pause
