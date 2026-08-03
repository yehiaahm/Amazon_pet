@echo off
REM Local-only launcher. Do not commit real passwords.
cd /d C:\projectes\Amazon_pet\animasys-backend

:: Ensure .env exists
if not exist ".env" (
  echo [INFO] Copying .env.example to .env...
  copy ".env.example" ".env" >nul
)

:: Parse and set env variables from .env
for /f "usebackq tokens=1* delims==" %%i in (".env") do (
  if not "%%i"=="" if not "%%j"=="" (
    echo %%i | findstr /b /c:"#" >nul
    if errorlevel 1 (
      set "%%i=%%j"
    )
  )
)

set "SPRING_DATASOURCE_PASSWORD=%~1"
set "ALLOW_H2_FALLBACK=false"
if "%SPRING_DATASOURCE_PASSWORD%"=="" (
  echo Usage: start-backend.cmd YOUR_MYSQL_PASSWORD
  exit /b 1
)
mvn -DskipTests spring-boot:run
