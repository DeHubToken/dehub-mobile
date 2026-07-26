@echo off
REM ===========================================================================
REM  DeHub Mobile - build the release APK
REM
REM  Just double-click this file.
REM
REM  It launches build-apk.local.ps1 with -ExecutionPolicy Bypass, because
REM  Windows blocks .ps1 scripts by default and would otherwise refuse to run
REM  it with "running scripts is disabled on this system".
REM ===========================================================================

cd /d "%~dp0"

echo.
echo  Building the DeHub release APK.
echo  This takes a while - leave this window open until it says DONE.
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-apk.local.ps1" %*

echo.
echo  ================= DONE =================
echo  Scroll up to see whether it succeeded and where the APK was written.
echo.
pause
