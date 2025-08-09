# first install DeltaMOD dependiencies
winget install OpenJS.Electron.37
winget install OpenJS.NodeJS.LTS
# then install GM3P dependiencies
winget install Microsoft.DotNet.SDK.8
winget install CosimoMatteini.DRA
winget install Meld
# then install GM3P
New-Item -Path ".\" -Name "gm3p" -ItemType Directory
dra download --output ".\" --tag "v0.5.0" --select "GM3P.v0.5.0.zip" techy804/MassModPatcher
Expand-Archive ".\GM3P.v0.5.0.zip" -DestinationPath ".\gm3p" -Force
# Lastly, install DeltaMOD's node modules
npm i
