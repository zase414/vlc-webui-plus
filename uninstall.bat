@echo off
setlocal EnableDelayedExpansion
title VLC Web UI Plus - Uninstaller

net session >nul 2>&1
if errorlevel 1 (
    echo Requesting administrator rights...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -ArgumentList '%*' -Verb RunAs"
    exit /b
)

set "VLC=%~1"
if not defined VLC if exist "%~dp0.installed" set /p VLC=<"%~dp0.installed"
if not defined VLC for /f "tokens=2,*" %%A in ('reg query "HKLM\SOFTWARE\VideoLAN\VLC" /v InstallDir 2^>nul ^| find "InstallDir"') do set "VLC=%%B"
if not defined VLC set "VLC=%ProgramFiles%\VideoLAN\VLC"

if not exist "%VLC%\lua\http\mod" (
    echo Nothing to remove - "%VLC%\lua\http\mod" does not exist.
    pause & exit /b 0
)

echo Removing "%VLC%\lua\http\mod" ...
rmdir /s /q "%VLC%\lua\http\mod"
if exist "%VLC%\lua\http\mod" (
    echo [ERROR] Could not remove the folder. Is VLC still running?
    pause & exit /b 1
)
if exist "%~dp0.installed" del "%~dp0.installed"

echo.
echo   Removed. The stock web interface is unchanged.
echo   Restart VLC to drop the /mod/ route.
echo.
pause
