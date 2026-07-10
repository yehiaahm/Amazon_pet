@echo off
title AnimaSys ERP - Run All
echo ==========================================================
echo          AnimaSys ERP - Launching System Suite
echo ==========================================================
echo.

:: 1. Check if MySQL is listening on standard port 3306
echo [1/3] Checking MySQL Database connection on port 3306...
powershell -Command "Test-NetConnection -ComputerName localhost -Port 3306" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [WARNING] MySQL database does not seem to be running on port 3306.
    echo Attempting to start MySQL Windows Service...
    net start MySQL80 >nul 2>&1
    net start MySQL >nul 2>&1
    net start wampmysqld >nul 2>&1
    
    :: Wait a few seconds for database startup
    timeout /t 5 /nobreak >nul
) else (
    echo [SUCCESS] MySQL Database is online.
)

:: 2. Launch Spring Boot Backend in a new CMD window
echo [2/3] Starting Spring Boot Backend Server...
start "AnimaSys Backend Server" cmd /k "cd animasys-backend && mvn spring-boot:run"

:: 3. Launch React Vite Dev Server in a new CMD window
echo [3/3] Starting React Vite Dev Server...
start "AnimaSys Frontend UI" cmd /k "npm run dev"

echo.
echo ==========================================================
echo   System components launched successfully in separate windows!
echo.
echo   - Frontend: http://localhost:5173
echo   - Backend API: http://localhost:8080/api
echo   - Seed Credentials: Username "admin" / Password "admin"
echo ==========================================================
echo.
pause
