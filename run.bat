@echo off
setlocal
cd /d "%~dp0"

echo Starting MedFlow...

where npm >nul 2>&1
if errorlevel 1 (
    echo Error: npm was not found. Install Node.js and try again.
    pause
    exit /b 1
)

if not exist "node_modules\" (
    echo Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo Dependency installation failed.
        pause
        exit /b 1
    )
)

curl.exe -fsS --max-time 2 http://localhost:5173/ >nul 2>&1
if errorlevel 1 (
    echo Starting Vite development server...
    start "MedFlow Dev Server" /D "%~dp0" cmd /k "node node_modules\vite\bin\vite.js --host 127.0.0.1 --port 5173 --strictPort"
    call :waitForServer
    if errorlevel 1 (
        echo MedFlow did not start on port 5173.
        echo Check the "MedFlow Dev Server" window for errors.
        pause
        exit /b 1
    )
)

echo Opening MedFlow in your browser...
start "" "http://localhost:5173/"
exit /b 0

:waitForServer
for /l %%I in (1,1,30) do (
    curl.exe -fsS --max-time 2 http://localhost:5173/ >nul 2>&1
    if not errorlevel 1 exit /b 0
    timeout /t 1 /nobreak >nul
)
exit /b 1
