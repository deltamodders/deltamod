#!/bin/bash
# If editing on Windows, remember to run this command on WSL before committing and/or testing: "sed -i 's/\r//g' Run-Linux.sh"

#prompt user on if they want to install dependencies

goto() {
  label=$1
  cmd=$(sed -En "/^[[:space:]]*#[[:space:]]*$label:[[:space:]]*#/{:a;n;p;ba};" "$0")
  eval "$cmd"
  exit
}

prompt_for_input() {
    while true; do
        echo -n "Do you want to install or update dependencies (note this will only work on Ubuntu-based systems)? (y/n): "
        read -r response
        case "$response" in
            [Yy]* )
                echo "You selected Yes."
				goto install
                return 0
                ;;
            [Nn]* )
                echo "You selected No."
				goto run
                return 1
                ;;
            [Cc]* )
                echo "You selected Cancel."
                return 2
                ;;
            * )
                echo "Invalid input. Please enter y or n."
                ;;
        esac
    done
}

prompt_for_input	

#install:#
		#Intall .NET SDK 8.0

		sudo snap install 'dotnet-sdk' --classic

		#Install node

		sudo apt install 'npm'

		sudo apt install 'nodejs'

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

		#Install needed npm packages and run

		npm --verbose install electron@37

		goto run

#run:#
		npm i

		npm test