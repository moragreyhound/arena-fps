@echo off
REM Starts the Arena FPS server, Vite dev client, and Cloudflare tunnels.
cd /d "%~dp0"

echo Starting server on its own window...
start "Arena-FPS Server" cmd /k "node server.js"

echo Starting Cloudflare Tunnel for Node Server (Port 3000)...
start "Cloudflared - Server" cmd /k "cloudflared tunnel --url http://localhost:3000"

echo Starting Cloudflare Tunnel for Vite Client (Port 5173)...
start "Cloudflared - Vite" cmd /k "cloudflared tunnel --url http://localhost:5173"

echo Starting client (Vite dev server)...
npm run dev