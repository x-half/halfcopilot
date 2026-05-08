@echo off
echo.
echo ========================================
echo   HalfCopilot CLI Installer
echo ========================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: Node.js is not installed.
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo Node.js version:
node --version
echo.

REM Get the script directory
set SCRIPT_DIR=%~dp0

echo Installing HalfCopilot CLI...
echo.

REM Create a batch file in a directory that's in PATH
set INSTALL_DIR=%USERPROFILE%\halfcop
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

REM Create the main batch file
(
echo @echo off
echo node "%SCRIPT_DIR%packages\cli\dist\halfcop.js" %%*
) > "%INSTALL_DIR%\halfcop.cmd"

echo Created: %INSTALL_DIR%\halfcop.cmd
echo.

REM Add to PATH if not already there
echo Checking PATH...
echo %PATH% | findstr /C:"%INSTALL_DIR%" >nul
if %errorlevel% neq 0 (
    echo Adding %INSTALL_DIR% to PATH...
    setx PATH "%PATH%;%INSTALL_DIR%"
    echo.
    echo IMPORTANT: Please restart your terminal for PATH changes to take effect.
    echo.
) else (
    echo %INSTALL_DIR% is already in PATH.
)

echo.
echo ========================================
echo   Installation Complete!
echo ========================================
echo.
echo You can now use the following commands:
echo.
echo   halfcop                  - Start interactive chat
echo   halfcop chat             - Start interactive chat
echo   halfcop run "prompt"     - Run single prompt
echo   halfcop doctor           - Check configuration
echo   halfcop skills           - List available skills
echo.
echo NOTE: Please restart your terminal if this is a new installation.
echo.
pause
