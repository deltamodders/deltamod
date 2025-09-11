# first install DeltaMOD dependiencies
winget install OpenJS.Electron.37
winget install OpenJS.NodeJS.LTS
# then install GM3P dependiencies
winget install Microsoft.DotNet.SDK.8
winget install CosimoMatteini.DRA
winget install Microsoft.Git
# then install GM3P
$GM3Pver = "v0.6.0-alpha2"
New-Item -Path ".\" -Name "gm3p" -ItemType Directory
dra download --output ".\" --tag $GM3Pver --select "GM3P.$GM3Pver.zip" techy804/MassModPatcher
Expand-Archive ".\GM3P.$GM3Pver.zip" -DestinationPath ".\gm3p" -Force
del ".\GM3P.$GM3Pver.zip"
# Lastly, install DeltaMOD's node modules
npm i
