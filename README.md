<p align="center"><img width="200" alt="Deltamod" src="./web/gblogo-outline.png" /></p><p align="center"><b>A Deltarune mod manager, written in Node.js and Electron.</b> </p>

# Running Deltamod from source
## Script
We have a custom script that you can run to install dependencies. Use `Run.cmd` or `Run-Linux.sh` to run the program. If it doesn't find an installation of Node or GM3P, it will prompt the user to download them.
## Manual (not recommended)
If the script doesn't work, follow these steps:
- Download Node.js [here](https://nodejs.org/en).
- Download the latest GM3P version for your system from [here](https://gamebanana.com/tools/20063) and extract it to the `gm3p` folder. If it doesn't exist, create the folder.
- Now you can open your preferred command prompt and run `npm test` to run Deltamod.

<br />

# Building
## Note
<img width="128" align="left" src="https://github.com/user-attachments/assets/23c5d57c-56eb-4287-a0ec-14a4fca03d3d" />
To package Deltamod 1.2 and upwards using the reccomended project file, you will need an <b>InstallBuilder</b> license. <br /> <br />We understand that using commercial products may be an hassle to people wanting to build Deltamod installers, however we need to do so as the product is robust and fixes many of the hassles of the legacy installer tech. <br /><br /><i>We do not condone piracy of said software; Deltamod's owner has a regular copy that the team generously gave us free of charge, for use in open source development of Deltamod.</i><br /><br /> If you need to compile Deltamod, we encourage you download their 30-day free trial at https://installbuilder.com/ or to write to <a href="mailto:sales@installbuilder.com">sales@installbuilder.com</a> to request an open source license like we did.

<br />

## Process
- Open InstallBuilder Enterprise.
- Click `Open` and choose the `project.xml` file.
- In the same folder, download a .NET 8.0 installer and name it `dotnet.exe`.
- Also download a GitSCM installer and name it `git.exe`.
- Press Build to build your Deltamod installer.
- You can find the output in Documents > InstallBuilder > output.

## OS support
|               | Windows       | Native Linux  | Native macOS | _macOS/Linux_ (w/ CrossOver or Wine) | _All OSes_ (w/ Windows emulation) |
| ------------- |:-------------:|:-----:|:--------:|:--------------:|:-----------------:|
| Tested by devs | ✅ | ⚠️ Only one dev | ❌ | ❌ | ⚠️ Should work |
| Devs provide support | ✅ | ❌ | ❌ | ❌ | ✅ _(Specify if you are using emulation when reporting issues)_ |
| Usable | ✅ | ⚠️ Requires Proton | ❌ | ✅ | ✅ |
| Can _theoretically_ be exported to platform | ✅ | ✅ | ✅ |  ✅ | ✅ |
| DELTARUNE supports | ✅ | ⚠️ Supported using Proton | ✅ | ✅ | ✅ |
| Autoupdating | ✅ | ❌ | ❌ | ✅ | ✅ |

## License

All external libraries are property of their respective owners.<br />
This project is in no way affiliated with Deltarune, Fangamer, Toby Fox or Materia Collective.<br />
The main Deltamod software is licensed under the EUPL (revision 1.2). You can read the license [here](./LICENSE.txt).<br />
The standard is instead licensed using a modified EUPL license.
