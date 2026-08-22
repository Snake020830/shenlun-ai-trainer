@echo off
setlocal
cd /d "%~dp0"

echo [Shenlun Trainer] Update and start preview

echo Checking Git...
where git >nul 2>nul
if errorlevel 1 (
  echo ERROR: Git is not installed or not in PATH.
  echo If you cloned with GitHub Desktop, use Fetch origin / Pull there, then double-click start-local-preview.cmd.
  pause
  exit /b 1
)

echo Checking current branch...
for /f "delims=" %%b in ('git branch --show-current') do set CURRENT_BRANCH=%%b
if /I not "%CURRENT_BRANCH%"=="feat/v0.1-product-shell" (
  echo Current branch is "%CURRENT_BRANCH%".
  echo Switching to feat/v0.1-product-shell...
  git checkout feat/v0.1-product-shell
  if errorlevel 1 goto :gitfailed
)

echo Pulling the latest preview code...
git pull --ff-only origin feat/v0.1-product-shell
if errorlevel 1 goto :gitfailed

if not exist node_modules (
  echo Installing dependencies for the first run...
  call npm install --no-audit --no-fund
  if errorlevel 1 goto :failed
) else (
  echo Refreshing dependencies...
  call npm install --no-audit --no-fund
  if errorlevel 1 goto :failed
)

call start-local-preview.cmd
exit /b %errorlevel%

:gitfailed
echo.
echo Git update failed. Do not use reset or force commands.
echo Open GitHub Desktop, check whether there are local changes, and send the screen/error to ChatGPT.
pause
exit /b 1

:failed
echo.
echo Update or preview failed. Copy the error above into ChatGPT for diagnosis.
pause
exit /b 1
