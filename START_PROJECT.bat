@echo off
title Neural Learning Platform
color 0A

echo.
echo ============================================================
echo    NEURAL AI LEARNING PLATFORM - Local Development
echo ============================================================
echo.

REM Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found
    pause
    exit /b 1
)

REM Check Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found
    pause
    exit /b 1
)

echo [OK] Python and Node.js detected
echo.

REM Setup backend
cd backend
echo [1/4] Setting up backend...
if not exist "venv\" (
    echo Creating virtual environment...
    python -m venv venv
)

call venv\Scripts\activate.bat
pip install -q Flask Flask-SQLAlchemy Flask-JWT-Extended python-dotenv SQLAlchemy requests PyJWT
pip install -q Jinja2 werkzeug python-dateutil pytz
pip install -q openai anthropic
pip install -q stripe
cd ..

REM Setup frontend
cd frontend\client
echo.
echo [2/4] Setting up frontend...
if not exist "node_modules\" (
    call npm install
) else (
    echo Dependencies installed
)
cd ..\..

REM Start backend
echo.
echo [3/4] Starting backend server...
cd backend
for /f "delims=" %%i in ('cd') do set BACKEND_DIR=%%i
set DATABASE_URL=mysql+pymysql://root@127.0.0.1:3306/neural?charset=utf8mb4
set DATABASE_TYPE=mysql
set SECRET_KEY=dev-key-change-in-production-12345
set JWT_SECRET_KEY=jwt-dev-key-change-in-production-67890
set DEBUG=true
set CORS_ORIGINS=http://localhost:3000,http://localhost:5173,http://localhost:8084
set FLASK_ENV=development
start "Backend" cmd /k "cd /d %BACKEND_DIR% && venv\Scripts\activate.bat && set DATABASE_URL=%DATABASE_URL% && set FLASK_PORT=8085 && python wsgi.py"
cd ..

REM Start frontend
echo.
echo [4/4] Starting frontend server...
cd frontend\client
start "Frontend" cmd /k "npm run dev"
cd ..\..

echo.
echo ============================================================
echo    SERVERS STARTED!
echo ============================================================
echo.
echo Backend:  http://localhost:8085
echo Frontend: http://localhost:5173
echo.
pause

