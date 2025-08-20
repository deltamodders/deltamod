#!/bin/bash
# If editing on Windows, remember to run this command on WSL before committing and/or testing: "sed -i 's/\r//g' Run-Linux.sh"
sudo snap install 'dotnet-sdk' --classic

#Install node through docker

sudo apt install 'docker'

# Docker has specific installation instructions for each operating system.
# Please refer to the official documentation at https://docker.com/get-started/

# Pull the Node.js Docker image:
docker pull node:22-alpine

# Create a Node.js container and start a Shell session:
docker run -it --rm --entrypoint sh node:22-alpine

# Verify the Node.js version:
node -v # Should print "v22.18.0".

# Verify npm version:
npm -v # Should print "10.9.3".


#Install needed libraries

sudo apt install 'libnspr4'

sudo apt install 'libnss3'

#Install things needed to download and install GM3P

sudo apt install 'wget'

sudo apt-get install 'unzip'

sudo apt-get install 'xdelta3'

#Install GM3P

wget https://github.com/techy804/MassModPatcher/releases/download/v0.6.0-alpha1/GM3P.v0.6.0-alpha1.zip

unzip -f -o "./GM3P.v0.6.0-alpha1.zip" -d "./gm3p"

rm './GM3P.v0.6.0-alpha1.zip'

#Run GM3P Help command in order to trigger .NET SDK install

dotnet './gm3p/GM3P.dll' 'help'

#Install needed npm packages and run

npm --verbose install electron@37 --save-dev

npm install n 22

npm i

set DELTAMOD_ENV=dev

npm test