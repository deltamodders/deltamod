@echo off
(where GM3P.exe)>nul 2>&1
if errorlevel 1 (
	echo Did not find GM3P installed. Would you like to install it (and install or update Node while we're at it)?
	:inputLoop
	echo Enter y for yes:
	set /p installScript = 
	if not "%installScript%" neq "y" goto runDELTA

	echo starting Install Script.
	powershell.exe -ExecutionPolicy Unrestricted -Command ". '.\Install-Build-Dependencies.ps1'"
)
:runDELTA
set DELTAMOD_ENV=dev
npm test
pause