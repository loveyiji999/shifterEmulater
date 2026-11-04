@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22+ or 20.19+ required for starting the local web server.
  pause
  exit /b 1
)
if not exist "node_modules\three\package.json" (
  echo [SHIFT LAB v1.9.7.1] Installing web dependencies for first launch...
  call npm install --no-audit --no-fund
  if errorlevel 1 (echo Dependency installation failed. & pause & exit /b 1)
)
echo Launching single 3D browser page: http://127.0.0.1:5173/
call npm run dev:open
if errorlevel 1 pause
