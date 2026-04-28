@echo off
title Sun ^& Sun ERP
cd /d "%~dp0"

echo.
echo  Pulling latest updates...
git pull

echo.
echo  Installing packages...
npm install

echo.
echo  Starting app...
start http://localhost:5174
npm run dev
