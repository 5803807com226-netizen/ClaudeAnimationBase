@echo off
rem Motion Studio with a console window (shows the server log). Without a window: double-click AnimationStudio.vbs
cd /d "%~dp0"
where node >NUL 2>NUL || (echo Node.js is not installed: https://nodejs.org & pause & exit /b 1)
if not exist node_modules\@anthropic-ai\sdk (echo Installing packages... & call npm install)
node studio\server.mjs
pause
