@echo off
setlocal

cd /d "%~dp0"

rem Prefer the Node.js installation used on this machine, then try common Windows locations.
set "NODE_HOME="
if exist "D:\Magic Tools\Node\node.exe" set "NODE_HOME=D:\Magic Tools\Node"
if not defined NODE_HOME if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_HOME=%ProgramFiles%\nodejs"
if not defined NODE_HOME if exist "%LocalAppData%\Programs\nodejs\node.exe" set "NODE_HOME=%LocalAppData%\Programs\nodejs"
if defined NODE_HOME set "PATH=%NODE_HOME%;%PATH%"

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js was not found in PATH.
  echo Please install Node.js LTS, then double-click this file again.
  echo Download: https://nodejs.org/
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm was not found. Please reinstall Node.js LTS.
  pause
  exit /b 1
)

if not exist "package.json" (
  echo [ERROR] package.json was not found. Please keep this file in the project root.
  pause
  exit /b 1
)

if not exist "node_modules\.bin\vite.cmd" (
  echo [INFO] Installing project dependencies for the first run...
  call npm install
  if errorlevel 1 (
    echo [ERROR] Dependency installation failed. Please check Node.js and network access.
    pause
    exit /b 1
  )
)

echo Starting Shenlun Trainer development server...

where cargo >nul 2>&1
if not errorlevel 1 (
  echo Rust/Cargo detected. Starting the native desktop version...
  start "Shenlun Trainer Desktop" /D "%~dp0" cmd /k "npm run app:dev"
  exit /b 0
)

echo Rust/Cargo was not found. Starting the browser version instead...
start "Shenlun Trainer Dev Server" /D "%~dp0" cmd /k "npm run dev"

timeout /t 3 /nobreak >nul
start "" "http://localhost:1420"

exit /b 0
