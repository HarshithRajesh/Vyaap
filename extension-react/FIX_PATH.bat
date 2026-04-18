@echo off
echo ================================================
echo  FIX: Adding Node.js to System PATH
echo  Run this as Administrator!
echo ================================================
echo.

:: Detect Node.js location
set NODE_PATH=

if exist "C:\Program Files\nodejs\node.exe" (
    set NODE_PATH=C:\Program Files\nodejs
    goto :add_path
)
if exist "C:\Program Files (x86)\nodejs\node.exe" (
    set NODE_PATH=C:\Program Files (x86)\nodejs
    goto :add_path
)
if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" (
    set NODE_PATH=%LOCALAPPDATA%\Programs\nodejs
    goto :add_path
)

echo Node.js NOT found in standard locations.
echo Please install from: https://nodejs.org/en/download (LTS)
pause
exit /b 1

:add_path
echo Found Node.js at: %NODE_PATH%
echo.
echo Adding to System PATH...

:: Use setx to permanently add to PATH (requires admin for Machine scope)
setx /M PATH "%NODE_PATH%;%APPDATA%\npm;%PATH%"

echo.
echo [DONE] PATH updated. 
echo Please CLOSE and REOPEN any terminals/PowerShell windows.
echo Then run BUILD.bat
echo.
pause
