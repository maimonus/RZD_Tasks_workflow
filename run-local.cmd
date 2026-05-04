@echo off
REM Скрипт для запуска локального окружения на Windows

setlocal enabledelayedexpansion

echo.
echo === Finance Workflow System - Local Development ===
echo.

set PROJECT_ROOT=%~dp0
set BACKEND_DIR=%PROJECT_ROOT%backend
set FRONTEND_DIR=%PROJECT_ROOT%frontend

echo Starting backend...
start "" cmd /k "cd /d %BACKEND_DIR% && .venv\Scripts\python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"

echo Waiting for backend to start...
timeout /t 5 /nobreak

echo Starting frontend...
start "" cmd /k "cd /d %FRONTEND_DIR% && npm run dev"

echo.
echo Application is starting...
echo Backend:  http://localhost:8000
echo Frontend: http://localhost:3000
echo.
echo Press any key to close this window...
pause >nul
