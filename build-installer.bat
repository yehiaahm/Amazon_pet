@echo off
setlocal EnableExtensions
title Amazon Pet ERP - Build Installer

REM ============================================================
REM  Amazon Pet ERP - Full Build and Installer Pipeline
REM  ASCII-only, CRLF. Electron packs OUTSIDE the workspace so
REM  Cursor cannot lock app.asar during rebuilds.
REM ============================================================

set "PROJECT_ROOT=%~dp0"
if "%PROJECT_ROOT:~-1%"=="\" set "PROJECT_ROOT=%PROJECT_ROOT:~0,-1%"
set "DESKTOP_DIR=%PROJECT_ROOT%\desktop"
set "INNO_COMPILER=%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe"

REM Electron output lives outside the Cursor workspace (avoids file locks).
set "PACK_ROOT=%LOCALAPPDATA%\AmazonPetERP\electron-pack"

echo.
echo ============================================================
echo        Amazon Pet ERP - Full Build and Installer Pipeline
echo ============================================================
echo.

REM -------------------- CHECK PREREQUISITES --------------------
echo [CHECK] Verifying required tools...

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found. Please install Node.js first.
    goto :fail
)
echo   [OK] Node.js found

where mvn >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Maven mvn not found. Please add Maven to PATH.
    goto :fail
)
echo   [OK] Maven found

if not exist "%INNO_COMPILER%" goto :no_inno
echo   [OK] Inno Setup 6 found
goto :after_inno_check

:no_inno
echo [ERROR] Inno Setup 6 not found at:
echo         %INNO_COMPILER%
echo.
echo Please download and install Inno Setup 6 from:
echo   https://jrsoftware.org/isdl.php
goto :fail

:after_inno_check
if exist "%DESKTOP_DIR%\icon.ico" goto :after_icon_check
echo [WARN] icon.ico not found in desktop folder.
echo        A default icon will be used. You can add your own icon.ico later.
echo        Continuing without custom icon...
echo.

:after_icon_check

REM -------------------- STEP 1: FRONTEND --------------------
echo.
echo ============================================================
echo  STEP 1 - Building React Frontend
echo ============================================================
cd /d "%PROJECT_ROOT%"
call npm run build
if errorlevel 1 (
    echo [ERROR] React build failed. Check errors above.
    goto :fail
)
echo   [OK] React frontend built successfully.

REM -------------------- STEP 2: COPY FRONTEND --------------------
echo.
echo ============================================================
echo  STEP 2 - Copying React build into Spring Boot resources
echo ============================================================
set "BACKEND_STATIC=%PROJECT_ROOT%\animasys-backend\src\main\resources\static"
if exist "%BACKEND_STATIC%" rd /s /q "%BACKEND_STATIC%"
mkdir "%BACKEND_STATIC%"

if exist "%PROJECT_ROOT%\dist\" (
    xcopy /E /Y /Q "%PROJECT_ROOT%\dist\*" "%BACKEND_STATIC%\"
) else (
    echo [INFO] dist\ not found - Vite already wrote into backend static.
)
echo   [OK] Frontend files merged into backend resources.

REM -------------------- STEP 3: BACKEND JAR --------------------
echo.
echo ============================================================
echo  STEP 3 - Building Spring Boot JAR
echo ============================================================
cd /d "%PROJECT_ROOT%\animasys-backend"
call mvn clean package -DskipTests -q
if errorlevel 1 (
    echo [ERROR] Maven build failed. Check errors above.
    goto :fail
)
echo   [OK] Spring Boot JAR compiled successfully.

if not exist "%DESKTOP_DIR%\bin" mkdir "%DESKTOP_DIR%\bin"
set "JAR_SRC=%PROJECT_ROOT%\animasys-backend\target\animasys-backend-1.0.0.jar"
set "JAR_DEST=%DESKTOP_DIR%\bin\animasys-backend-1.0.0.jar"
copy /Y "%JAR_SRC%" "%JAR_DEST%" >nul
if errorlevel 1 (
    echo [ERROR] Failed to copy JAR to desktop\bin\
    goto :fail
)
echo   [OK] JAR copied to desktop\bin\

REM -------------------- STEP 4: ELECTRON --------------------
echo.
echo ============================================================
echo  STEP 4 - Packaging Electron Application
echo ============================================================
cd /d "%DESKTOP_DIR%"

echo [CLEAN] Stopping any running Amazon Pet / Electron instances...
taskkill /F /IM "Amazon Pet.exe" >nul 2>&1
taskkill /F /IM electron.exe >nul 2>&1

if not exist "%PACK_ROOT%" mkdir "%PACK_ROOT%"

REM Fresh unique output dir every run - never delete a locked folder.
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "PACK_TS=%%i"
set "PACK_DIR=%PACK_ROOT%\build-%PACK_TS%"
mkdir "%PACK_DIR%"
echo [INFO] Electron output: %PACK_DIR%

call npx --yes electron-builder --config.directories.output="%PACK_DIR%"
if errorlevel 1 (
    echo [ERROR] Electron build failed.
    goto :fail
)

set "WIN_UNPACKED=%PACK_DIR%\win-unpacked"
if not exist "%WIN_UNPACKED%\Amazon Pet.exe" (
    echo [ERROR] Packaged app not found at:
    echo         %WIN_UNPACKED%
    goto :fail
)
echo   [OK] Electron app packaged to:
echo        %WIN_UNPACKED%

REM -------------------- STEP 5: INNO SETUP --------------------
echo.
echo ============================================================
echo  STEP 5 - Compiling Inno Setup Installer
echo ============================================================
cd /d "%DESKTOP_DIR%"

set "ISS_FILE=setup.iss"
if exist "%DESKTOP_DIR%\icon.ico" goto :run_iscc

echo [INFO] No icon.ico - compiling with SetupIconFile disabled...
powershell -NoProfile -Command "$c=Get-Content -LiteralPath 'setup.iss'; $c=$c -replace '^SetupIconFile=icon.ico','; SetupIconFile=icon.ico'; Set-Content -LiteralPath 'setup.iss.tmp' -Value $c"
if errorlevel 1 (
    echo [ERROR] Failed to prepare temporary setup.iss.tmp
    goto :fail
)
set "ISS_FILE=setup.iss.tmp"

:run_iscc
REM Pass absolute PackDir so Inno reads win-unpacked from outside the repo.
"%INNO_COMPILER%" "/DPackDir=%PACK_DIR%" "%ISS_FILE%"
set "ISCC_EXIT=%ERRORLEVEL%"
if exist "setup.iss.tmp" del /q "setup.iss.tmp" >nul 2>&1

if "%ISCC_EXIT%"=="0" goto :success
echo [ERROR] Inno Setup compilation failed.
goto :fail

:success
echo.
echo ============================================================
echo  BUILD COMPLETE
echo ============================================================
echo.
echo  Installer file created at:
echo    %PROJECT_ROOT%\installer\AmazonPet_Setup_v1.0.0.exe
echo.
echo  Electron unpack dir used for this build:
echo    %WIN_UNPACKED%
echo.
echo  Next step - Generate a license key for your client:
echo    cd desktop
echo    node keygen.js
echo.
echo  The client will need to run the Activation Key on first launch.
echo.
pause
endlocal
exit /b 0

:fail
echo.
echo Build stopped due to an error.
pause
endlocal
exit /b 1