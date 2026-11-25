@echo off
cd /d "%~dp0"
node --version
node src\server.js
pause
