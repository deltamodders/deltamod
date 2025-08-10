@echo off
if exist "C:\Program Files\nodejs\node.exe" (
	echo Found Node
) else (
	goto installScriptPrompt
)
if exist ".\gm3p\GM3P.exe" (
	echo Found GM3P
) else (
	goto installScriptPrompt
)
	:installScriptPrompt
	echo "Did not find GM3P or Node installed. Would you like to install them?"
	choice /c ny /n /m "Yes or No: "
	if %errorlevel% equ 1 goto runDELTA

	echo starting Install Script.
	powershell.exe -ExecutionPolicy Unrestricted -Command ". '.\Install-Build-Dependencies.ps1'"

:runDELTA
set DELTAMOD_ENV=dev
npm test
pause