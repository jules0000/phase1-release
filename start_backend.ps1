# Neural Backend Server - PowerShell Script
Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "   NEURAL BACKEND SERVER" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""

# Change to backend directory
Set-Location backend

# Activate virtual environment
if (-not (Test-Path "venv\Scripts\Activate.ps1")) {
    Write-Host "Creating virtual environment..." -ForegroundColor Yellow
    python -m venv venv
}

Write-Host "Activating virtual environment..." -ForegroundColor Yellow
& .\venv\Scripts\Activate.ps1

# Install pymysql if needed
Write-Host "Checking dependencies..." -ForegroundColor Yellow
pip install -q pymysql

# Set environment variables
# MySQL is REQUIRED - SQLite is not supported
# If DATABASE_URL is not set, use default MySQL connection
if (-not $env:DATABASE_URL) {
    $env:DATABASE_URL = "mysql+pymysql://root@127.0.0.1:3306/neural?charset=utf8mb4"
    Write-Host "Using default MySQL connection (set DATABASE_URL to override)" -ForegroundColor Yellow
} else {
    Write-Host "Using DATABASE_URL from environment" -ForegroundColor Green
}

$env:SECRET_KEY = "dev-key-change-in-production-12345"
$env:JWT_SECRET_KEY = "jwt-dev-key-change-in-production-67890"
$env:DEBUG = "true"
$env:CORS_ORIGINS = "http://localhost:3000,http://localhost:5173,http://localhost:8084,http://localhost:8085,http://localhost:8086"
$env:FLASK_ENV = "development"

Write-Host ""
Write-Host "Starting Flask server on port 8085..." -ForegroundColor Green
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Backend will run on: http://localhost:8085" -ForegroundColor Cyan
Write-Host "API Docs: http://localhost:8085/v1/docs" -ForegroundColor Cyan
Write-Host "Health Check: http://localhost:8085/api/v1/health" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Login with: admin@neuralai.com / Admin123!@#" -ForegroundColor Yellow
Write-Host ""

# Start the server
python wsgi.py
