@echo off

for /f "usebackq delims=" %%a in (`powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; $r=[System.Windows.Forms.MessageBox]::Show('Are you SURE you want to delete Deltamod installations from your computer?','Confirm',[System.Windows.Forms.MessageBoxButtons]::YesNo,[System.Windows.Forms.MessageBoxIcon]::Warning); Write-Output $r"`) do set "ANS=%%a"

if /I "%ANS%"=="Yes" (
    npx electron . ---initialize_deltamod
    cls
    echo Deltamod installations have been erased from this PC.
    pause
) else (
    echo Operation cancelled.
)

exit /b 0