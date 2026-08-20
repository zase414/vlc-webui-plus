@echo off
setlocal EnableDelayedExpansion
title VLC Web UI Plus - Restore backup

net session >nul 2>&1
if errorlevel 1 (
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

set "VLC=%~1"
if not defined VLC if exist "%~dp0.installed" set /p VLC=<"%~dp0.installed"
if not defined VLC set "VLC=%ProgramFiles%\VideoLAN\VLC"
set "BKP=%~dp0backup"

if not exist "%VLC%\vlc.exe" (
    echo [ERROR] VLC not found at "%VLC%".
    pause & exit /b 1
)

:: newest backup zip wins
set "ZIP="
for /f "delims=" %%F in ('dir /b /o-d "%BKP%\vlc-lua-*.zip" 2^>nul') do if not defined ZIP set "ZIP=%BKP%\%%F"
if not defined ZIP (
    echo [ERROR] No backup zip found in "%BKP%".
    pause & exit /b 1
)

echo This restores "%VLC%\lua" from:
echo   %ZIP%
echo Everything currently in that folder is replaced.
choice /c YN /m "Continue"
if errorlevel 2 exit /b 0

rmdir /s /q "%VLC%\lua"
mkdir "%VLC%\lua"
powershell -NoProfile -Command "Expand-Archive -Path '%ZIP%' -DestinationPath '%VLC%\lua' -Force"
if errorlevel 1 (
    echo [ERROR] Restore failed.
    pause & exit /b 1
)
if exist "%~dp0.installed" del "%~dp0.installed"

echo.
echo   Restored. Restart VLC.
echo.
pause
