@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "PORT=%~1"
if "%PORT%"=="" set "PORT=5050"

set "PY_CMD="
call :pick "py -3"
call :pick "python"
call :pick "python3"

if not defined PY_CMD call :scan "%LOCALAPPDATA%\Programs\Python"
if not defined PY_CMD call :scan "%LOCALAPPDATA%\Python"
if not defined PY_CMD call :scan "%ProgramFiles%\Python314"
if not defined PY_CMD call :scan "%ProgramFiles%\Python313"
if not defined PY_CMD call :scan "%ProgramFiles%\Python312"
if not defined PY_CMD call :scan "C:\Python314"
if not defined PY_CMD call :scan "C:\Python313"
if not defined PY_CMD call :scan "C:\Python312"

if not defined PY_CMD goto :nopy

set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8

%PY_CMD% -c "import flask" >/dev/null 2>&1
if not errorlevel 1 goto :run

echo Installing Flask (one time)...
%PY_CMD% -m pip install --disable-pip-version-check -q -r requirements.txt
if errorlevel 1 goto :noflask

:run
%PY_CMD% app.py --port %PORT% --open
goto :eof

:nopy
echo.
echo Python 3 not found. Install it from https://www.python.org/downloads/
echo and tick "Add python.exe to PATH", then run this file again.
echo See README.md for details.
echo.
pause
goto :eof

:noflask
echo.
echo Could not install Flask. Try manually:
echo     %PY_CMD% -m pip install -r requirements.txt
echo.
pause
goto :eof

rem --- subroutines ---------------------------------------------------------

rem :pick "<cmd>" - keep the first candidate that really runs Python 3.
rem Verified by execution on purpose: the Microsoft Store alias for "python"
rem exists on a clean system but opens the Store instead of an interpreter.
:pick
if defined PY_CMD goto :eof
%~1 -c "import sys; sys.exit(0 if sys.version_info[0] == 3 else 1)" >/dev/null 2>&1
if errorlevel 1 goto :eof
set "PY_CMD=%~1"
goto :eof

rem :scan "<dir>" - look for python.exe in the dir and one level down.
:scan
if defined PY_CMD goto :eof
if not exist "%~1" goto :eof
if exist "%~1\python.exe" call :pick "%~1\python.exe"
for /d %%D in ("%~1\*") do if exist "%%~D\python.exe" call :pick "%%~D\python.exe"
goto :eof
