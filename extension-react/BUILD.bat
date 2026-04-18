@echo off
echo ================================================
echo  Vyaap React Extension - Build Script
echo ================================================
echo.

:: Try common Node.js install locations
set NODE_PATH=

if exist "C:\Program Files\nodejs\npm.cmd" (
    set NODE_PATH=C:\Program Files\nodejs
    echo [OK] Found Node.js at: C:\Program Files\nodejs
    goto :found
)

if exist "C:\Program Files (x86)\nodejs\npm.cmd" (
    set NODE_PATH=C:\Program Files (x86)\nodejs
    echo [OK] Found Node.js at: C:\Program Files (x86)\nodejs
    goto :found
)

if exist "%LOCALAPPDATA%\Programs\nodejs\npm.cmd" (
    set NODE_PATH=%LOCALAPPDATA%\Programs\nodejs
    echo [OK] Found Node.js at: %LOCALAPPDATA%\Programs\nodejs
    goto :found
)

echo [ERROR] Could not find Node.js installation.
echo Please re-install Node.js from https://nodejs.org (LTS version)
echo and make sure to CHECK "Add to PATH" during installation.
pause
exit /b 1

:found
:: Add to PATH for this session
set PATH=%NODE_PATH%;%APPDATA%\npm;%PATH%

echo.
echo Node version:
"%NODE_PATH%\node.exe" --version

echo npm version:
"%NODE_PATH%\npm.cmd" --version

echo.
echo ================================================
echo  Step 1: Installing dependencies...
echo ================================================
cd /d "%~dp0"
call "%NODE_PATH%\npm.cmd" install
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] npm install failed!
    pause
    exit /b 1
)

echo.
echo ================================================
echo  Step 2: Building React app...
echo ================================================
call "%NODE_PATH%\npm.cmd" run build
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Build failed! Copy the error above and share it.
    pause
    exit /b 1
)

echo.
echo ================================================
echo  SUCCESS! Build complete.
echo  Output: extension\dashboard-react\
echo ================================================
echo.
echo You can now load the extension in Chrome:
echo   1. Go to chrome://extensions
echo   2. Enable Developer Mode
echo   3. Click "Load unpacked"
echo   4. Select the folder: extension\
echo.
pause
