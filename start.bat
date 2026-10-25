@echo off
REM Starts the Arena FPS server and the Vite dev client (LAN play).
REM Server runs in its own window; the client runs here. Close/CTRL-C to stop both.
cd /d "%~dp0"

echo Starting server on its own window...
start "Arena-FPS Server" cmd /k "node server.js"

echo Starting client (Vite dev server)...
npm run dev