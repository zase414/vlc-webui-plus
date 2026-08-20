@echo off
setlocal EnableDelayedExpansion
title VLC Web UI Plus - Installer

:: --- elevate ---
net session >nul 2>&1
if errorlevel 1 (
    echo Requesting administrator rights...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -ArgumentList '%*' -Verb RunAs"
    exit /b
)

set "SRC=%~dp0package\lua\http\mod"
set "BKP=%~dp0backup"

:: --- locate VLC ---
set "VLC=%~1"
if not defined VLC for /f "tokens=2,*" %%A in ('reg query "HKLM\SOFTWARE\VideoLAN\VLC" /v InstallDir 2^>nul ^| find "InstallDir"') do set "VLC=%%B"
if not defined VLC for /f "tokens=2,*" %%A in ('reg query "HKLM\SOFTWARE\WOW6432Node\VideoLAN\VLC" /v InstallDir 2^>nul ^| find "InstallDir"') do set "VLC=%%B"
if not defined VLC set "VLC=%ProgramFiles%\VideoLAN\VLC"
if not exist "%VLC%\vlc.exe" set "VLC=%ProgramFiles(x86)%\VideoLAN\VLC"

if not exist "%VLC%\vlc.exe" (
    echo [ERROR] VLC not found. Pass the folder as an argument:
    echo         install.bat "C:\Program Files\VideoLAN\VLC"
    pause & exit /b 1
)
if not exist "%VLC%\lua\http\index.html" (
    echo [ERROR] "%VLC%\lua\http" does not look like a VLC web interface folder.
    pause & exit /b 1
)
if not exist "%SRC%\index.html" (
    echo [ERROR] Package files missing at "%SRC%".
    pause & exit /b 1
)

echo.
echo   VLC folder : %VLC%
echo   Installing : lua\http\mod
echo.

:: --- backup the untouched lua tree once per run ---
if not exist "%BKP%" mkdir "%BKP%"
for /f %%T in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "TS=%%T"
echo Backing up "%VLC%\lua" ...
powershell -NoProfile -Command "Compress-Archive -Path '%VLC%\lua\*' -DestinationPath '%BKP%\vlc-lua-%TS%.zip' -Force"
if errorlevel 1 (
    echo [ERROR] Backup failed - nothing was installed.
    pause & exit /b 1
)
echo Backup written to %BKP%\vlc-lua-%TS%.zip

:: --- install ---
if exist "%VLC%\lua\http\mod" rmdir /s /q "%VLC%\lua\http\mod"
mkdir "%VLC%\lua\http\mod"
xcopy /e /i /y /q "%SRC%\*" "%VLC%\lua\http\mod\" >nul
if errorlevel 1 (
    echo [ERROR] Copy failed.
    pause & exit /b 1
)

:: remember where we installed, so uninstall.bat needs no arguments
> "%~dp0.installed" echo %VLC%

echo.
echo   Installed.
echo.
echo   Next steps
echo   ----------
echo   1. In VLC:  Tools ^> Preferences ^> Show settings: All ^> Interface ^> Main interfaces
echo      Tick "Web", then under Main interfaces ^> Lua set a Lua HTTP password.
echo   2. Restart VLC ^(new files are only picked up at interface start^).
echo   3. Open  http://localhost:8080/mod/
echo      Leave the user name empty, use the password you set.
echo.
echo   The stock interface at http://localhost:8080/ is untouched.
echo.
pause
