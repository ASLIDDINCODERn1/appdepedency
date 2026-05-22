@echo off
chcp 65001 >nul
title Morphological POS tagging - Server

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║   MORPHOLOGICAL POS TAGGING - Backend Server   ║
echo  ╚══════════════════════════════════════════╝
echo.

:: Python tekshirish
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  [XATO] Python topilmadi!
    echo  https://python.org dan Python 3.11 yuklab oling
    pause
    exit /b 1
)

:: .env faylidan GROQ_API_KEY ni o'qish
if exist "%~dp0.env" (
    for /f "tokens=1,2 delims==" %%a in (%~dp0.env) do (
        if "%%a"=="GROQ_API_KEY" set "GROQ_API_KEY=%%b"
    )
    echo  [OK]  .env fayl topildi, Groq API key yuklandi
) else (
    echo  [OGOHLANTIRISH] .env fayl topilmadi
    echo  .env faylini yarating: GROQ_API_KEY=gsk_...
)

:: requirements o'rnatish
echo  [1/2] Kerakli kutubxonalar tekshirilmoqda...
pip install fastapi uvicorn groq openpyxl python-multipart --quiet
echo  [OK]  Kutubxonalar tayyor

:: Tarmoq IP manzilini topish
echo  [2/2] Server ishga tushirilmoqda...
echo.

for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4" ^| findstr /v "127.0.0.1"') do (
    set "LOCAL_IP=%%a"
    goto :found_ip
)
:found_ip
set "LOCAL_IP=%LOCAL_IP: =%"

echo  ┌──────────────────────────────────────────┐
echo  │  Brauzerda oching:                        │
echo  │                                           │
echo  │  Lokal:   http://localhost:8000           │
echo  │  Tarmoq:  http://%LOCAL_IP%:8000          │
echo  │                                           │
echo  │  (Ctrl+C — to'xtatish)                    │
echo  └──────────────────────────────────────────┘
echo.

:: Server ishga tushirish
cd /d "%~dp0"
python server.py

pause
