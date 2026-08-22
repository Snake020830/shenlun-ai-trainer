@echo off
setlocal
cd /d "%~dp0"

echo ============================================================
echo Shenlun AI Trainer - Local Frontend Verification
echo ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found.
  echo Install Node.js LTS, then run this file again.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm was not found.
  pause
  exit /b 1
)

if not exist node_modules (
  echo [1/3] Installing dependencies...
  call npm install --no-audit --no-fund
  if errorlevel 1 goto :failed
) else (
  echo [1/3] Dependencies already present.
)

echo.
echo [2/3] Running Vitest regression suite...
call npm test
if errorlevel 1 goto :failed

echo.
echo [3/3] Running TypeScript + Vite production build...
call npm run build
if errorlevel 1 goto :failed

echo.
echo ============================================================
echo [PASS] Frontend tests and production build both passed.
echo ============================================================
pause
exit /b 0

:failed
echo.
echo ============================================================
echo [FAIL] Local verification failed.
echo Please capture this entire window and send it to ChatGPT.
echo Do not delete files or reset the repository.
echo ============================================================
pause
exit /b 1
