@echo off
chcp 65001 >nul
if "%MSIL_API_KEY%"=="" echo [注意] MSIL_API_KEY が未設定です。
if "%MSIL_TIDE_QUERY_URL%"=="" echo [注意] MSIL_TIDE_QUERY_URL が未設定です。
call npm install
node server.js
pause
