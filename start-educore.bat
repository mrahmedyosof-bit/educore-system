@echo off
title EduCore CMS
cd /d "%~dp0app"

echo ============================================
echo   Starting EduCore CMS ...
echo   Browser will open automatically
echo   Login with your admin account
echo   Press CTRL+C here to stop the server
echo ============================================
echo.

start "" cmd /c "timeout /t 8 >nul & start http://localhost:3000"

call npm run dev

pause
