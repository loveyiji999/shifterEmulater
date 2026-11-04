@echo off
setlocal
cd /d "%~dp0..\..\.."
for %%F in (desktop3d\tests\validate-*.mjs) do (
  node "%%F"
  if errorlevel 1 exit /b 1
)
for %%F in (tests\test_v*.py) do (
  echo ==== %%~nxF ====
  python -m unittest discover -s archive/legacy/tests -p "%%~nxF" -v
  if errorlevel 1 exit /b 1
)
echo Source and legacy iframe QA finished. Browser/WebGL checks: python archive\legacy\browser-tests\browser_v1893.py
