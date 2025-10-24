@echo off
REM LootTableExtreme - Install Script Launcher
REM This batch file runs the PowerShell install script with proper permissions

echo Starting LootTableExtreme installer...
echo.

REM Check if running as administrator
net session >nul 2>&1
if %errorLevel% == 0 (
    echo Running with administrator privileges...
    echo.
    powershell.exe -ExecutionPolicy Bypass -File "%~dp0install.ps1"
) else (
    echo Requesting administrator privileges...
    echo.
    powershell.exe -Command "Start-Process powershell.exe -ArgumentList '-ExecutionPolicy Bypass -File \"%~dp0install.ps1\"' -Verb RunAs"
)
