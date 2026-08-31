@echo off
setlocal
cd /d "%~dp0"

echo [Shenlun Trainer] Local preview

echo Checking Node.js...
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is not installed or not in PATH.
  echo Install Node.js LTS, reopen this window, then run this file again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing frontend dependencies for the first run...
  call npm install --no-audit --no-fund
  if errorlevel 1 goto :failed
)

echo Checking Rust/Cargo...
where cargo >nul 2>nul
if errorlevel 1 (
  echo Rust/Cargo is not installed.
  echo Starting browser UI preview instead. This is enough for layout, material reading,
  echo answer-paper, timer and text-marking acceptance.
  echo Desktop-only SQLite/keyring/Tauri behavior requires Rust and is covered separately by CI.
  echo.
  call npm run ui:dev -- --open
  if errorlevel 1 goto :failed
  exit /b 0
)

echo Starting native Tauri development preview...
call npm run app:dev
if errorlevel 1 goto :failed
exit /b 0

:failed
echo.
echo Preview failed to start. Copy the error shown above into ChatGPT for diagnosis.
pause
exit /b 1
