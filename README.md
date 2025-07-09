# Deltamod
Deltamod is an easy to use Deltamod mod patcher built in Electron and other languages (packaged in CLI tools).

## How to compile (advanced)
1) First of all, you will need the Node.js toolchain. Download it [here](https://nodejs.org/en/download).
2) Run ``node --version`` in the Command Prompt and check that it is installed correctly. The output should be something along the lines of ``v.1.2.3`` (any number after ``v.22.15.0`` works).
3) Now that you've done that, cd to your Deltamod source code and type ``npm i``. This should have created a folder named ``node_modules`` in the source code folder.
4) After the command finishes, you can now type ``npm test`` to open Deltamod, or use the shortcut file named ``Run.cmd``.

In order to enable the Chromium DevTools, please create an enviroment variable named ``DELTAMOD_ENV`` and set it to ``dev``.

If you don't know how to do that, then the DevTools may be just putting you at a security risk.

## License

All external libraries are property of their respective owners.
This project is in no way affiliated with Deltarune, Fangamer, Toby Fox or Materia Collective.
Our software is licensed under the EUPL (revision 1.2). You can read the license [here](./LICENSE.txt).