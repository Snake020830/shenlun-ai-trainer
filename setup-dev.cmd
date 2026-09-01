@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo [Shenlun Trainer] Development setup
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js 24 was not found in PATH.
  echo Install Node.js 24 from https://nodejs.org/ and run this script again.
  pause
  exit /b 1
)

for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set NODE_MAJOR=%%v
if not "%NODE_MAJOR%"=="24" (
  echo [ERROR] Node.js 24 is required. Detected major version %NODE_MAJOR%.
  echo Install Node.js 24 from https://nodejs.org/ and run this script again.
  pause
  exit /b 1
)

if not exist package-lock.json (
  echo [ERROR] package-lock.json was not found. Run this script from the repository root.
  pause
  exit /b 1
)

echo Installing locked frontend dependencies with npm ci...
call npm ci --no-audit --no-fund
if errorlevel 1 (
  echo [ERROR] Dependency installation failed. Check your network and npm configuration.
  pause
  exit /b 1
)

where cargo >nul 2>nul
if errorlevel 1 (
  echo [INFO] Rust/Cargo not found. Browser preview is still available via npm run dev.
) else (
  echo [INFO] Rust/Cargo detected. Tauri desktop preview is available via npm run app:dev.
)

echo.
echo Setup complete. Run verify-local.cmd to execute tests and the production build.
pause
exit /b 0
