@echo off
setlocal
cd /d "%~dp0..\..\.."
cd desktop3d
call npm run qa:all || exit /b 1
cd ..
node desktop3d\tests\validate-road-v2.mjs --stress || exit /b 1
python archive\legacy\browser-tests\browser_v190_core.py || exit /b 1
python -m unittest discover -s archive/legacy/tests -p "test_v*.py" || exit /b 1
echo PASS: v1.9.0 unit and browser physics core tests. Real Rapier WebGL pending.
