@echo off
setlocal
cd /d "%~dp0..\..\desktop3d"
where node >nul 2>nul
if errorlevel 1 (echo Node.js 22+ or 20.19+ required. & pause & exit /b 1)
if not exist "node_modules\three\package.json" (
  call npm install --no-audit --no-fund
  if errorlevel 1 (pause & exit /b 1)
)
call npm run build
if errorlevel 1 (echo Web build failed. & pause & exit /b 1)
echo Done. Publish the contents of desktop3d\dist\ to a static HTTPS website.
pause
