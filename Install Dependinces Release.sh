#!/bin/bash
# If editing on Windows, remember to run this command on WSL before committing and/or testing: "sed -i 's/\r//g' Run-Linux.sh"

#prompt user on if they want to install dependencies

goto() {
  label=$1
  cmd=$(sed -En "/^[[:space:]]*#[[:space:]]*$label:[[:space:]]*#/{:a;n;p;ba};" "$0")
  eval "$cmd"
  exit
}

prompt_for_install() {
    while true; do
        echo -n "Do you want to install or update dependencies? (y/n): "
        read -r response
        case "$response" in
            [Yy]* )
                echo "You selected Yes."
				goto installUbuntu
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

prompt_for_distro() {
    while true; do
        echo -n "What base does your distro use? ('U'buntu (includes Mint, PopOS, Linux Lite, and ChromeOS), 'M'acOS, 'A'rch (includes SteamOS), 'R'ed Hat, or 'C'ancel): "
        read -r response
        case "$response" in
            [Uu]* )
                echo "You selected Ubuntu-based (includes Mint, PopOS, Linux Lite, and ChromeOS)."
				goto installUbuntu
                return 0
                ;;
            [Mm]* )
                echo "You selected MacOS."
				goto installMac
                return 1
                ;;
            [Rr]*)
                echo "You selected Red Hat"
                goto installRedHat
                return 2
                ;;
            [Aa]* )
                echo "You selected Arch-based (includes SteamOS)"
                goto installArch
                return 3
                ;;
            [Cc]* )
                echo "You selected Cancel."
                break
                ;;
            * )
                echo "Invalid input or distro not supported."
                ;;
        esac
    done
}

prompt_for_install	

#install:#
#prompt_for_distro

#installUbuntu:#
		#Intall .NET SDK 8.0

		sudo snap install 'dotnet-sdk' --classic

		#Install node

		sudo apt install 'npm'

		sudo apt install 'nodejs'

		#Install needed libraries

		sudo apt install 'libnspr4'

		sudo apt install 'libnss3'

		#Install things needed for GM3P

		sudo apt-get install 'xdelta3'

		#Install needed npm packages

		npm install electron@37

        ./deltamod-1.1.0.AppImage --appimage-extract

		goto run

#run:#
        squashfs-root/deltamod