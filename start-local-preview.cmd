@echo off
setlocal
cd /d "%~dp0"

echo [Shenlun Trainer] Local desktop preview

echo Checking Node.js...
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is not installed or not in PATH.
  echo Install Node.js LTS, reopen this window, then run this file again.
  pause
  exit /b 1
)

echo Checking Rust/Cargo...
where cargo >nul 2>nul
if errorlevel 1 (
  echo ERROR: Rust/Cargo is not installed or not in PATH.
  echo Tauri desktop preview requires Rust and Windows C++ build tools.
  echo You can still run the browser-only UI with: npm run ui:dev
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing frontend dependencies for the first run...
  call npm install --no-audit --no-fund
  if errorlevel 1 goto :failed
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
