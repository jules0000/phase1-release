# Neural Learning Platform - Development Server Startup
Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host "  NEURAL LEARNING PLATFORM - Development Environment" -ForegroundColor Cyan
Write-Host "========================================================`n" -ForegroundColor Cyan

# Set environment variables for backend
$env:DATABASE_TYPE = "sqlite"
$env:SECRET_KEY = "dev-key-change-in-production-12345"
$env:JWT_SECRET_KEY = "jwt-dev-key-change-in-production-67890"
$env:DEBUG = "true"
$env:CORS_ORIGINS = "http://localhost:3000,http://localhost:5173,http://localhost:8084"

Write-Host " Environment configured for SQLite development" -ForegroundColor Green

# Start Backend Server
Write-Host "`n Starting Backend Server..." -ForegroundColor Yellow
$backendPath = Join-Path $PSScriptRoot "backend"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$backendPath'; `$env:DATABASE_TYPE='sqlite'; `$env:SECRET_KEY='dev-key-change-in-production-12345'; `$env:JWT_SECRET_KEY='jwt-dev-key-change-in-production-67890'; `$env:DEBUG='true'; `$env:CORS_ORIGINS='http://localhost:3000,http://localhost:5173,http://localhost:8084'; python wsgi.py" -PassThru | Out-Null

# Wait for backend to start
Write-Host " Waiting for backend to initialize..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Start Frontend Server
Write-Host "`n Starting Frontend Server..." -ForegroundColor Yellow
$frontendPath = Join-Path $PSScriptRoot "frontend\client"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$frontendPath'; npm run dev" -PassThru | Out-Null

# Wait for frontend to start
Write-Host " Waiting for frontend to initialize..." -ForegroundColor Yellow
Start-Sleep -Seconds 8

# Display server information
Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host "   SERVERS STARTED SUCCESSFULLY!" -ForegroundColor Green
Write-Host "========================================================`n" -ForegroundColor Cyan

Write-Host "📍 Backend Server:" -ForegroundColor Yellow
Write-Host "   🌐 Main: http://localhost:5000" -ForegroundColor White
Write-Host "    API Docs: http://localhost:5000/v1/docs" -ForegroundColor White
Write-Host "   🔍 Health: http://localhost:5000/api/v1/health" -ForegroundColor White

Write-Host "`n📍 Frontend Server:" -ForegroundColor Yellow
Write-Host "   🌐 Main: http://localhost:5173" -ForegroundColor White

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host " Ready for testing! Open your browser to:" -ForegroundColor Green
Write-Host "   👉 http://localhost:5173" -ForegroundColor Cyan -NoNewline
Write-Host " (Frontend)" -ForegroundColor White
Write-Host "========================================================`n" -ForegroundColor Cyan

Write-Host " To stop servers: Close the PowerShell windows or use Ctrl+C" -ForegroundColor Gray
Write-Host " Check server logs in the separate PowerShell windows`n" -ForegroundColor Gray

# Keep script window open
Write-Host "Press any key to close this window..." -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

