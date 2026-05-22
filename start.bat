@echo off
title Sun & Sun ERP
cd /d "%~dp0"

echo.
echo  Stopping old processes...
taskkill /F /IM node.exe >nul 2>&1

echo.
echo  Pulling latest updates...
git pull

echo.
echo  Installing packages...
npm install

echo.
echo  Building frontend...
npm run build

echo.
echo  Starting server...
start http://localhost:3001
node server.js

echo.
echo  Server stopped. Press any key to close.
pause
